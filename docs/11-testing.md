# 11 · กลยุทธ์การทดสอบ

## 1. ระดับการทดสอบ

| ระดับ | ทดสอบอะไร | เครื่องมือ | รันเมื่อ |
|---|---|---|---|
| Unit — domain | state machine, label revision, สิทธิ์/eligibility, numbering token, working days, สูตรคำนวณ, ปัดเศษ, compliance, bahtText | Jest/Vitest (API), `flutter_test` | ทุก commit |
| Integration — API | service + PostgreSQL จริง + S3-compatible storage + Redis: transaction, audit/change/outbox, concurrency, file flow | Jest + Testcontainers (หรือ service container ใน CI) | ทุก PR |
| E2E — API | HTTP ครบวงจรตาม AT-xxx (สิทธิ์ 401/403/404, problem+json, idempotency) | Supertest | ทุก PR |
| E2E — Web | flow หลักของผู้ใช้ | Playwright กับ stack docker compose + seed demo | ทุก PR (smoke) / nightly (ครบ) |
| Mobile | outbox/pull/เอกสารออฟไลน์, widget หลัก, integration | `flutter_test`, `integration_test` | ทุก PR (unit/widget) / ก่อน release (integration) |
| Performance | ทะเบียน 5,000 รายการ, pull sync, ส่งตรวจพร้อมกัน | k6 | ก่อน release แต่ละเฟส |
| Security | dependency audit, ZAP baseline scan บน staging | `pnpm audit`, OWASP ZAP | ทุก PR / nightly |

## 2. กติกา

- ชื่อ test ขึ้นต้นด้วยรหัสกติกา/สถานการณ์: `it('BR-DOC-042 rejects preparer as checker', …)`, `test('AT-DOC-07 approve with signature', …)` — ใช้ grep ตรวจว่าทุก BR ใน M04 มี test อย่างน้อย 1 ตัว (`tools/check-spec-refs.mjs --tests`)
- ตาราง transition ใน `05-workflows.md` ต้องมี test ครบทุกแถว (ทั้งกรณีผ่านและกรณีถูกปฏิเสธเพราะ guard)
- เวลา: ห้ามเรียก `new Date()` ตรงใน domain/service — ฉีด `ClockService` (ทดสอบวันครบกำหนด ใบอนุญาตหมดอายุ holding time ด้วยเวลาคงที่); เขตเวลาใน test = `Asia/Bangkok`
- ID: ฉีด `IdGenerator` เพื่อให้ snapshot คงที่ใน test
- ภายนอก: SMTP → Mailpit (ตรวจอีเมลผ่าน Mailpit API), FCM → fake adapter ที่เก็บข้อความไว้ตรวจ, Gotenberg → container จริงใน integration และ fake ใน unit
- ฐานข้อมูลใน integration test: migrate ครั้งเดียวต่อ run แล้ว `TRUNCATE ... CASCADE` ทุกตาราง (ยกเว้น master data ที่ seed) ก่อนแต่ละไฟล์ test — `apps/api/test/global-setup.ts` สร้าง DB `wems_test` ใหม่ด้วยการรัน `migration.sql` ทุกไฟล์ตามลำดับ (ไม่ต้องใช้ Prisma CLI) แล้ว seed; ตั้ง `TEST_DATABASE_URL` เพื่อชี้ DB อื่น
- ห้าม test พึ่งลำดับการรันของกันและกัน

## 3. Test data

- **Factory** (`apps/api/test/factories/`): `makeUser({ roles, license })`, `makeProject({ members })`, `makeDocument({ type, discipline })`, `makeRevision({ status, files })`, `makeCycle(...)` — คืน entity ที่บันทึกแล้ว ค่า default สมเหตุสมผล
- **Seed demo** (`prisma/seed/demo.ts`, P1-14): สำหรับ Playwright/UAT
  - ผู้ใช้: `admin@`, `pm@`, `eng1@` (กว. สามัญ โยธา ยังไม่หมดอายุ), `eng2@` (กว. ภาคี หมดอายุแล้ว), `drafter@`, `dc@`, `site@`, `exec@` — โดเมน `@demo.wems.local`, รหัสผ่านจาก env `DEMO_PASSWORD`
  - ลูกค้า 2 ราย (โรงงาน + อาคาร ประเภท ข), สถานที่ 3, โครงการ 2 (`P26-001` ACTIVE, `P26-002` PLANNING)
  - เอกสาร 30 รายการใน `P26-001`: ครบทุกสถานะ revision, มีรอบตรวจค้าง/เลยกำหนด, มีความเห็น OPEN/RESPONDED, มีใบนำส่ง SENT พร้อมผลตอบกลับ CODE_2 และ CODE_3
  - PDF ตัวอย่างอยู่ใน `apps/api/test/fixtures/pdf/` (สร้างเองด้วย Gotenberg — ห้ามใช้แบบจริงของลูกค้า)

## 4. Checklist ทดสอบด้วยมือก่อนปล่อยแต่ละเฟส

- [ ] ฟอนต์และการตัดคำภาษาไทยใน PDF ทุกชนิด (ใบนำส่ง, CRS, รายงาน)
- [ ] วันที่ พ.ศ./ค.ศ. บนเว็บ มือถือ PDF อีเมล ตรงกัน และเป็นเวลาไทย
- [ ] อีเมลเปิดบน Outlook และ Gmail แสดงภาษาไทยถูกต้อง
- [ ] มือถือ Android และ iOS จริง อย่างละ 1 เครื่อง: ออฟไลน์ → ออนไลน์, push, deep link
- [ ] ลิงก์ใบนำส่งเปิดจากเครื่องที่ไม่ได้ล็อกอิน และหมดอายุ/เพิกถอนได้จริง
- [ ] สำรองและกู้คืนฐานข้อมูล + ไฟล์บน staging สำเร็จ
