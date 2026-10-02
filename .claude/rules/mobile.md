---
paths:
  - "apps/mobile/**"
---

# กติกาโค้ดมือถือ (Flutter)

- อ่าน `docs/08-mobile.md` ก่อนเริ่มงาน; โครงสร้าง feature-first (`data/`, `application/`, `presentation/`)
- Material: ใช้ตามที่ `flutter create` ของเวอร์ชันที่ใช้สร้าง (แพ็กเกจ `material_ui` หลังการแยก Material ออกจาก framework) — ห้าม import ปนกับ `package:flutter/material.dart`
- State/DI ด้วย Riverpod (+ generator); navigation ด้วย go_router; widget ห้ามเรียก API ตรง — ผ่าน repository
- API client ใน `lib/core/api/generated/` สร้างด้วย `swagger_parser` — ห้ามแก้มือ; เปลี่ยน API แล้ว generate ใหม่
- อ่านข้อมูลจาก drift เป็นหลัก; entity ที่สร้าง/แก้ออฟไลน์ต้องเขียนผ่าน outbox (มี `Idempotency-Key`, UUIDv7 จากเครื่อง) — ห้ามยิง API ตรงจากหน้าจอสำหรับ entity เหล่านี้
- ข้อความทุกตัวผ่าน `AppLocalizations` (ARB th/en); ป้าย enum จาก ARB ที่ generate
- เวลาใช้ `Clock` ที่ inject ได้; วันที่แสดงผ่าน `thai_date.dart`
- ค่า config ต่อ flavor ผ่าน `--dart-define-from-file` — ห้ามใส่ secret ในโค้ดหรือ repo
- ต้องมี unit test สำหรับ logic ของ sync/outbox ทุกครั้งที่แก้; รัน `flutter analyze` และ `flutter test` ก่อน commit
