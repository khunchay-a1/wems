import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { promisify } from 'node:util';
import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { extensionOf } from '../../common/files/file-purposes';
import { detect, matchesExtension, mimeFor } from '../../common/files/magic';
import { StorageService } from '../../common/files/storage.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { OutboxJobData } from '../../common/queue/queues';
import { ClockService } from '../../common/time/clock';
import { RealtimePublisher } from '../../common/realtime/realtime.publisher';
import { HandlesEvents, type OutboxEventHandler } from '../handlers';

const run = promisify(execFile);
const HEAD_BYTES = 4096;

/**
 * files queue (M01 §5): sha256, magic-byte check, PDF page count and first-page preview (1024 px).
 * Idempotent — only files still PROCESSING are handled.
 */
@Injectable()
@HandlesEvents('file.uploaded')
export class FileProcessingHandler implements OutboxEventHandler {
  private readonly logger = new Logger(FileProcessingHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly clock: ClockService,
    private readonly realtime: RealtimePublisher,
  ) {}

  async handle(event: OutboxJobData): Promise<void> {
    const fileId = String(event.payload.fileId);
    const file = await this.prisma.fileObject.findUnique({ where: { id: fileId } });
    if (!file || file.status !== 'PROCESSING') return;

    const dir = await mkdtemp(join(tmpdir(), 'wems-file-'));
    const local = join(dir, 'blob');
    try {
      const hash = createHash('sha256');
      let head = Buffer.alloc(0);
      const tap = new Transform({
        transform(chunk: Buffer, _enc, cb) {
          hash.update(chunk);
          if (head.length < HEAD_BYTES) head = Buffer.concat([head, chunk]).subarray(0, HEAD_BYTES);
          cb(null, chunk);
        },
      });
      await pipeline(await this.storage.getStream(file.storageKey), tap, createWriteStream(local));
      const sha256 = hash.digest('hex');
      const ext = extensionOf(file.originalName);
      const detected = detect(head);
      const metadata = { ...((file.metadata ?? {}) as Record<string, unknown>), detected };

      if (!matchesExtension(ext, detected)) {
        await this.finish(fileId, file.uploadedById, {
          status: 'REJECTED',
          sha256,
          metadata: {
            ...metadata,
            rejectReason: detected === 'exe' ? 'EXECUTABLE' : 'TYPE_MISMATCH',
          },
        });
        return;
      }

      let pageCount: number | null = null;
      let previewKey: string | null = null;
      if (detected === 'pdf') {
        try {
          const { stdout } = await run('pdfinfo', [local], { timeout: 60_000 });
          const m = /^Pages:\s+(\d+)/m.exec(stdout);
          pageCount = m ? Number(m[1]) : null;
          await run(
            'pdftoppm',
            [
              '-png',
              '-f',
              '1',
              '-l',
              '1',
              '-scale-to',
              '1024',
              '-singlefile',
              local,
              join(dir, 'preview'),
            ],
            {
              timeout: 120_000,
            },
          );
          previewKey = `${file.storageKey}.preview.png`;
          const png = await readFile(join(dir, 'preview.png'));
          await this.storage.put(previewKey, png, 'image/png', png.length);
        } catch (err) {
          this.logger.warn({ err, fileId }, 'PDF could not be read');
          await this.finish(fileId, file.uploadedById, {
            status: 'REJECTED',
            sha256,
            metadata: { ...metadata, rejectReason: 'CORRUPT_PDF' },
          });
          return;
        }
      }
      await this.finish(fileId, file.uploadedById, {
        status: 'AVAILABLE',
        sha256,
        pageCount,
        previewKey,
        mimeType: mimeFor(detected, ext),
        metadata,
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  private async finish(
    fileId: string,
    uploadedById: string,
    data: Prisma.FileObjectUpdateManyMutationInput & { status: 'AVAILABLE' | 'REJECTED' },
  ): Promise<void> {
    const res = await this.prisma.fileObject.updateMany({
      where: { id: fileId, status: 'PROCESSING' },
      data: { ...data, processedAt: this.clock.now() },
    });
    if (res.count)
      await this.realtime.toUser(uploadedById, 'file.processed', { fileId, status: data.status });
  }
}
