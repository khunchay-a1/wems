# ADR-0005 · UUIDv7 และ optimistic locking

- สถานะ: ยอมรับ (2026-09-26)

## บริบท
ต้องการ id ที่สร้างได้ทั้งฝั่ง server และมือถือ (ออฟไลน์) เรียงตามเวลาได้เพื่อ index ที่ดี และป้องกันการเขียนทับกันเมื่อหลายคนแก้ข้อมูลเดียวกัน

## การตัดสินใจ
- Primary key = UUIDv7 (`@default(uuid(7))`; entity ออฟไลน์ไม่มีค่าเริ่มต้นเพื่อบังคับให้ client ส่ง)
- ทุก entity ที่แก้ได้มีคอลัมน์ `version`; update ใช้ `WHERE id AND version` และเพิ่ม version; ไม่ตรง → 409 `CONFLICT_STALE_VERSION`
- เลขที่มนุษย์อ่าน (เลขเอกสาร เลขตัวอย่าง) แยกจาก id และออกโดย NumberingService

## ผลที่ตามมา
- client ต้องส่ง `version` กลับทุก PATCH/action
- UUID ยาวกว่า integer แต่ไม่ต้องประสาน sequence ระหว่างเครื่อง
