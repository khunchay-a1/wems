# M03 · โครงการ (เฟส 1: ทะเบียนและทีม / เฟส 2: แผนงานและงวดงาน)

> Data model: `project.prisma` · สถานะ: `05-workflows.md` §6

## 1. ขอบเขต

**เฟส 1**: ทะเบียนโครงการ, สมาชิกและบทบาทในโครงการ, ค่าตั้งของโครงการ (revision scheme, แยกหน้าที่, รูปแบบเลขเอกสาร), หน้าภาพรวมโครงการ
**เฟส 2**: WBS/แผนงาน (Gantt) + ความคืบหน้าแบบถ่วงน้ำหนัก (S-curve), งวดงาน

## 2. กติกาธุรกิจ

- **BR-PRJ-001** `Project.code` ออกจาก numbering scheme `PROJECT` (แก้ได้โดย `project.manage` ก่อนมีเอกสารในโครงการ)
- **BR-PRJ-002** ผู้สร้างโครงการถูกเพิ่มเป็นสมาชิกบทบาท PROJECT_MANAGER อัตโนมัติ ถ้าไม่ได้ระบุ `projectManagerId` อื่น; `projectManagerId` ต้องเป็นสมาชิกบทบาท PROJECT_MANAGER เสมอ (ระบบเพิ่ม/ปรับให้)
- **BR-PRJ-003** ถอดสมาชิก = ตั้ง `removedAt` (ไม่ลบแถว); ถอดสมาชิกที่เป็น assignee ของขั้นตรวจ ACTIVE/PENDING ไม่ได้จนกว่าจะมอบหมายแทน (`MEMBER_HAS_PENDING_REVIEWS`)
- **BR-PRJ-004** เปลี่ยน `revisionScheme` ได้เฉพาะเมื่อยังไม่มี revision ในโครงการ
- **BR-PRJ-010** จัดการทีม/ค่าตั้งโครงการ: `project.manage` หรือ PM ของโครงการนั้น
- **BR-PRJ-020** ผลของสถานะโครงการต่อข้อมูล: ดู `05-workflows.md` §6
- **BR-PRJ-021** ปิดโครงการ (CLOSED) ได้เมื่อไม่มีรอบตรวจค้าง และไม่มีใบนำส่ง DRAFT
- **BR-PRJ-030** (เฟส 2) ความคืบหน้าโครงการ = Σ(weight × progress) / Σ(weight) ของ task ระดับล่างสุด; PHASE คำนวณจากลูก; MILESTONE มีค่า 0 หรือ 100
- **BR-PRJ-031** (เฟส 2) Dependency ต้องไม่เป็นวงวน (ตรวจด้วย topological sort ก่อนบันทึก)
- **BR-PRJ-032** (เฟส 2) ผลรวม `percent` ของงวดงาน ≤ 100 และผลรวม `amount` ≤ `contractValue` (เตือนถ้าไม่เท่ากับพอดี)

## 3. API

| Method | Path | สิทธิ์ | เฟส |
|---|---|---|---|
| GET | `/projects` (กรอง `q`, `status`, `type`, `clientId`, `mine=true`) | ล็อกอิน (เห็นเฉพาะที่เข้าถึงได้) | 1 |
| POST | `/projects` | `project.create` | 1 |
| GET / PATCH | `/projects/{id}` | สมาชิก / BR-PRJ-010 | 1 |
| POST | `/projects/{id}/start` · `/hold` · `/resume` · `/complete` · `/close` · `/reopen` · `/cancel` | BR-PRJ-010 (reopen: ADMIN) | 1 |
| GET | `/projects/{id}/members` | สมาชิก | 1 |
| POST / PATCH / DELETE | `/projects/{id}/members[/{userId}]` | BR-PRJ-010 | 1 |
| GET | `/projects/{id}/overview` | สมาชิก | 1 — ตัวเลขเอกสารตามสถานะ งานตรวจค้าง ใบนำส่งล่าสุด (เฟส 2 เพิ่มความคืบหน้า) |
| GET / PUT | `/projects/{id}/numbering-scheme` | BR-PRJ-010 | 1 — override DOCUMENT pattern |
| GET / POST / PATCH / DELETE | `/projects/{id}/tasks[/{taskId}]` | `task.manage` | 2 |
| PUT | `/projects/{id}/tasks/bulk` | `task.manage` | 2 — บันทึกจากหน้า Gantt ทีละชุด (มี version ต่อ task) |
| POST / DELETE | `/tasks/{id}/dependencies` | `task.manage` | 2 |
| GET | `/projects/{id}/progress?from=&to=` | สมาชิก | 2 — S-curve แผน/จริงรายสัปดาห์ |
| GET / POST / PATCH | `/projects/{id}/payment-milestones[/{mid}]` | `milestone.manage` | 2 |
| POST | `/payment-milestones/{id}/submit` · `/accept` · `/invoice` · `/pay` · `/cancel` | `milestone.manage` | 2 |

## 4. หน้าจอ

- `/projects` การ์ด/ตาราง: รหัส ชื่อ ลูกค้า ประเภท สถานะ PM ความคืบหน้า (เฟส 2) + ตัวกรอง "โครงการของฉัน"
- `/projects/new` ฟอร์ม: ลูกค้า → สถานที่ (กรองตามลูกค้า), ประเภท, ชื่อ, เลขสัญญา, มูลค่า, วันที่, PM, revision scheme
- `/projects/[id]` ภาพรวม + แท็บ: เอกสาร · ใบนำส่ง · ค่าออกแบบ · ทีม · ตั้งค่า (เฟส 2: แผนงาน · รายงานประจำวัน · ปัญหา · การตรวจงาน · คำถามหน้างาน · งวดงาน)
- เฟส 2 Gantt: ไลบรารี license MIT/Apache (เช่น frappe-gantt) — ห้ามใช้ไลบรารีที่ต้องซื้อ license โดยไม่ได้รับอนุมัติ

## 5. สถานการณ์ทดสอบรับงาน

| รหัส | สถานการณ์ | ผลที่ต้องได้ |
|---|---|---|
| AT-PRJ-01 | PM สร้างโครงการ | ได้รหัส `P26-001`, ผู้สร้างเป็นสมาชิกบทบาท PROJECT_MANAGER |
| AT-PRJ-02 | ถอดสมาชิกที่มีงานตรวจ ACTIVE | 409 `MEMBER_HAS_PENDING_REVIEWS` |
| AT-PRJ-03 | ปิดโครงการที่มีใบนำส่ง DRAFT | 409 `PROJECT_HAS_OPEN_ITEMS` พร้อมรายการที่ค้าง |
| AT-PRJ-04 | ผู้ใช้ที่ไม่ใช่สมาชิกเรียก `/projects` | ไม่เห็นโครงการนั้นในรายการ |
