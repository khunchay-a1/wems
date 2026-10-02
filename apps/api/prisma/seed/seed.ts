/* eslint-disable no-console -- CLI entry point */
import 'reflect-metadata';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';
import { loadEnv } from '../../src/common/config/env';
import { seedMasterData } from './seed-data';

/** `pnpm --filter api prisma db seed` — master data only; no passwords are seeded (CLAUDE.md rule 11). */
async function main(): Promise<void> {
  const env = loadEnv();
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
  });
  try {
    await seedMasterData(prisma, (m) => console.log(`seed ${m}`));
    console.log(
      'seed done — create the first administrator with: pnpm --filter api cli create-admin',
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
