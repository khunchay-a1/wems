# M08 · งานขายและการเงิน (เฟส 4)

> Data model: `commercial.prisma` · สถานะ: `05-workflows.md` §9
> ระบบนี้ **ไม่ออกใบกำกับภาษี/ใบแจ้งหนี้จริง** — ระบบบัญชีเดิมเป็นผู้ออก; ที่นี่เก็บใบเสนอราคา สถานะการวางบิล และ timesheet

## 1. กติกาธุรกิจ

### ใบเสนอราคา
- **BR-COM-001** เลข `QT{YY}-{SEQ:4}`; แก้หลัง SENT = ออกฉบับใหม่ (`revNo + 1`, `supersedesId`) ฉบับเดิม SUPERSEDED
- **BR-COM-002** ใบเสนอราคางานแล็บดึงราคาจาก `AnalyticalMethod.price` / `TestPackage.price` (แก้ราคาในใบได้)
- **BR-COM-003** ต้องอนุมัติ (`quotation.approve`) เมื่อยอดรวม ≥ `quotation.approvalAmount` (ค่าตั้งต้น 500,000 บาท) หรือส่วนลดรวม > `quotation.maxDiscountPercent` (ค่าตั้งต้น 10%)
- **BR-COM-004** การคำนวณ (Decimal, ปัดครึ่งขึ้น 2 ตำแหน่งทุกขั้น):
  `amount = quantity × unitPrice − discountAmount` · `subtotal = Σ amount` · `base = subtotal − discountAmount(หัวเอกสาร)` · `vatAmount = base × vatRate / 100` · `totalAmount = base + vatAmount` · ภาษีหัก ณ ที่จ่าย (แสดงเพื่อทราบ) `= base × withholdingRate / 100`
  ตัวอย่าง: subtotal 10,000.00, ส่วนลด 500.00, VAT 7% → VAT 665.00, รวม 10,165.00, หัก ณ ที่จ่าย 3% = 285.00, ยอดโอนสุทธิ 9,880.00
- **BR-COM-005** PDF ใบเสนอราคาแสดงยอดรวมเป็นตัวอักษรไทย (`bahtText`) — test vectors: `21` → "ยี่สิบเอ็ดบาทถ้วน", `101` → "หนึ่งร้อยเอ็ดบาทถ้วน", `1234.50` → "หนึ่งพันสองร้อยสามสิบสี่บาทห้าสิบสตางค์", `2000021.10` → "สองล้านยี่สิบเอ็ดบาทสิบสตางค์", `0.25` → "ยี่สิบห้าสตางค์"
- **BR-COM-006** `validUntil` ค่าตั้งต้น = วันที่ออก + 30 วัน; งานรายวันเปลี่ยน SENT ที่เลยกำหนดเป็น EXPIRED
- **BR-COM-007** ACCEPTED → ปุ่ม "สร้างงานวิเคราะห์" (type LAB) หรือ "สร้างโครงการ" (ประเภทอื่น) โดยคัดลอกลูกค้า/สถานที่/รายการ

### การวางบิล
- **BR-COM-010** สร้าง BillingRecord จากงวดงานที่ ACCEPTED (M03) หรืองานแล็บที่ REPORTED; ยอดตั้งต้นจากงวด/ใบเสนอราคา
- **BR-COM-011** ส่งคำขอ (REQUESTED) → ส่งออกไฟล์ให้ระบบบัญชี (CSV/Excel: เลขคำขอ, ลูกค้า, เลขผู้เสียภาษี, สาขา, รายการ, ยอด, VAT, อ้างอิงโครงการ/งาน) → ฝ่ายบัญชีบันทึก `externalRef` → INVOICED → PAID
- **BR-COM-012** ยอดวางบิลรวมของโครงการเกิน `contractValue` → เตือน

### Timesheet
- **BR-COM-020** สัปดาห์ = จันทร์–อาทิตย์; ลงเวลาหน่วย 0.25 ชม.; รวมต่อวัน ≤ 24 ชม.; ลงโครงการที่เป็นสมาชิกเท่านั้น (หรือหมวด OVERHEAD/TRAINING/LEAVE)
- **BR-COM-021** เตือนศุกร์ 16:00 ผู้ที่ยังไม่ส่งสัปดาห์นี้; ผู้อนุมัติ (`timesheet.approve`) กรองตามโครงการได้
- **BR-COM-022** ต้นทุนแรงงาน = ชั่วโมง × อัตราของบุคคล ณ วันทำงาน (ถ้าไม่มี ใช้อัตราตามบทบาทโครงการ)

## 2. API (ย่อ)

| กลุ่ม | Endpoint หลัก | สิทธิ์ |
|---|---|---|
| ใบเสนอราคา | `GET/POST /quotations`, `GET/PATCH /quotations/{id}`, `POST /quotations/{id}/submit-approval` · `/approve` · `/send` · `/accept` · `/reject` · `/revise` · `/cancel`, `GET /quotations/{id}/pdf`, `POST /quotations/{id}/create-lab-job` · `/create-project` | `quotation.create` / `quotation.approve` |
| วางบิล | `GET/POST /billing-records`, `PATCH /billing-records/{id}`, `POST /billing-records/{id}/request` · `/invoiced` · `/paid` · `/cancel`, `GET /billing-records/export?status=REQUESTED` | `billing.manage` |
| Timesheet | `GET /timesheets?weekStart=&userId=`, `PUT /timesheets/{weekStart}` (ของตนเอง), `POST /timesheets/{id}/submit` · `/approve` · `/reject` | `timesheet.submit` / `timesheet.approve` |
| อัตราต้นทุน | `GET/POST/PATCH /cost-rates` | `costrate.manage` |
| รายงาน | `GET /reports/labor-cost?projectId=&from=&to=` | `report.export` |

## 3. หน้าจอ

`/quotations` (ตาราง + pipeline ตามสถานะ), `/quotations/[id]` (แก้รายการแบบตาราง คำนวณทันที, ตัวอย่าง PDF), `/billing` (ตาราง + ส่งออก), `/timesheets` (ตารางสัปดาห์: แถว = โครงการ/งาน, คอลัมน์ = วัน), `/timesheets/approve`

## 4. สถานการณ์ทดสอบรับงาน

| รหัส | สถานการณ์ | ผลที่ต้องได้ |
|---|---|---|
| AT-COM-01 | ใบเสนอราคาตามตัวอย่าง BR-COM-004 | ตัวเลขตรงทุกช่อง |
| AT-COM-02 | ส่วนลด 15% | สถานะ PENDING_APPROVAL, ผู้อนุมัติได้แจ้งเตือน |
| AT-COM-03 | ลงเวลา 25 ชั่วโมงในวันเดียว | 422 `TS_DAILY_LIMIT` |
