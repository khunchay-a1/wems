---
paths:
  - "apps/api/prisma/**"
  - "apps/api/prisma.config.ts"
---

# กติกาฐานข้อมูล (Prisma 7)

- อ่าน `docs/03-data-model.md` ก่อนแก้ schema; ไฟล์ schema แยกตามโมดูลใน `apps/api/prisma/schema/`
- Model PascalCase เอกพจน์ + `@@map("snake_plural")`; ฟิลด์หลายคำต้องมี `@map("snake_case")`; relation หลายเส้นระหว่าง model คู่เดียวกันต้องตั้งชื่อ `@relation("<Model><Role>")`
- id: `String @id @default(uuid(7)) @db.Uuid` — ยกเว้น entity ที่มือถือสร้างออฟไลน์ ไม่มี `@default` (ดูตารางใน `03-data-model.md` §10)
- เงิน `Decimal(14,2)`, ผลวิเคราะห์ `Decimal(24,10)`, วันเวลา `Timestamptz(3)`, วันที่อย่างเดียว `@db.Date`
- entity ที่แก้ได้มี `version Int @default(1)`; entity ธุรกิจมี `deletedAt` (soft delete) — ดูข้อยกเว้นที่ห้ามลบใน §5
- เพิ่ม FK ที่ถูกใช้กรองบ่อย → เพิ่ม `@@index`
- เพิ่ม/แก้ enum → อัปเดต `docs/data/enum-labels.json` แล้วรัน `node tools/check-enum-labels.mjs`
- สร้าง migration ด้วย `prisma migrate dev --name <verb_noun>`; **ห้ามแก้ migration ที่ merge แล้ว**; ต้องการ SQL เอง (extension, partial index, trigger) ใช้ `--create-only` แล้วแก้ไฟล์ก่อน apply
- หลังแก้ schema: `prisma validate` → `prisma format` → migrate → `prisma generate` → อัปเดต seed ถ้ากระทบ
- Seed อ่านจาก `docs/data/seed/*` และต้อง upsert (รันซ้ำได้); ห้าม seed รหัสผ่านจริง
