# ADR-0006 · Transactional outbox สำหรับ side effect

- สถานะ: ยอมรับ (2026-09-26)

## บริบท
การอนุมัติเอกสารต้องส่งอีเมล/push/สร้าง PDF ถ้า enqueue งานหลัง commit แล้ว process ล้มระหว่างนั้น งานจะหาย; ถ้า enqueue ก่อน commit แล้ว transaction rollback จะเกิดงานผี

## การตัดสินใจ
- service เขียน `outbox_events` ใน transaction เดียวกับข้อมูลธุรกิจ
- outbox relay ใน worker อ่านด้วย `FOR UPDATE SKIP LOCKED` แล้วส่งเข้า BullMQ ด้วย `jobId = event.id` (กันซ้ำ)
- handler ทุกตัว idempotent

## ผลที่ตามมา
- side effect เกิดช้ากว่า commit ~1 วินาที (ยอมรับได้)
- ต้องเฝ้าดู outbox ค้าง (`09-nfr.md` §4)
