# 10 · Roadmap และรายการงาน

> **วิธีใช้กับ Claude Code:** ทำทีละ task ตามลำดับ (หรือตาม dependency) โดยใช้ `/next-task` — อ่านสเปกที่อ้างถึง, วางแผน, เขียนโค้ด + test, ผ่าน Definition of Done แล้วติ๊ก `[x]` ในไฟล์นี้ใน commit เดียวกัน
> เฟส 2 เป็นต้นไปเป็นระดับ epic — **ก่อนเริ่มแต่ละเฟส** ให้ทบทวนสเปกโมดูลกับผู้ใช้จริง แตก epic เป็น task แบบเดียวกับเฟส 0–1 แล้วค่อยเขียนโค้ด

## Definition of Done (ทุก task)

1. โค้ดตามกติกาใน `CLAUDE.md` และ `.claude/rules/*`
2. Test ผ่าน: unit (domain logic ทุก transition/กติกา BR ที่แตะ), integration (service + DB จริง), e2e ตามเกณฑ์ของ task — ชื่อ test ขึ้นต้นด้วยรหัส BR/AT ที่ทดสอบ
3. `pnpm lint && pnpm typecheck && pnpm test` ผ่าน; มือถือ `flutter analyze && flutter test` ผ่าน
4. เปลี่ยน API → generate `openapi.json` + client ทั้ง web/mobile และ commit
5. เปลี่ยน schema → migration ใหม่ (ห้ามแก้ migration ที่ merge แล้ว) + อัปเดต `enum-labels.json` ถ้ามี enum
6. ข้อความ UI ใหม่มีทั้ง th และ en
7. สิทธิ์ถูกตรวจที่ API, มี audit/change log/outbox ตาม `03-data-model.md` §8
8. พฤติกรรมต่างจากสเปก → แก้สเปกใน commit เดียวกัน (หรือบันทึกใน `open-questions.md` ถ้าต้องให้บริษัทตัดสิน)

## เฟส 0 — Foundation

- [x] **P0-01 Monorepo** — pnpm workspaces + Turborepo, `packages/config` (tsconfig strict, ESLint, Prettier), `.editorconfig`, `.gitignore`, `.env.example`, script รวม `dev/build/lint/typecheck/test`
  - รับงาน: `pnpm install && pnpm lint && pnpm typecheck` ผ่านบน repo เปล่า
- [x] **P0-02 Infra dev** — `infra/docker-compose.yml`: PostgreSQL 16, Redis 7.2, S3-compatible storage (RustFS แทน MinIO — ADR-0007; + สร้าง bucket อัตโนมัติ), Mailpit, Gotenberg · อ้างอิง `02-architecture.md` §9
  - รับงาน: `docker compose up -d` ทุก service healthy; README มีขั้นตอน dev
- [x] **P0-03 API skeleton** — NestJS: config (ตรวจ env ด้วย zod), pino + requestId, prefix `/api/v1`, exception filter แบบ problem+json + catalog ข้อความ th/en, ValidationPipe (whitelist, forbidNonWhitelisted, transform), helmet, throttler, `/health/*`, Swagger (non-prod) · `04-api-conventions.md`
  - รับงาน: DTO ผิดได้ 400 problem+json มี `errors[]`; test ของ filter
- [x] **P0-04 Prisma** — Prisma 7 + `@prisma/adapter-pg`, `prisma.config.ts`, migration แรก (+ `CREATE EXTENSION pg_trgm`), `PrismaService`, helper `notDeleted()` และ optimistic update, serializer Decimal/Date, seed จาก `docs/data/seed/*`, CLI `create-admin` · `03-data-model.md`
  - รับงาน: migrate จาก DB ว่างผ่าน; seed รันซ้ำได้ผลเท่าเดิม; `prisma migrate diff` ว่าง
- [x] **P0-05 Authentication** — login (argon2id), ล็อกบัญชี, MFA TOTP, session + refresh หมุนเวียน + ตรวจการใช้ซ้ำ, cookie + CSRF (เว็บ), bearer (มือถือ), logout, `/auth/me`, เปลี่ยนรหัสผ่าน, PIN ลงนาม, จัดการ session · `06-security.md` §2
  - รับงาน: AT-PLT-01, AT-PLT-02; e2e ทั้งแบบ cookie และ bearer
- [x] **P0-06 Authorization และผู้ใช้** — `permissions.ts` (test ยืนยันว่าตรงกับ `roles.json`), `@RequirePermission` + guard, `ProjectAccessService`, cache สิทธิ์ด้วย `perms_ver`, API ผู้ใช้/บทบาท/แผนก/ใบอนุญาต/directory · `06-security.md` §3, M01
  - รับงาน: AT-PLT-03, AT-PLT-06; test ตาราง 404/403
- [x] **P0-07 Audit, change log, outbox, idempotency** — service ที่ทำงานใน transaction เดียว, outbox relay + BullMQ ใน `worker.ts`, interceptor `Idempotency-Key`, ตรวจ UUIDv7 จาก client · `02-architecture.md` §5–6, `04-api-conventions.md` §8
  - รับงาน: test ว่า rollback แล้วไม่มี audit/change/outbox ค้าง; relay 2 instance พร้อมกันส่ง event ละครั้งเดียว
- [x] **P0-08 Numbering** — token, reset, concurrency, API จัดการ + preview · M01 §4
  - รับงาน: AT-PLT-04; unit test token รวมปี พ.ศ.
- [x] **P0-09 Files** — upload-url/complete/download-url, worker (sha256, magic bytes, จำนวนหน้า, preview), attachments, cleanup · M01 §5
  - รับงาน: AT-PLT-05; integration test กับ S3-compatible storage ใน compose
- [x] **P0-10 Notifications** — handler สร้าง Notification, อีเมล (Handlebars th/en → Mailpit), push (FCM, stub ใน dev), SSE + Redis pub/sub, preferences, ปฏิทินวันทำการ · M01 §6, `05-workflows.md` §10
  - รับงาน: AT-PLT-07; e2e event → แถว notification + อีเมลใน Mailpit
- [x] **P0-11 PDF** — Gotenberg client, layout HTML ฐาน + ฟอนต์ Sarabun, header/footer เลขหน้า, บริการประทับตราด้วย pdf-lib · `02-architecture.md` §8
  - รับงาน: PDF ทดสอบย่อหน้าไทยยาวตัดคำถูก (ข้อความที่ extract ได้ตรงกับต้นฉบับ); แนบภาพตัวอย่างใน PR
- [x] **P0-12 OpenAPI pipeline** — `pnpm api:contract` สร้าง `openapi.json` + TS types, ตรวจรูปแบบ `operationId`, CI ตรวจว่าถูก commit · ADR-0002
- [ ] **P0-13 Web skeleton** — Next.js + Tailwind + shadcn/ui + next-intl (+ ป้าย enum) + TanStack Query + openapi-fetch (CSRF) + `proxy.ts`; layout; login/MFA; โปรไฟล์ (รหัสผ่าน, PIN, MFA); แจ้งเตือน + กระดิ่ง SSE; หน้าผู้ดูแลระบบของ M01; component กลางใน `07-web-ui.md` §3
  - รับงาน: Playwright: login → admin สร้างผู้ใช้ → ผู้ใช้ใหม่ login และเปลี่ยนรหัสผ่าน
- [ ] **P0-14 Mobile skeleton** — flavors, router, theme, l10n (+ ป้าย enum), API client ที่ generate, auth (secure storage, refresh single-flight), drift + migrations, sync engine (pull scope `global`/`user`, outbox processor), FCM, ตรวจเวอร์ชัน, หน้าตั้งค่า · `08-mobile.md`
  - รับงาน: unit test outbox/pull ครบตาม `08-mobile.md` §11; login กับ API dev ได้
- [ ] **P0-15 CI** — GitHub Actions ตาม `02-architecture.md` §9 พร้อม cache
- [x] **P0-16 Tools** — `tools/check-enum-labels.mjs` (มีแล้ว — ต่อเข้า CI), `tools/gen-i18n-enums.mjs` สร้างไฟล์แปลของ web และ ARB ของมือถือ

## เฟส 1 — MVP งานออกแบบและเอกสาร

- [ ] **P1-01 ลูกค้าและสถานที่** (API + เว็บ, ยกเว้นจุดเก็บตัวอย่าง) · M02 — รับงาน: AT-CRM-01..03
- [ ] **P1-02 โครงการและทีม** (API + เว็บ + เปลี่ยนสถานะ) · M03 — รับงาน: AT-PRJ-01..04
- [ ] **P1-03 Master data เอกสาร** — สาขา ประเภทเอกสาร แม่แบบ workflow (API + หน้าผู้ดูแล, ขั้นขนาน) · M04 §5
- [ ] **P1-04 ทะเบียนเอกสาร** — สร้าง (ออกเลข), รายการ/กรอง/ค้นหา trigram, รายละเอียด, แก้ (BR-DOC-011), hold/resume/cancel/supersede, แผนส่งมอบ, ส่งออก xlsx · M04 §3.1, §9 — รับงาน: AT-DOC-01, 14, 15
- [ ] **P1-05 นำเข้า Excel** — template, dry-run, commit · M04 §8 — รับงาน: AT-DOC-02
- [ ] **P1-06 Revision และไฟล์** — label (ทุก test vector ใน M04 §4), แก้, discard, void, อัปโหลดหลายเวอร์ชัน, ดาวน์โหลดพร้อมตราประทับ · M04 §3.2, §3.6
- [ ] **P1-07 Workflow ตรวจ/อนุมัติ** — submit (ใบอนุญาต แยกหน้าที่ บทบาท), เปิดขั้น/วันครบกำหนด, ตัดสิน + ลงนาม, มอบหมายแทน, ข้าม, ยกเลิกการตรวจ, อนุมัติ → ตัวชี้ฉบับใช้งาน + SUPERSEDED, งานเตือน · M04 §3.3–3.4, `05-workflows.md` §1–2 — รับงาน: AT-DOC-03..08, 13 และ unit test ครบทุกแถวของตาราง transition
- [ ] **P1-08 ความเห็นและ CRS** — API ความเห็น (anchor, mention, ตอบ/ปิด/เปิดใหม่), ยกความเห็นข้าม revision, CRS pdf/xlsx · M04 §6 — รับงาน: AT-DOC-06, 07, 09
- [ ] **P1-09 เว็บ: เอกสาร** — ทะเบียน, รายละเอียด, dialog ส่งตรวจ, หน้าตรวจเต็มจอ + PdfViewer + หมุด, การตอบความเห็น · `07-web-ui.md` §6.2–6.5 — รับงาน: Playwright ครอบคลุม AT-DOC-06, 07
- [ ] **P1-10 ใบนำส่ง** — API ครบ (ร่าง รายการ ส่ง ใบนำส่ง PDF อีเมลแนบ/ลิงก์ ZIP ลิงก์สาธารณะ รับเอกสาร ผลตอบกลับ เพิกถอน/ขยาย/ส่งซ้ำ), หน้า `/t/[token]`, หน้าจอเว็บ · M04 §3.5, §7 — รับงาน: AT-DOC-10..12
- [ ] **P1-11 Design basis** — API + หน้าจอ + อนุมัติลงนาม · M04 §3.7, `07-web-ui.md` §6.7
- [ ] **P1-12 งานของฉัน ค้นหา และรายงาน** — `/` งานของฉัน, `/reviews`, `/search`, ภาพรวมโครงการ, รายงาน MDL · M04 §9, `07-web-ui.md` §6.1
- [ ] **P1-13 มือถือ MVP** — ติดตามโครงการ, ทะเบียน/รายละเอียด (sync scope project), PDF (pdfrx), ปักหมุดออฟไลน์ + ตรวจ sha256 + แถบฉบับเก่า, กล่องงานตรวจ + ตัดสิน/ลงนาม, แจ้งเตือน + deep link · `08-mobile.md` §5–8 — รับงาน: สถานการณ์ integration ใน `08-mobile.md` §11
- [ ] **P1-14 ข้อมูลตัวอย่างสำหรับ UAT** — `prisma/seed/demo.ts`: ผู้ใช้ทุกบทบาท (รหัสผ่านจาก env), ลูกค้า 2, สถานที่ 3, โครงการ 2, เอกสาร 30 รายการหลายสถานะ, ใบอนุญาตทั้งที่ใช้ได้และหมดอายุ
- [ ] **P1-15 Hardening และ pilot** — ตรวจ audit ครบ, ทดสอบโหลด (k6: ทะเบียน 5,000 รายการ p95 < 500 ms), checklist ความปลอดภัย `06-security.md`, runbook backup/restore บน staging, UAT กับผู้ใช้จริง, pilot 1–2 โครงการ

## เฟส 2 — บริหารโครงการและหน้างาน (epic)

- [ ] P2-01 แผนงาน WBS + Gantt + ความคืบหน้าถ่วงน้ำหนัก + S-curve (M03)
- [ ] P2-02 งวดงาน (M03)
- [ ] P2-03 รายงานประจำวัน: API, เว็บ (ปฏิทิน/อนุมัติ), มือถือออฟไลน์, PDF (M05)
- [ ] P2-04 ปัญหาหน้างาน + รูป + หมุดบนแบบ (M05)
- [ ] P2-05 Checklist การตรวจ + แม่แบบ + PDF (M05)
- [ ] P2-06 คำถามหน้างาน ↔ revision (M05)
- [ ] P2-07 มือถือ: คิวอัปโหลดรูป, background sync, SQLCipher, หน้าสถานะ sync (`08-mobile.md` §5.3)

## เฟส 3 — ห้องปฏิบัติการและเก็บตัวอย่าง (epic)

- [ ] P3-01 Master data แล็บ + seed วิธีวิเคราะห์ + สูตร (มีหน้าทดลองคำนวณ) (M06)
- [ ] P3-02 งานวิเคราะห์ ตัวอย่าง ฉลาก QR (M06, M07)
- [ ] P3-03 รับตัวอย่าง + chain of custody (M06, M07)
- [ ] P3-04 Worklist, batch, บันทึกผล, engine คำนวณ + ปัดเศษ (M06 §2–3)
- [ ] P3-05 QC + control chart เบื้องต้น (M06)
- [ ] P3-06 ทบทวน/อนุมัติ + ประเมินมาตรฐาน + ResultAudit (M06)
- [ ] P3-07 ใบรายงานผล + ฉบับแก้ไข + ส่งอีเมล (M06)
- [ ] P3-08 เครื่องมือและการสอบเทียบ (M06)
- [ ] P3-09 ทริปเก็บตัวอย่าง (เว็บ) + รายการขวด + ฉลาก (M07)
- [ ] P3-10 มือถือ: เก็บตัวอย่างออฟไลน์ (M07, `08-mobile.md` §9)
- [ ] P3-11 เชื่อม Design basis กับผลแล็บ (BR-DOC-082) + กราฟแนวโน้มต่อจุดเก็บ

## เฟส 4 — ขาย การเงิน และรายงาน (epic)

- [ ] P4-01 ใบเสนอราคา + อนุมัติ + PDF (bahtText) + สร้างงาน/โครงการ (M08)
- [ ] P4-02 บันทึกการวางบิล + ส่งออกให้ระบบบัญชี (M08)
- [ ] P4-03 Timesheet + อัตราต้นทุน + รายงานต้นทุนแรงงาน (M08)
- [ ] P4-04 Dashboard ผู้บริหาร + รายงาน Excel + อีเมลสรุปรายสัปดาห์ (M09)

## เฟส 5 — การเชื่อมต่อและส่วนเสริม (เลือกตามความต้องการ)

- [ ] P5-01 SSO (OIDC: Microsoft Entra ID หรือ Google Workspace)
- [ ] P5-02 แจ้งเตือนผ่าน LINE Official Account (Messaging API — LINE Notify ปิดบริการแล้ว)
- [ ] P5-03 เชื่อมระบบบัญชีโดยตรง (ตามซอฟต์แวร์ที่บริษัทใช้)
- [ ] P5-04 Template รายการคำนวณออกแบบ (เช่น ขนาดถังปรับเสถียร ถังเติมอากาศ) ที่ผูกกับ design basis
- [ ] P5-05 ค้นหาข้อความใน PDF, เปรียบเทียบแบบ 2 revision, markup แบบวาดอิสระ
- [ ] P5-06 ลายมือชื่อดิจิทัลแบบใบรับรอง (PKI) บน PDF
- [ ] P5-07 Multipart upload สำหรับไฟล์ > 1 GB, BI/Data warehouse
