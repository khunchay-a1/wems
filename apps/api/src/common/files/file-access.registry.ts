import { Injectable } from '@nestjs/common';
import type { AttachmentOwnerType } from '../../generated/prisma/client';
import type { AuthUser } from '../auth/auth-user';

/** A module that links files to its entities grants read access through a resolver (M01 §8: "สิทธิ์จาก entity ที่ผูก"). */
export type FileReadResolver = (user: AuthUser, fileId: string) => Promise<boolean>;

export interface AttachmentOwnerPolicy {
  /** Throws NOT_FOUND when the owner is invisible to the user */
  assertCanRead(user: AuthUser, ownerId: string): Promise<{ projectId?: string | null }>;
  /** Throws FORBIDDEN/NOT_FOUND when the user may not add/remove attachments */
  assertCanEdit(user: AuthUser, ownerId: string): Promise<{ projectId?: string | null }>;
}

@Injectable()
export class FileAccessRegistry {
  private readonly resolvers: FileReadResolver[] = [];
  private readonly owners = new Map<AttachmentOwnerType, AttachmentOwnerPolicy>();

  registerReader(resolver: FileReadResolver): void {
    this.resolvers.push(resolver);
  }

  registerOwner(type: AttachmentOwnerType, policy: AttachmentOwnerPolicy): void {
    this.owners.set(type, policy);
  }

  owner(type: AttachmentOwnerType): AttachmentOwnerPolicy | undefined {
    return this.owners.get(type);
  }

  async canRead(user: AuthUser, fileId: string): Promise<boolean> {
    for (const r of this.resolvers) if (await r(user, fileId)) return true;
    return false;
  }
}
