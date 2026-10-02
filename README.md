# WEMS — ชุดสเปกสำหรับพัฒนาด้วย Claude Code

ชุดนี้คือจุดเริ่มต้นของ repository ระบบบริหารงานสำหรับบริษัทที่ **ออกแบบระบบน้ำ บริหารโครงการ และวิเคราะห์คุณภาพน้ำ** มีทั้งเว็บ (Next.js) มือถือ (Flutter) และ API (NestJS + PostgreSQL) — ยังไม่มีโค้ดแอป มีสเปก, Prisma schema ที่ตรวจแล้ว, ข้อมูลตั้งต้น, และคำสั่ง/skill ให้ Claude Code เขียนโปรแกรมต่อทีละ task

## เริ่มใช้งาน

1. สร้าง git repository ใหม่ แล้วแตกไฟล์ชุดนี้ไว้ที่ root (`CLAUDE.md` ต้องอยู่ชั้นบนสุด)
2. เครื่องที่ใช้พัฒนาต้องมี: Node.js 22 (≥ 22.12), Docker, Flutter (stable), Git — pnpm ติดตั้งผ่าน `corepack enable` (เวอร์ชันล็อกใน `package.json`) แล้วรัน `pnpm install`
3. อ่านและตอบ `docs/open-questions.md` อย่างน้อย Q01–Q09 (ถ้ายังไม่ตอบ ระบบจะใช้ค่าที่สมมติไว้ไปก่อน)
4. เปิด Claude Code ที่ root ของ repo แล้วรัน `/context` เพื่อตรวจว่า `CLAUDE.md` ถูกโหลด
5. สั่ง `/next-task P0-01` แล้วทำต่อทีละ task ตาม `docs/10-roadmap.md` (หลังจากนั้นพิมพ์ `/next-task` เฉยๆ ได้)
6. ก่อนเปิด PR แต่ละโมดูล ใช้ `/spec-check M04` (เปลี่ยนเลขโมดูลตามงาน)

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
tools/check-enum-labels.mjs       ตรวจป้าย enum ครบ
tools/check-spec-refs.mjs         ตรวจการอ้างอิงในสเปก และ test ของกติกา
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
