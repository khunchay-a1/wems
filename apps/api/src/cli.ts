/* eslint-disable no-console -- CLI entry point */
import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { uuidv7 } from './common/ids/uuid';
import { checkPasswordPolicy, hashSecret } from './common/auth/password';
import { loadEnv } from './common/config/env';
import { PrismaClient } from './generated/prisma/client';

/**
 * Operations CLI.
 *   pnpm --filter api cli create-admin --email admin@company.co.th --name "ผู้ดูแลระบบ" [--password ...]
 * Without --password a random temporary password is printed and must be changed at first sign-in.
 */
function arg(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}

async function createAdmin(prisma: PrismaClient, argv: string[]): Promise<void> {
  const email = arg(argv, 'email')?.trim().toLowerCase();
  const name = arg(argv, 'name')?.trim();
  if (!email || !name)
    throw new Error('usage: create-admin --email <email> --name <display name> [--password <pw>]');
  let password = arg(argv, 'password');
  const temporary = !password;
  password ??= randomBytes(12).toString('base64url');
  const violation = checkPasswordPolicy(password, { email, names: [name] });
  if (violation) throw new Error(`password rejected by policy: ${violation}`);
  const role = await prisma.role.findUnique({ where: { code: 'ADMIN' } });
  if (!role) throw new Error('ADMIN role missing — run `pnpm --filter api prisma db seed` first');
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new Error(`user ${email} already exists`);
  const id = uuidv7();
  await prisma.$transaction([
    prisma.user.create({
      data: {
        id,
        email,
        displayNameTh: name,
        passwordHash: await hashSecret(password),
        mustChangePassword: temporary,
        roles: { create: { roleId: role.id } },
      },
    }),
    prisma.auditLog.create({
      data: {
        actorType: 'SYSTEM',
        action: 'user.create_admin',
        entityType: 'User',
        entityId: id,
        summary: `CLI created administrator ${email}`,
      },
    }),
  ]);
  console.log(`created administrator ${email} (${id})`);
  if (temporary) console.log(`temporary password: ${password}  (must be changed at first sign-in)`);
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  const env = loadEnv();
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
  });
  try {
    switch (command) {
      case 'create-admin':
        await createAdmin(prisma, rest);
        break;
      default:
        console.log('commands: create-admin');
        process.exitCode = command ? 1 : 0;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
