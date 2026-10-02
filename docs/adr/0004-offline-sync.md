# ADR-0004 · Offline sync ของมือถือ

- สถานะ: ยอมรับ (2026-09-26)

## บริบท
ทีมหน้างานและทีมเก็บตัวอย่างทำงานในที่สัญญาณไม่ดี ต้องสร้างข้อมูลได้ต่อเนื่องหลายวันโดยไม่ออนไลน์ และต้องไม่เกิดข้อมูลซ้ำเมื่อส่งซ้ำ

## การตัดสินใจ
- Server: ตาราง `change_logs` (seq ต่อเนื่อง, `scopeKey`) เขียนใน transaction เดียวกับการเปลี่ยนข้อมูล; `GET /sync/pull?scope&cursor` คืนการเปลี่ยนแปลงหรือ snapshot
- เครื่อง: drift (SQLite) เก็บข้อมูลของ scope ที่ติดตาม; การเขียนผ่าน outbox (FIFO, dependsOn, placeholder ไฟล์) ส่งด้วย `Idempotency-Key`
- entity ที่สร้างออฟไลน์ใช้ UUIDv7 จากเครื่อง; server รับ id ซ้ำจากเจ้าของเดิมแบบ idempotent
- ขัดแย้ง: server เป็นหลัก (optimistic locking) → เครื่องแสดง CONFLICT ให้ผู้ใช้ตัดสิน

## ผลที่ตามมา
- ทุก service ที่เปลี่ยน entity ที่ sync ต้องเขียน change log ให้ถูก scope (รวม DELETE เมื่อ entity ออกจาก scope)
- change log เก็บ 90 วัน; เครื่องที่ไม่ได้ sync นานกว่านั้นต้อง snapshot ใหม่
- ทางเลือกที่ไม่เลือก: CRDT/PowerSync/ElectricSQL (ซับซ้อน/มีค่าใช้จ่าย/ผูกกับผู้ให้บริการ), Firebase (ข้อมูลธุรกิจอยู่นอก PostgreSQL)
