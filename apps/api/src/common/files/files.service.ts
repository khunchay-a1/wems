import { Injectable } from '@nestjs/common';
import type { FileObject } from '../../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/auth-user';
import { AppConfig } from '../config/app-config';
import { Problem } from '../errors/problem';
import { IdGenerator } from '../ids/id-generator';
import { OutboxService } from '../outbox/outbox.service';
import { iso, notDeleted, type Tx } from '../prisma/helpers';
import { PrismaService } from '../prisma/prisma.service';
import { ClockService } from '../time/clock';
import { FileAccessRegistry } from './file-access.registry';
import {
  contentDisposition,
  extensionOf,
  FILE_PURPOSES,
  type FilePurpose,
  isInlineType,
  storageKey,
} from './file-purposes';
import { StorageService } from './storage.service';

export interface FileView {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string | null;
  status: FileObject['status'];
  pageCount: number | null;
  hasPreview: boolean;
  createdAt: string;
  processedAt: string | null;
  uploadedById: string;
  rejectReason: string | null;
}

export function toFileView(f: FileObject): FileView {
  const meta = (f.metadata ?? {}) as { rejectReason?: string };
  return {
    id: f.id,
    originalName: f.originalName,
    mimeType: f.mimeType,
    sizeBytes: Number(f.sizeBytes),
    sha256: f.sha256,
    status: f.status,
    pageCount: f.pageCount,
    hasPreview: !!f.previewKey,
    createdAt: f.createdAt.toISOString(),
    processedAt: iso(f.processedAt),
    uploadedById: f.uploadedById,
    rejectReason: meta.rejectReason ?? null,
  };
}

const UPLOAD_URL_TTL_SEC = 15 * 60;
const DOWNLOAD_URL_TTL_SEC = 5 * 60;

/** Presigned upload → complete → worker processing → presigned download (docs/02-architecture.md §7). */
@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly registry: FileAccessRegistry,
    private readonly config: AppConfig,
    private readonly clock: ClockService,
    private readonly ids: IdGenerator,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
  ) {}

  async createUpload(
    user: AuthUser,
    input: { originalName: string; mimeType: string; sizeBytes: number; purpose: FilePurpose },
  ): Promise<{
    fileId: string;
    uploadUrl: string;
    method: 'PUT';
    headers: Record<string, string>;
    expiresAt: string;
  }> {
    const rule = FILE_PURPOSES[input.purpose];
    const ext = extensionOf(input.originalName);
    if (!(rule.extensions as readonly string[]).includes(ext)) {
      throw new Problem('UNSUPPORTED_FILE_TYPE', {
        errors: [{ field: 'originalName', code: 'EXTENSION_NOT_ALLOWED', message: ext }],
      });
    }
    if (input.sizeBytes > rule.maxBytes) {
      throw new Problem('FILE_TOO_LARGE', {
        errors: [{ field: 'sizeBytes', code: 'MAX', message: String(rule.maxBytes) }],
      });
    }
    const now = this.clock.now();
    const id = this.ids.next();
    const key = storageKey(this.config.env.NODE_ENV, now, id, input.originalName);
    const contentType = input.mimeType || 'application/octet-stream';
    await this.prisma.fileObject.create({
      data: {
        id,
        bucket: this.storage.bucket,
        storageKey: key,
        originalName: input.originalName.normalize('NFC').slice(0, 255),
        mimeType: contentType,
        sizeBytes: BigInt(input.sizeBytes),
        status: 'PENDING_UPLOAD',
        metadata: { purpose: input.purpose },
        uploadedById: user.id,
        createdAt: now,
      },
    });
    return {
      fileId: id,
      uploadUrl: await this.storage.presignPut(key, contentType, UPLOAD_URL_TTL_SEC),
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      expiresAt: new Date(now.getTime() + UPLOAD_URL_TTL_SEC * 1000).toISOString(),
    };
  }

  async complete(user: AuthUser, id: string): Promise<FileView> {
    const file = await this.prisma.fileObject.findFirst({ where: { id, ...notDeleted } });
    if (!file || file.uploadedById !== user.id) throw new Problem('NOT_FOUND');
    if (file.status !== 'PENDING_UPLOAD') return toFileView(file);
    const head = await this.storage.head(file.storageKey);
    if (!head) throw new Problem('FILE_NOT_UPLOADED');
    const purpose = ((file.metadata ?? {}) as { purpose?: FilePurpose }).purpose ?? 'ATTACHMENT';
    if (head.size > FILE_PURPOSES[purpose].maxBytes) throw new Problem('FILE_TOO_LARGE');
    const updated = await this.prisma.$transaction(async (tx) => {
      const f = await tx.fileObject.update({
        where: { id },
        data: { status: 'PROCESSING', sizeBytes: BigInt(head.size) },
      });
      await this.outbox.publish(tx, 'file.uploaded', { fileId: id, uploadedById: user.id }, id);
      return f;
    });
    return toFileView(updated);
  }

  async canRead(user: AuthUser, file: FileObject): Promise<boolean> {
    return file.uploadedById === user.id || (await this.registry.canRead(user, file.id));
  }

  async get(user: AuthUser, id: string): Promise<FileView> {
    const file = await this.prisma.fileObject.findFirst({ where: { id, ...notDeleted } });
    if (!file || !(await this.canRead(user, file))) throw new Problem('NOT_FOUND');
    return toFileView(file);
  }

  /** Presigned GET (5 min) with the original file name. */
  async downloadUrl(
    user: AuthUser,
    id: string,
    opts: { audit?: boolean } = {},
  ): Promise<{ url: string; expiresAt: string }> {
    const file = await this.prisma.fileObject.findFirst({ where: { id, ...notDeleted } });
    if (!file || !(await this.canRead(user, file))) throw new Problem('NOT_FOUND');
    if (file.status !== 'AVAILABLE') throw new Problem('DOC_FILE_NOT_AVAILABLE');
    if (opts.audit) {
      await this.prisma.$transaction((tx) =>
        this.audit.record(tx, {
          action: 'file.download',
          entityType: 'FileObject',
          entityId: id,
          summary: file.originalName,
        }),
      );
    }
    return this.signedDownload(file);
  }

  /** For callers that already checked access (e.g. stamped revision downloads, public transmittal links). */
  async signedDownload(
    file: FileObject,
    nameOverride?: string,
  ): Promise<{ url: string; expiresAt: string }> {
    const url = await this.storage.presignGet(
      file.storageKey,
      contentDisposition(nameOverride ?? file.originalName, isInlineType(file.mimeType)),
      file.mimeType,
      DOWNLOAD_URL_TTL_SEC,
    );
    return {
      url,
      expiresAt: new Date(this.clock.now().getTime() + DOWNLOAD_URL_TTL_SEC * 1000).toISOString(),
    };
  }

  async previewUrl(user: AuthUser, id: string): Promise<{ url: string; expiresAt: string }> {
    const file = await this.prisma.fileObject.findFirst({ where: { id, ...notDeleted } });
    if (!file || !(await this.canRead(user, file)) || !file.previewKey)
      throw new Problem('NOT_FOUND');
    const url = await this.storage.presignGet(
      file.previewKey,
      'inline; filename="preview.png"',
      'image/png',
      DOWNLOAD_URL_TTL_SEC,
    );
    return {
      url,
      expiresAt: new Date(this.clock.now().getTime() + DOWNLOAD_URL_TTL_SEC * 1000).toISOString(),
    };
  }

  /**
   * BR-PLT-020: a file used for review/sending must exist, be AVAILABLE, and belong to the user
   * (or be readable through an entity). Pass `requireAvailable: false` to allow attaching while processing.
   */
  async assertUsable(
    user: AuthUser,
    fileId: string,
    opts: { requireAvailable?: boolean; tx?: Tx } = {},
  ): Promise<FileObject> {
    const file = await (opts.tx ?? this.prisma).fileObject.findFirst({
      where: { id: fileId, ...notDeleted },
    });
    if (!file || !(await this.canRead(user, file))) {
      throw new Problem('VALIDATION_FAILED', { errors: [{ field: 'fileId', code: 'NOT_FOUND' }] });
    }
    if (file.status === 'REJECTED' || file.status === 'DELETED')
      throw new Problem('DOC_FILE_NOT_AVAILABLE');
    if ((opts.requireAvailable ?? true) && file.status !== 'AVAILABLE')
      throw new Problem('DOC_FILE_NOT_AVAILABLE');
    return file;
  }

  /** Stores a system-generated file (cover sheets, CRS, ZIP) and returns its FileObject. */
  async storeGenerated(
    tx: Tx | null,
    input: {
      name: string;
      mimeType: string;
      body: Buffer;
      uploadedById: string;
      sha256: string;
      pageCount?: number;
    },
  ): Promise<FileObject> {
    const now = this.clock.now();
    const id = this.ids.next();
    const key = storageKey(this.config.env.NODE_ENV, now, id, input.name);
    await this.storage.put(key, input.body, input.mimeType, input.body.length);
    return (tx ?? this.prisma).fileObject.create({
      data: {
        id,
        bucket: this.storage.bucket,
        storageKey: key,
        originalName: input.name,
        mimeType: input.mimeType,
        sizeBytes: BigInt(input.body.length),
        sha256: input.sha256,
        status: 'AVAILABLE',
        pageCount: input.pageCount ?? null,
        metadata: { purpose: 'SYSTEM_GENERATED' },
        uploadedById: input.uploadedById,
        createdAt: now,
        processedAt: now,
      },
    });
  }
}
