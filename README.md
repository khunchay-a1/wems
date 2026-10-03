# WEMS — ชุดสเปกสำหรับพัฒนาด้วย Claude Code

ชุดนี้คือจุดเริ่มต้นของ repository ระบบบริหารงานสำหรับบริษัทที่ **ออกแบบระบบน้ำ บริหารโครงการ และวิเคราะห์คุณภาพน้ำ** มีทั้งเว็บ (Next.js) มือถือ (Flutter) และ API (NestJS + PostgreSQL) — ยังไม่มีโค้ดแอป มีสเปก, Prisma schema ที่ตรวจแล้ว, ข้อมูลตั้งต้น, และคำสั่ง/skill ให้ Claude Code เขียนโปรแกรมต่อทีละ task

## เริ่มใช้งาน

1. สร้าง git repository ใหม่ แล้วแตกไฟล์ชุดนี้ไว้ที่ root (`CLAUDE.md` ต้องอยู่ชั้นบนสุด)
2. เครื่องที่ใช้พัฒนาต้องมี: Node.js 22 (≥ 22.12), Docker, Flutter (stable), Git — pnpm ติดตั้งผ่าน `corepack enable` (เวอร์ชันล็อกใน `package.json`) แล้วรัน `pnpm install`
3. อ่านและตอบ `docs/open-questions.md` อย่างน้อย Q01–Q09 (ถ้ายังไม่ตอบ ระบบจะใช้ค่าที่สมมติไว้ไปก่อน)
4. เปิด Claude Code ที่ root ของ repo แล้วรัน `/context` เพื่อตรวจว่า `CLAUDE.md` ถูกโหลด
5. สั่ง `/next-task P0-01` แล้วทำต่อทีละ task ตาม `docs/10-roadmap.md` (หลังจากนั้นพิมพ์ `/next-task` เฉยๆ ได้)
6. ก่อนเปิด PR แต่ละโมดูล ใช้ `/spec-check M04` (เปลี่ยนเลขโมดูลตามงาน)

## พัฒนาในเครื่อง (local dev)

ต้องมี Docker Desktop (Windows/macOS) หรือ Docker Engine + Compose v2 (Linux)

```bash
cp .env.example .env            # Windows PowerShell: Copy-Item .env.example .env
corepack enable
pnpm install
pnpm infra:up                   # = docker compose -f infra/docker-compose.yml up -d --wait
pnpm infra:ps                   # ทุก service ต้องเป็น (healthy)
```

| Service | พอร์ตในเครื่อง | ใช้ทำอะไร |
|---|---|---|
| postgres (16) | 5432 | DB `wems` และ `wems_test` (user/pass `wems`/`wems`) |
| redis (7.2) | 6379 | BullMQ, cache, pub/sub |
| storage (RustFS, S3-compatible) | 9000 (S3), 9001 (console) | bucket `wems-dev`, `wems-test` สร้างอัตโนมัติ — key `wemsdev` / `wemsdev-secret-change-me` |
| mailpit | 1025 (SMTP), 8025 (UI) | ดูอีเมลที่ระบบส่งที่ http://localhost:8025 |
| gotenberg (Chromium) | 3001 | HTML → PDF |

- เปลี่ยนพอร์ตที่ชนได้ด้วยตัวแปร `WEMS_*_PORT` ก่อนรัน (ดูใน `infra/docker-compose.yml`) แล้วแก้ค่าใน `.env` ให้ตรง
- `pnpm infra:down` หยุด (ข้อมูลยังอยู่), `pnpm infra:reset` ลบข้อมูลทั้งหมด, `pnpm infra:logs` ดู log
- ค่ารหัสผ่านในนี้ใช้ในเครื่องนักพัฒนาเท่านั้น
- ทำไมใช้ RustFS แทน MinIO และ Redis 7.2: ดู `docs/adr/0007-local-infra-images.md`

### เปิดระบบและข้อมูลตัวอย่าง

```bash
pnpm --filter api prisma migrate deploy        # สร้างตาราง
pnpm --filter api prisma db seed               # master data (บทบาท สาขา ประเภทเอกสาร workflow มาตรฐาน …)
pnpm --filter api cli create-admin --email admin@company.co.th --name "ผู้ดูแลระบบ"
pnpm --filter api build
DEMO_PASSWORD='ตั้งรหัสผ่านอย่างน้อย 12 ตัว' pnpm --filter api seed:demo   # (ไม่บังคับ) ผู้ใช้ทุกบทบาท ลูกค้า 2 โครงการ 2 เอกสาร 30 ฉบับ
pnpm dev                                        # เว็บ http://localhost:3000 · API http://localhost:4000/api/v1 · Swagger /api/docs
```

แอปมือถือ (Flutter): ดู `apps/mobile/README.md` — `flutter run --flavor dev -t lib/main_dev.dart --dart-define-from-file=env/dev.json`

ผู้ใช้ตัวอย่าง: `pm@demo.wems.local`, `eng1@demo.wems.local` (ผู้ออกแบบ), `eng2@demo.wems.local` (ผู้ตรวจ), `dm@demo.wems.local` (ผู้อนุมัติ มีใบอนุญาต), `dc@demo.wems.local` (ผู้ควบคุมเอกสาร) ฯลฯ — รหัสผ่านตาม `DEMO_PASSWORD`, PIN ลงนาม `135790`

## เนื้อหา

```text
CLAUDE.md                         กติกาหลักที่ Claude Code โหลดทุก session
.claude/rules/                    กติกาเฉพาะ api / database / web / mobile (โหลดตาม path)
.claude/skills/                   /next-task, /spec-check, /new-module
apps/api/prisma/schema/*.prisma   ฐานข้อมูลทั้งระบบ 87 models, 77 enums (Prisma 7 multi-file)
apps/api/prisma.config.ts         ค่าตั้ง Prisma 7
docs/00-overview.md … 11-testing.md   สเปกภาพรวม สถาปัตยกรรม data model API workflow ความปลอดภัย UI มือถือ NFR roadmap test
docs/modules/M01–M09              สเปกรายโมดูล (M04 งานออกแบบและเอกสาร = MVP)
docs/adr/                         เหตุผลของการตัดสินใจสำคัญ 6 เรื่อง
docs/data/enum-labels.json        ป้ายไทย/อังกฤษของทุก enum
docs/data/seed/                   บทบาท/สิทธิ์ เลขเอกสาร ค่าตั้ง สาขา ประเภทเอกสาร workflow พารามิเตอร์ มาตรฐานน้ำทิ้ง สูตรคำนวณ
docs/open-questions.md            เรื่องที่บริษัทต้องยืนยัน
docs/runbooks/                    สำรอง/กู้คืน, checklist ความปลอดภัย, ทดสอบโหลด, แผน UAT/pilot
infra/backup/ · infra/load/       สคริปต์สำรองข้อมูล (pg_dump + age) และทดสอบโหลด (k6)
apps/mobile/                      แอป Flutter (ทะเบียน/PDF ออฟไลน์, งานตรวจ, push)
tools/check-enum-labels.mjs       ตรวจป้าย enum ครบ
tools/check-spec-refs.mjs         ตรวจการอ้างอิงในสเปก และ test ของกติกา
tools/check-audit.mjs             ตรวจว่าทุก transaction ที่เปลี่ยนข้อมูลบันทึก audit
```

## แผนพัฒนา

| เฟส | ขอบเขต |
|---|---|
| 0 | Foundation: monorepo, auth, สิทธิ์, ไฟล์, เลขเอกสาร, แจ้งเตือน, PDF, โครงเว็บและแอป, CI |
| **1 (MVP)** | **งานออกแบบและเอกสาร**: ทะเบียน, revision, ตรวจ/อนุมัติพร้อมลงนาม, ความเห็นบน PDF, ใบนำส่ง, design basis, มือถือดูแบบออฟไลน์และอนุมัติ |
| 2 | บริหารโครงการและหน้างาน: แผนงาน งวดงาน รายงานประจำวัน ปัญหาหน้างาน checklist (ออฟไลน์) |
| 3 | ห้องปฏิบัติการ (LIMS) และเก็บตัวอย่างภาคสนาม |
| 4 | ใบเสนอราคา วางบิล timesheet dashboard |
| 5 | SSO, LINE OA, เชื่อมระบบบัญชี และส่วนเสริม |

## สิ่งที่ตรวจแล้ว

- Prisma schema ผ่านการ validate ด้วย engine ของ Prisma 7.10 (87 models, 77 enums, 1,448 fields) และจัดรูปแบบด้วย `prisma format`
- ป้าย enum ครบทุกค่า (`node tools/check-enum-labels.mjs`)
- การอ้างอิงรหัสกติกา/สถานการณ์และไฟล์ในสเปกถูกต้อง (`node tools/check-spec-refs.mjs`)
- ตัวอย่างทดสอบของสูตรคำนวณแล็บคำนวณตรงด้วยเลขทศนิยมแบบแม่นยำ

## ข้อควรทราบ

- ค่ามาตรฐานน้ำทิ้งใน `docs/data/seed/standards.csv` ถอดจากประกาศกระทรวงอุตสาหกรรม เรื่อง กำหนดมาตรฐานควบคุมการระบายน้ำทิ้งจากโรงงาน พ.ศ. 2560 และประกาศกระทรวงทรัพยากรธรรมชาติและสิ่งแวดล้อม เรื่อง กำหนดมาตรฐานควบคุมการระบายน้ำทิ้งจากอาคารบางประเภทและบางขนาด (ราชกิจจานุเบกษา 29 ธ.ค. 2548) — ให้ผู้เชี่ยวชาญของบริษัทยืนยันว่ายังเป็นฉบับที่ใช้บังคับก่อนใช้งานจริง
- วิธีวิเคราะห์ ระยะเวลาเก็บรักษา และสูตรคำนวณใน seed เป็นตัวอย่างตามแนว Standard Methods — ห้องปฏิบัติการต้องยืนยันกับ SOP และขอบข่ายการรับรองของตน
- ตาราง PDPA และระยะเวลาเก็บรักษาข้อมูลเป็นข้อเสนอ ให้ฝ่ายกฎหมาย/DPO ของบริษัทยืนยัน
