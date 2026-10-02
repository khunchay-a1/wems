# ADR-0007 · Image ของ stack พัฒนา: object storage และ Redis

- สถานะ: ยอมรับ (2026-10-02)

## บริบท
- สเปกเดิมระบุ MinIO เป็น object storage ของ dev/on-prem แต่ MinIO เลิกเผยแพร่ binary/Docker image ฉบับ community แล้ว (`minio/minio` และ `minio/mc` ถูกถอดจาก Docker Hub) — `docker compose up` ที่อ้าง image เหล่านี้จะ pull ไม่ได้
- Redis ตั้งแต่ 7.4 เปลี่ยน license เป็น RSALv2/SSPL (8.x เพิ่ม AGPLv3) ซึ่งอยู่นอกรายการ license ที่อนุญาตใน `CLAUDE.md` ข้อ 12 (MIT/BSD/Apache-2.0/ISC/OFL)
- API คุยกับ storage ผ่าน S3 API เท่านั้น (ตัวแปร `S3_*`) และคุยกับ Redis ผ่านโปรโตคอล RESP — เปลี่ยนตัวให้บริการได้โดยไม่แก้โค้ด

## การตัดสินใจ
- **Object storage (dev):** RustFS (`rustfs/rustfs`, Apache-2.0, เข้ากันได้กับ S3 รองรับ versioning) ล็อกเวอร์ชันใน `infra/docker-compose.yml`; สร้าง bucket ด้วย `amazon/aws-cli` (คำสั่ง S3 มาตรฐาน ใช้ได้กับทุกผู้ให้บริการ) ใน service `storage-init` — ตั้ง versioning (บังคับ), lifecycle ลบเวอร์ชันเก่า 90 วัน และ CORS (best effort)
- **Redis (dev):** `redis:7.2.x` ซึ่งเป็นสาย BSD-3-Clause สุดท้าย; ทางเลือกที่เข้ากันได้คือ Valkey (BSD) — BullMQ รองรับทั้งคู่
- โค้ดต้องไม่ผูกกับผู้ให้บริการ: ห้ามใช้ API เฉพาะของ MinIO/RustFS (เช่น admin API) ใช้ AWS SDK v3 แบบ path style เท่านั้น
- ตัวเลือกสำหรับ staging/production เป็นเรื่องที่บริษัทต้องตัดสิน → `docs/open-questions.md` Q22

## ผลที่ตามมา
- integration test ของไฟล์ (P0-09) ทดสอบกับ S3-compatible storage ใน compose แทน "MinIO"
- ถ้าบริษัทเลือก MinIO แบบเชิงพาณิชย์ AWS S3 Cloudflare R2 หรือ SeaweedFS ภายหลัง เปลี่ยนแค่ค่า `S3_*` และ service ใน compose
- ทางเลือกที่ไม่เลือก: image MinIO ที่ build เอง (ต้องดูแล build/แพตช์ความปลอดภัยเอง), Chainguard MinIO (distroless ไม่มี shell ทำ healthcheck ไม่ได้), Garage (ไม่รองรับ versioning), LocalStack (จำลอง AWS ทั้งชุด หนักเกินจำเป็น)
