// Prisma 7 configuration — ดู docs/03-data-model.md §1
// Prisma 7 ไม่โหลด .env เอง จึง import "dotenv/config" (ติดตั้ง dotenv เป็น dependency ของ apps/api)
import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

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
