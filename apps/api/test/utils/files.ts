import type { INestApplication } from '@nestjs/common';
import { FileProcessingHandler } from '../../src/worker/handlers/file-processing.handler';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import type { BearerClient } from './http';

/** Upload through the real presigned flow; optionally run the worker's processing step inline. */
export async function uploadFile(
  app: INestApplication,
  c: BearerClient,
  name: string,
  body: Buffer,
  opts: { purpose?: string; mimeType?: string; process?: FileProcessingHandler } = {},
): Promise<string> {
  const mimeType =
    opts.mimeType ?? (name.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream');
  const res = await c
    .post('/api/v1/files/upload-url')
    .send({
      originalName: name,
      mimeType,
      sizeBytes: body.length,
      purpose: opts.purpose ?? 'DOCUMENT_REVISION',
    })
    .expect(201);
  const put = await fetch(res.body.uploadUrl, {
    method: 'PUT',
    headers: res.body.headers,
    body: new Uint8Array(body),
  });
  if (!put.ok) throw new Error(`S3 PUT failed ${put.status} ${await put.text()}`);
  await c.post(`/api/v1/files/${res.body.fileId}/complete`).expect(200);
  if (opts.process) {
    const prisma = app.get(PrismaService);
    const ev = await prisma.outboxEvent.findFirstOrThrow({
      where: { type: 'file.uploaded', aggregateId: res.body.fileId },
    });
    await opts.process.handle({
      eventId: ev.id,
      type: ev.type,
      payload: ev.payload as Record<string, unknown>,
      aggregateId: ev.aggregateId,
      createdAt: '',
    });
  }
  return res.body.fileId as string;
}
