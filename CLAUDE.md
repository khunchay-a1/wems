# WEMS — Water Engineering Management System

ระบบภายในของบริษัทออกแบบ/บริหารโครงการ/วิเคราะห์น้ำ: เว็บ (Next.js) + มือถือ (Flutter) + API (NestJS + PostgreSQL)
ผู้ใช้คือพนักงานเท่านั้น ลูกค้าได้รับเอกสารทางอีเมล/ลิงก์ดาวน์โหลดที่หมดอายุได้
**สถานะ:** monorepo scaffold แล้ว (P0-01: pnpm workspaces + Turborepo + `packages/config`) — ทำต่อที่ `/next-task` (task ถัดไปใน roadmap)

## ภาษา
- เอกสารสเปกเป็นภาษาไทย; โค้ด ชื่อตัวแปร commit message และ comment ในโค้ดเป็นภาษาอังกฤษ (อ้างรหัส BR ได้)
- ข้อความที่ผู้ใช้เห็นต้องผ่าน i18n เสมอ (ไทยเป็นค่าเริ่มต้น, อังกฤษรอง) — ห้าม hard-code

## อ่านอะไรก่อนทำงาน
| งาน | อ่าน |
|---|---|
| เริ่ม task ใดๆ | `docs/10-roadmap.md` (ลำดับงาน + Definition of Done) |
| ภาพรวม/ศัพท์ | `docs/00-overview.md`, `docs/01-glossary.md` |
| โครงสร้าง repo, stack, deploy | `docs/02-architecture.md` |
| ฐานข้อมูล | `docs/03-data-model.md` + `apps/api/prisma/schema/*.prisma` |
| สร้าง/แก้ endpoint | `docs/04-api-conventions.md` + หัวข้อ API ใน `docs/modules/Mxx-*.md` |
| logic เปลี่ยนสถานะ | `docs/05-workflows.md` |
| สิทธิ์ auth ลงนาม PDPA | `docs/06-security.md` |
| หน้าจอเว็บ / มือถือ | `docs/07-web-ui.md` / `docs/08-mobile.md` |
| ประสิทธิภาพ backup i18n | `docs/09-nfr.md` |
| test | `docs/11-testing.md` |
| เหตุผลการตัดสินใจ | `docs/adr/` |
| เรื่องที่ยังไม่ชัด | `docs/open-questions.md` |

กติกาธุรกิจมีรหัส `BR-<MOD>-nnn` และสถานการณ์รับงาน `AT-<MOD>-nn` ในไฟล์โมดูล — ใช้รหัสเหล่านี้ใน comment และชื่อ test

## ขอบเขตตามเฟส
- ทำเฉพาะงานของเฟสปัจจุบันใน roadmap (เฟส 0 → 1 → …) แม้ schema จะมีตารางของเฟสหลังแล้วก็ตาม — ห้ามสร้าง API/หน้าจอของโมดูลที่ยังไม่ถึงเฟส
- เฟส 1 (MVP) = M01 Platform, M02 ลูกค้า (ไม่รวมจุดเก็บตัวอย่าง), M03 โครงการ (ทะเบียน+ทีม), **M04 งานออกแบบและเอกสาร**, มือถือดูเอกสาร/อนุมัติ

## โครงสร้าง repo
```
apps/api      NestJS: src/main.ts (HTTP) + src/worker.ts (BullMQ, outbox relay, scheduler); prisma/schema/*.prisma
apps/web      Next.js App Router
apps/mobile   Flutter
packages/api-contract   openapi.json + TS types (generate — ห้ามแก้มือ)
packages/config         tsconfig/eslint/prettier ร่วม
docs/         สเปก · docs/data/seed/ ข้อมูลตั้งต้น · docs/data/enum-labels.json ป้าย enum
tools/        สคริปต์ตรวจสเปก
infra/        docker compose (dev/prod), Caddy
```

## คำสั่ง (สร้างใน P0-01…P0-16 — อัปเดตส่วนนี้เมื่อคำสั่งจริงต่างไป)
```bash
pnpm infra:up                                        # docker compose up -d --wait: postgres redis storage(S3) mailpit gotenberg
pnpm infra:down                                      # หยุด (ข้อมูลอยู่ใน volume; ล้างด้วย pnpm infra:reset)
corepack enable && pnpm install                     # pnpm ตาม "packageManager" ใน package.json
pnpm dev                                             # api + worker + web
pnpm --filter api dev:worker                         # worker เท่านั้น (outbox relay, BullMQ, งานตามเวลา)
pnpm lint && pnpm typecheck && pnpm test             # turbo run ทุก package (+ eslint ระดับ root สำหรับ tools/)
pnpm format:check                                    # prettier (pnpm format เพื่อแก้)
pnpm check:spec                                      # check-enum-labels + check-spec-refs
pnpm --filter api prisma migrate dev --name <name>
pnpm --filter api prisma db seed                     # master data จาก docs/data/seed (รันซ้ำได้)
pnpm --filter api cli create-admin --email <e> --name <n>   # ผู้ดูแลคนแรก (ไม่ระบุ --password = รหัสชั่วคราว)
pnpm --filter api dev                                # API ที่ http://localhost:4000/api/v1 (Swagger: /api/docs)
pnpm --filter api test                               # unit (src/**/*.spec.ts) + e2e (test/**/*.e2e-spec.ts, ใช้ DB wems_test)
pnpm api:contract                                    # openapi.json + TS types
cd apps/mobile && dart run swagger_parser && dart run build_runner build --delete-conflicting-outputs
cd apps/mobile && flutter analyze && flutter test
node tools/check-enum-labels.mjs && node tools/check-spec-refs.mjs
```

## กฎที่ห้ามละเมิด
1. **API เป็นผู้ตัดสินกติกาธุรกิจทั้งหมด** — web/mobile แสดงปุ่มจาก `allowedActions`/`blockedActions` ห้ามเขียนกติกาซ้ำฝั่ง client
2. **เปลี่ยนสถานะผ่าน action endpoint** (`POST /x/{id}/submit`) และ state machine ใน `domain/` ที่ตรงกับ `docs/05-workflows.md`; `PATCH` ห้ามแก้ `status`
3. **ทุกการเปลี่ยนข้อมูลอยู่ใน transaction เดียว**: ข้อมูล + `AuditLog` + `ChangeLog` (entity ที่ sync) + `OutboxEvent` (side effect) — ห้ามส่งอีเมล/push/สร้าง PDF ใน request
4. **สิทธิ์**: permission ของบทบาท + ขอบเขตโครงการ (`06-security.md` §3); ไม่มีสิทธิ์เห็น = 404, เห็นแต่ทำไม่ได้ = 403
5. **Optimistic locking**: ทุก PATCH/action ต้องส่งและตรวจ `version` → 409 `CONFLICT_STALE_VERSION`
6. **เงินและผลวิเคราะห์ใช้ Decimal** ตลอดทาง (JSON เป็น string) ห้ามใช้ float
7. **เวลา**: เก็บ UTC แสดง Asia/Bangkok (พ.ศ. เป็นค่าเริ่มต้น); โค้ดใช้ `ClockService` และ `IdGenerator` (UUIDv7) — ห้าม `new Date()`/`randomUUID()` ใน domain/service
8. **Error** เป็น problem+json มี `code` (และ `rule` = BR id) ข้อความแปลจาก catalog
9. **ห้ามแก้**: โค้ดที่ generate (`src/generated/`, `packages/api-contract/`, `lib/core/api/generated/`) และ migration ที่ merge แล้ว
10. **เปลี่ยน API** → `pnpm api:contract` + generate client มือถือ แล้ว commit ใน PR เดียวกัน; **เปลี่ยน enum** → อัปเดต `docs/data/enum-labels.json`
11. **ไม่มี secret ใน repo** — ใช้ `.env` (มี `.env.example`)
12. **Dependency**: ใช้เวอร์ชัน stable เท่านั้น, license MIT/BSD/Apache-2.0/ISC/OFL; แพ็กเกจใหม่ต้องระบุเหตุผลใน PR
13. **Test ทุกกติกาที่แตะ** ตั้งชื่อด้วยรหัส BR/AT; transition ทุกแถวในตาราง workflow ต้องมี test
14. **สเปกกับโค้ดต้องตรงกัน** — ทำต่างจากสเปกต้องแก้สเปกใน commit เดียวกัน; ประเด็นที่บริษัทต้องตัดสินให้เพิ่มใน `docs/open-questions.md` พร้อมค่าที่สมมติ แล้วทำงานต่อ

## ข้อควรระวังเรื่องเวอร์ชัน (ตรวจ ณ ก.ย. 2026)
- **pnpm 12** (ล็อกใน `packageManager`) + **Turborepo 2** — ติดตั้งผ่าน `corepack enable`; ค่าตั้ง workspace อยู่ใน `pnpm-workspace.yaml`
- **TypeScript 6.0.x** (ไม่ใช่ 7): npm tag `latest` ชี้ TypeScript 7 (native) แล้ว แต่ `typescript-eslint` 8.x รองรับ `<6.1` — ล็อก `typescript@6.0.3` จนกว่า typescript-eslint จะรองรับ 7; TS 6 ไม่ใส่ `@types/*` อัตโนมัติ จึงระบุ `"types": ["node"]` ใน preset
- **ESLint 10** flat config — preset กลาง `@wems/config/eslint` (`createConfig`) บังคับกฎข้อ 7 ใน `*.service.ts`/`domain/**` ด้วย `NEST_DETERMINISTIC_FILES`
- **NestJS 11** (ไม่ใช่ 12): Nest 12 (ส.ค. 2026) เป็น ESM-only แต่ API คอมไพล์เป็น CommonJS ตาม Prisma `moduleFormat = "cjs"` — ล็อก `@nestjs/*@11.2.x`; ด้วยเหตุเดียวกันจึงสร้าง UUIDv7 เองใน `src/common/ids/uuid.ts` (แพ็กเกจ `uuid` เป็น ESM-only)
- **Prisma 7**: URL อยู่ใน `apps/api/prisma.config.ts`; `PrismaClient` ต้องส่ง `adapter: new PrismaPg(...)`; generator `prisma-client` + `moduleFormat = "cjs"`; ไม่โหลด `.env` เอง; seed ต้องรัน `prisma db seed` เอง; npm tag `latest` เคยชี้ไป 8.0.0-rc — ติดตั้ง `prisma@7` จนกว่า 8 จะ GA
- **Next.js 16+**: ใช้ `proxy.ts` แทน `middleware.ts`
- **Flutter**: Material/Cupertino แยกเป็นแพ็กเกจ `material_ui`/`cupertino_ui` — ใช้ตาม template ของ `flutter create` เวอร์ชันที่ใช้ และห้าม import ปน
- **MinIO** เลิกเผยแพร่ Docker image แล้ว — dev ใช้ RustFS (S3-compatible) และ **Redis 7.4+** เปลี่ยน license — ใช้ 7.2 หรือ Valkey (ADR-0007); โค้ดใช้ S3 API มาตรฐานเท่านั้น
- **LINE Notify** ปิดบริการแล้ว — ถ้าต้องแจ้งเตือนผ่าน LINE ใช้ Messaging API (เฟส 5)

## วิธีทำงาน
- ทำทีละ task ด้วย `/next-task [task-id]`; ตรวจความครบก่อน PR ด้วย `/spec-check Mxx`; สร้างโมดูลใหม่ด้วย `/new-module <name>`
- Branch `feat/<task-id>-<slug>`, commit แบบ conventional commits (`feat(documents): P1-04 ...`)
- ก่อนจบงาน: lint + typecheck + test + เครื่องมือตรวจสเปกผ่าน และติ๊ก `[x]` ใน roadmap
- กติกาเฉพาะส่วนอยู่ใน `.claude/rules/` (โหลดเมื่อแตะไฟล์ใน `apps/api`, `apps/api/prisma`, `apps/web`, `apps/mobile`)
