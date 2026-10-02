// Prisma 7 configuration — ดู docs/03-data-model.md §1
// Prisma 7 ไม่โหลด .env เอง: โหลด apps/api/.env ก่อน แล้วจึง .env ที่ root ของ repo (ค่าแรกที่พบชนะ)
import { config } from 'dotenv';
import { join } from 'node:path';
import { defineConfig, env } from 'prisma/config';

config({ path: [join(__dirname, '.env'), join(__dirname, '..', '..', '.env')], quiet: true });

export default defineConfig({
  // โฟลเดอร์ multi-file schema: ทุกไฟล์ *.prisma ในนี้รวมเป็น schema เดียว
  schema: 'prisma/schema',
  migrations: {
    path: 'prisma/migrations',
    // รันด้วย `pnpm --filter api prisma db seed` (Prisma 7 ไม่ seed อัตโนมัติหลัง migrate)
    seed: 'tsx prisma/seed/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
