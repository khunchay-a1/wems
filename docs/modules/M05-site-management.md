# M05 · บริหารหน้างาน (เฟส 2)

> Data model: `site.prisma` · สถานะ: `05-workflows.md` §7 · มือถือ/ออฟไลน์: `08-mobile.md` §5, §9
> **ก่อนเริ่มเฟส 2** ให้ทบทวนสเปกนี้กับทีมหน้างานจริง แล้วอัปเดตเอกสารก่อนเขียนโค้ด

## 1. ขอบเขต

รายงานประจำวัน, ปัญหา/ข้อบกพร่อง (ปักหมุดบนแบบได้), การตรวจงานตาม checklist, คำถามหน้างานถึงทีมออกแบบ, ความคืบหน้าแผนงานจากหน้างาน — **ทุกอย่างทำบนมือถือแบบออฟไลน์ได้** และจัดการ/อนุมัติบนเว็บ

## 2. กติกาธุรกิจ

### รายงานประจำวัน
- **BR-SITE-001** 1 รายงานต่อ ผู้รายงาน × โครงการ × วัน; วันที่รายงานย้อนหลังได้ไม่เกิน 7 วัน และห้ามล่วงหน้า
- **BR-SITE-002** ปุ่ม "คัดลอกจากเมื่อวาน" คัดลอกกำลังคนและเครื่องจักร (ไม่คัดลอกงาน/รูป)
- **BR-SITE-003** ส่ง (SUBMITTED) ต้องมี: สภาพอากาศเช้า/บ่าย, กำลังคน ≥ 1 แถว หรือหมายเหตุ "ไม่มีการทำงาน", งาน ≥ 1 รายการ หรือหมายเหตุ
- **BR-SITE-004** PM อนุมัติ/ตีกลับ (มีเหตุผล); APPROVED แล้วแก้ไม่ได้; ตอนอนุมัติ `progressPercent` ของ activity ถูกเขียนลง Task (ค่าที่ใหม่กว่าเท่านั้น, ห้ามลดลงเว้นแต่ PM ยืนยัน)
- **BR-SITE-005** ส่งออก PDF รายงานประจำวัน (ภาษาไทย A4) พร้อมรูป 6 รูปต่อหน้า และช่องลงนาม

### ปัญหาหน้างาน
- **BR-SITE-010** สร้างได้ออฟไลน์; เลข `IS-...` ออกเมื่อ sync ถึง server (ก่อนนั้นแสดง "รอเลข")
- **BR-SITE-011** ปักหมุดบนแบบได้เฉพาะ revision ฉบับใช้งาน (`latestApprovedRevisionId`) ณ ตอนสร้าง; เมื่อมี revision ใหม่ หมุดยังแสดงบน revision เดิมพร้อมป้าย "แบบมีฉบับใหม่"
- **BR-SITE-012** RESOLVED ต้องมี `resolutionNote` และรูปหลังแก้ ≥ 1 รูป (ยกเว้นหมวด DESIGN)
- **BR-SITE-013** VERIFIED โดยผู้แจ้งหรือผู้มี `issue.manage` ที่ไม่ใช่ assignee
- **BR-SITE-014** severity CRITICAL หรือหมวด SAFETY แจ้ง PM ทันทีทาง push

### การตรวจงาน (Inspection)
- **BR-SITE-020** แม่แบบ checklist ดูแลโดย `masterdata.manage`; แก้แม่แบบที่เคยถูกใช้ = สร้างแม่แบบใหม่ (code เดิม + ต่อท้าย `-v2`)
- **BR-SITE-021** ผลรวม: ข้อที่บังคับข้อใด FAIL → outcome = FAIL เว้นแต่ผู้ตรวจเลือก CONDITIONAL พร้อมหมายเหตุ; ทุกข้อ PASS/NA → PASS
- **BR-SITE-022** ข้อ FAIL สร้าง Issue ได้ในคลิกเดียว (อ้างถึงการตรวจ)

### คำถามหน้างาน (Site query)
- **BR-SITE-030** ต้องระบุผู้รับผิดชอบ (สมาชิกที่มี `sitequery.answer`) และวันที่ต้องการคำตอบ
- **BR-SITE-031** ตอบแล้ว `requiresRevision = true` → แสดงปุ่ม "สร้าง revision ใหม่" ที่เอกสารที่อ้างถึง และติดตามจนมี revision ใหม่ APPROVED
- **BR-SITE-032** เลยวันที่ต้องการคำตอบ → เตือนผู้รับผิดชอบและ PM ทุกวันทำการ

## 3. API (ย่อ)

| Resource | Endpoint หลัก | สิทธิ์ |
|---|---|---|
| Daily report | `GET/POST /projects/{id}/daily-reports`, `GET/PATCH /daily-reports/{id}` (แทนที่ manpower/equipment/activities ทั้งชุด), `POST /daily-reports/{id}/submit` · `/approve` · `/return`, `GET /daily-reports/{id}/pdf` | `dailyreport.submit` / `dailyreport.approve` |
| Issue | `GET/POST /projects/{id}/issues`, `GET/PATCH /issues/{id}`, `POST /issues/{id}/start` · `/resolve` · `/verify` · `/close` · `/reopen` · `/cancel` | `issue.create` / assignee / `issue.manage` |
| Inspection template | `GET/POST/PATCH /inspection-templates[/{id}]` | `masterdata.manage` |
| Inspection | `GET/POST /projects/{id}/inspections`, `GET/PATCH /inspections/{id}` (แทนที่ results), `POST /inspections/{id}/submit` · `/approve` · `/reject`, `GET /inspections/{id}/pdf` | `inspection.submit` / `inspection.approve` |
| Site query | `GET/POST /projects/{id}/site-queries`, `GET/PATCH /site-queries/{id}`, `POST /site-queries/{id}/answer` · `/close` · `/cancel` | `sitequery.create` / `sitequery.answer` |
| รูป/ไฟล์แนบ | `POST /attachments` (`ownerType` = DAILY_REPORT, ISSUE, INSPECTION, INSPECTION_RESULT, SITE_QUERY) | ตามเจ้าของ |

ทุก `POST` สร้าง entity รับ `id` จาก client (UUIDv7) และต้องมี `Idempotency-Key` เมื่อมาจากมือถือ

## 4. หน้าจอ

**มือถือ** (หลัก): หน้าโครงการ → แท็บ "วันนี้" (รายงานวันนี้, ปัญหาที่ฉันรับผิดชอบ, การตรวจที่ร่างไว้) · ฟอร์มรายงานประจำวันแบบขั้นตอน (สภาพอากาศ → กำลังคน → เครื่องจักร → งาน → รูป → ตรวจทาน/ส่ง) · สร้างปัญหา (ถ่ายรูปก่อน → เลือกตำแหน่งบนแบบหรือ GPS → รายละเอียด) · ทำ checklist ทีละข้อพร้อมรูป · ถามคำถามหน้างาน

**เว็บ**: ตารางรายงานประจำวันแบบปฏิทิน (สีตามสถานะ) + หน้าอนุมัติ · กระดานปัญหา (ตาราง/Kanban ตามสถานะ, กรองหมวด/ความรุนแรง/ผู้รับผิดชอบ) + มุมมองหมุดบนแบบ · รายการการตรวจ + PDF · รายการคำถามหน้างาน

## 5. สถานการณ์ทดสอบรับงาน

| รหัส | สถานการณ์ | ผลที่ต้องได้ |
|---|---|---|
| AT-SITE-01 | โฟร์แมนสร้างรายงานประจำวันพร้อมรูป 8 รูปขณะโหมดเครื่องบิน แล้วเปิดเน็ต | รายงานและรูปขึ้น server ครบ ไม่ซ้ำ แม้แอปถูกปิดกลางทาง |
| AT-SITE-02 | ส่งรายงานเดิมซ้ำ 2 ครั้ง (retry) | มี 1 รายงาน (idempotent) |
| AT-SITE-03 | วิศวกรสนามปักหมุดปัญหาบนแบบ Rev.0 แล้ว Rev.1 อนุมัติ | หมุดยังอยู่บน Rev.0 พร้อมป้าย "แบบมีฉบับใหม่" |
| AT-SITE-04 | PM อนุมัติรายงานที่เสนอ progress 40% ให้ task ที่ปัจจุบัน 30% | task = 40%, ความคืบหน้าโครงการคำนวณใหม่ |
| AT-SITE-05 | checklist มีข้อบังคับ FAIL 1 ข้อ | outcome = FAIL และสร้าง Issue จากข้อนั้นได้ |
