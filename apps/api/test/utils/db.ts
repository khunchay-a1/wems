import type { PrismaClient } from '../../src/generated/prisma/client';

/** Master data seeded once in global-setup — kept between test files. */
const KEEP = new Set([
  '_prisma_migrations',
  'roles',
  'role_permissions',
  'numbering_schemes',
  'settings',
  'disciplines',
  'document_types',
  'workflow_templates',
  'workflow_template_steps',
  'parameters',
  'regulatory_standards',
  'standard_limits',
]);

/** TRUNCATE every business table (docs/11-testing.md §2) before each test file. */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
  const tables = rows.map((r) => r.tablename).filter((t) => !KEEP.has(t));
  if (tables.length) {
    await prisma.$executeRawUnsafe(
      `TRUNCATE ${tables.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`,
    );
  }
}
