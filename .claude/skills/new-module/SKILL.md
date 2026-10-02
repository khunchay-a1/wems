---
name: new-module
description: สร้างโครงโมดูลใหม่ของ WEMS ตาม convention (NestJS module + domain + DTO + policy + test, route เว็บ, feature มือถือ) ใช้เมื่อเริ่มโมดูลหรือ resource ใหม่ที่ยังไม่มีโฟลเดอร์
argument-hint: "<ชื่อโมดูล kebab-case เช่น daily-reports>"
---

# สร้างโครงโมดูลใหม่

ชื่อโมดูล: $ARGUMENTS

ทำตามโมดูลที่มีอยู่แล้วเป็นแบบอย่าง (ดูโมดูล `documents` ก่อน) และ `docs/02-architecture.md` §4:

1. **API** `apps/api/src/modules/<name>/`
   - `<name>.module.ts` (ลงทะเบียนใน `AppModule`), `<name>.controller.ts`, `<name>.service.ts`
   - `domain/` — state machine (`assertTransition`) และกติกาที่เป็น pure function ตาม `docs/05-workflows.md`
   - `policies/` — `canX(user, entity, ctx)` ใช้ทั้งตรวจสิทธิ์และคำนวณ `allowedActions`/`blockedActions`
   - `dto/` — `*.request.dto.ts`, `*.response.dto.ts` พร้อม decorator OpenAPI (tag = ชื่อโมดูล, `operationId` แบบ `<Tag>_<verb><Noun>`)
   - `events.ts` — ชื่อ outbox event ของโมดูล และ handler ใน worker
   - เพิ่มรหัสสิทธิ์ใหม่ใน `permissions.ts` + `docs/data/seed/roles.json`; เพิ่ม error code ใน `errors.{th,en}.json`
   - test: `domain/*.spec.ts` (unit), `test/<name>.e2e-spec.ts` (integration/e2e)
2. **Web** `apps/web/src/app/(app)/.../<name>/` — `page.tsx`, hooks ของ TanStack Query ใน `src/features/<name>/`, ข้อความใน `messages/{th,en}.json`
3. **Mobile** (ถ้าโมดูลมีหน้าจอมือถือ) `apps/mobile/lib/features/<name>/{data,application,presentation}/` + ตาราง drift + ลงทะเบียน entity ที่ sync ใน `core/sync/`
4. **Sync** (ถ้ามือถือใช้ข้อมูลนี้) — เพิ่ม entity ในตาราง scopeKey ของ `docs/03-data-model.md` §8 และเขียน `ChangeLog` ใน service
5. รัน `pnpm api:contract`, `node tools/check-spec-refs.mjs` และ test ทั้งหมดของโมดูล แล้วสรุปไฟล์ที่สร้าง
