---
paths:
  - "apps/api/src/**"
  - "apps/api/test/**"
  - "apps/api/templates/**"
---

# กติกาโค้ด API (NestJS)

- โครงสร้างโมดูลและกติกาชั้นตาม `docs/02-architecture.md` §4: controller บาง → service (use case + transaction) → `domain/*` (pure function) — controller ห้ามเรียก Prisma
- ทุก use case ที่เปลี่ยนข้อมูลทำใน `prisma.$transaction` เดียว: เปลี่ยนข้อมูล → `AuditService.record` → `ChangeLogService.touch` (entity ที่ sync) → `OutboxService.publish` (side effect) — ห้ามส่งอีเมล/push/สร้าง PDF ใน request
- เปลี่ยนสถานะผ่าน action endpoint + `assertTransition()` จาก `domain/*-state-machine.ts` ที่ตรงกับ `docs/05-workflows.md` เท่านั้น
- ทุก `PATCH`/action รับ `version` และใช้ helper optimistic update; ไม่ตรง → `ConflictProblem('CONFLICT_STALE_VERSION')`
- สิทธิ์: `@RequirePermission()` ที่ controller + `ProjectAccessService.assertAccess()` ใน service สำหรับข้อมูลในโครงการ; ไม่มีสิทธิ์เห็น = 404
- Response DTO เสมอ (ห้ามคืน Prisma object); resource ที่มีสถานะต้องมี `allowedActions`/`blockedActions` จาก policy function เดียวกับที่ใช้ตรวจสิทธิ์
- Error: throw `Problem` พร้อม `code` (และ `rule` = BR id ถ้ามี) + ข้อความใน `src/common/i18n/errors.{th,en}.json` — ห้าม throw `Error` เปล่าหรือส่งข้อความ DB ออกไป
- เงิน/ผลวิเคราะห์ใช้ `Prisma.Decimal` ตลอดทาง; วันที่อย่างเดียวเป็น `YYYY-MM-DD`
- เวลาใช้ `ClockService`, id ใช้ `IdGenerator` (UUIDv7) — ห้าม `new Date()`/`Date.now()`/`randomUUID()` ใน service/domain
- Log ด้วย pino logger ที่ inject — ห้าม `console.log`; ห้าม log รหัสผ่าน token secret
- BullMQ handler ต้อง idempotent (รันซ้ำได้); jobId = outbox event id
- DTO ต้องมี decorator OpenAPI ครบ (enum ใช้ `enumName`) และ `operationId` แบบ `<Tag>_<verb><Noun>`; เปลี่ยน API แล้วรัน `pnpm api:contract` และ commit ผลลัพธ์
- Test: ชื่อขึ้นต้นด้วย BR/AT id; domain test ครอบคลุมทุกแถวของตาราง transition; integration test ใช้ DB จริง (ดู `docs/11-testing.md`)
