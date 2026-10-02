import { Injectable } from '@nestjs/common';
import { Prisma, type Attachment, type FileObject } from '../../../generated/prisma/client';
import { AuditService } from '../../../common/audit/audit.service';
import type { AuthUser } from '../../../common/auth/auth-user';
import { Problem } from '../../../common/errors/problem';
import { FileAccessRegistry } from '../../../common/files/file-access.registry';
import { FilesService, toFileView } from '../../../common/files/files.service';
import { IdGenerator, isAcceptableClientUuidV7 } from '../../../common/ids/id-generator';
import { decimalToString, iso, notDeleted } from '../../../common/prisma/helpers';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { ClockService } from '../../../common/time/clock';
import type { AttachmentDto, CreateAttachmentDto } from './dto/files.dto';

function toDto(a: Attachment & { file: FileObject }): AttachmentDto {
  return {
    id: a.id,
    ownerType: a.ownerType,
    ownerId: a.ownerId,
    file: toFileView(a.file),
    caption: a.caption,
    sortOrder: a.sortOrder,
    takenAt: iso(a.takenAt),
    latitude: decimalToString(a.latitude),
    longitude: decimalToString(a.longitude),
    createdById: a.createdById,
    createdAt: a.createdAt.toISOString(),
  };
}

/** Polymorphic attachments; access is delegated to the owner's policy (M01 §8). */
@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: FileAccessRegistry,
    private readonly files: FilesService,
    private readonly audit: AuditService,
    private readonly ids: IdGenerator,
    private readonly clock: ClockService,
  ) {
    // Attachments make their files readable to whoever can read the owner
    registry.registerReader(async (user, fileId) => {
      const atts = await this.prisma.attachment.findMany({
        where: { fileId, ...notDeleted },
        take: 20,
      });
      for (const a of atts) {
        const policy = this.registry.owner(a.ownerType);
        if (!policy) continue;
        try {
          await policy.assertCanRead(user, a.ownerId);
          return true;
        } catch {
          /* not readable via this owner */
        }
      }
      return false;
    });
  }

  private policy(user: AuthUser, ownerType: CreateAttachmentDto['ownerType']) {
    const p = this.registry.owner(ownerType);
    if (!p)
      throw new Problem('VALIDATION_FAILED', {
        errors: [{ field: 'ownerType', code: 'NOT_SUPPORTED_YET' }],
      });
    return p;
  }

  async list(
    user: AuthUser,
    ownerType: CreateAttachmentDto['ownerType'],
    ownerId: string,
  ): Promise<AttachmentDto[]> {
    await this.policy(user, ownerType).assertCanRead(user, ownerId);
    const rows = await this.prisma.attachment.findMany({
      where: { ownerType, ownerId, ...notDeleted },
      include: { file: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(toDto);
  }

  async create(
    user: AuthUser,
    dto: CreateAttachmentDto,
  ): Promise<{ created: boolean; attachment: AttachmentDto }> {
    const { projectId } = await this.policy(user, dto.ownerType).assertCanEdit(user, dto.ownerId);
    if (dto.id) {
      if (!isAcceptableClientUuidV7(dto.id, this.clock.now())) {
        throw new Problem('VALIDATION_FAILED', {
          errors: [{ field: 'id', code: 'INVALID_UUID_V7' }],
        });
      }
      const existing = await this.prisma.attachment.findUnique({
        where: { id: dto.id },
        include: { file: true },
      });
      if (existing) {
        if (existing.createdById !== user.id) throw new Problem('DUPLICATE');
        return { created: false, attachment: toDto(existing) };
      }
    }
    await this.files.assertUsable(user, dto.fileId, { requireAvailable: false });
    const id = dto.id ?? this.ids.next();
    const created = await this.prisma.$transaction(async (tx) => {
      const count = await tx.attachment.count({
        where: { ownerType: dto.ownerType, ownerId: dto.ownerId, ...notDeleted },
      });
      const a = await tx.attachment.create({
        data: {
          id,
          ownerType: dto.ownerType,
          ownerId: dto.ownerId,
          fileId: dto.fileId,
          caption: dto.caption ?? null,
          sortOrder: count,
          takenAt: dto.takenAt ? new Date(dto.takenAt) : null,
          latitude: dto.latitude ? new Prisma.Decimal(dto.latitude) : null,
          longitude: dto.longitude ? new Prisma.Decimal(dto.longitude) : null,
          createdById: user.id,
          createdAt: this.clock.now(),
        },
        include: { file: true },
      });
      await this.audit.record(tx, {
        action: 'attachment.create',
        entityType: 'Attachment',
        entityId: id,
        projectId: projectId ?? null,
        summary: `${dto.ownerType}:${dto.ownerId} ${a.file.originalName}`,
      });
      return a;
    });
    return { created: true, attachment: toDto(created) };
  }

  async remove(user: AuthUser, id: string): Promise<void> {
    const a = await this.prisma.attachment.findFirst({ where: { id, ...notDeleted } });
    if (!a) throw new Problem('NOT_FOUND');
    const { projectId } = await this.policy(user, a.ownerType).assertCanEdit(user, a.ownerId);
    await this.prisma.$transaction(async (tx) => {
      await tx.attachment.update({ where: { id }, data: { deletedAt: this.clock.now() } });
      await this.audit.record(tx, {
        action: 'attachment.delete',
        entityType: 'Attachment',
        entityId: id,
        projectId: projectId ?? null,
      });
    });
  }
}
