import { hashSecret } from '../../src/common/auth/password';
import { uuidv7 } from '../../src/common/ids/uuid';
import type { LicenseBranch, LicenseLevel, PrismaClient } from '../../src/generated/prisma/client';

export const DEFAULT_PASSWORD = 'correct horse battery staple';
let hashCache: Promise<string> | undefined;

export interface MakeUserOptions {
  email?: string;
  name?: string;
  roles?: string[];
  password?: string;
  mustChangePassword?: boolean;
  isActive?: boolean;
  signingPin?: string;
  license?: { branch?: LicenseBranch; level?: LicenseLevel; expiresAt: string; verified?: boolean };
}

let seq = 0;

/** makeUser({ roles, license }) — docs/11-testing.md §3. Returns the saved user. */
export async function makeUser(prisma: PrismaClient, opts: MakeUserOptions = {}) {
  seq += 1;
  const email = (opts.email ?? `user${seq}-${Date.now()}@test.wems.local`).toLowerCase();
  const passwordHash =
    opts.password && opts.password !== DEFAULT_PASSWORD
      ? await hashSecret(opts.password)
      : await (hashCache ??= hashSecret(DEFAULT_PASSWORD));
  const roles = await prisma.role.findMany({ where: { code: { in: opts.roles ?? [] } } });
  const id = uuidv7();
  const user = await prisma.user.create({
    data: {
      id,
      email,
      displayNameTh: opts.name ?? `ผู้ใช้ทดสอบ ${seq}`,
      passwordHash,
      mustChangePassword: opts.mustChangePassword ?? false,
      isActive: opts.isActive ?? true,
      signingPinHash: opts.signingPin ? await hashSecret(opts.signingPin) : null,
      roles: { create: roles.map((r) => ({ roleId: r.id })) },
    },
  });
  if (opts.license) {
    await prisma.professionalLicense.create({
      data: {
        userId: id,
        type: 'ENGINEER',
        branch: opts.license.branch ?? 'CIVIL',
        level: opts.license.level ?? 'PROFESSIONAL',
        licenseNo: `สย.${seq}${Date.now() % 100000}`,
        expiresAt: new Date(`${opts.license.expiresAt}T00:00:00.000Z`),
        verifiedAt: opts.license.verified === false ? null : new Date('2026-01-01T00:00:00Z'),
      },
    });
  }
  return user;
}
