# ทดสอบโหลด (P1-15)

เป้า `09-nfr.md` §2: ทะเบียนเอกสาร 5,000 แถว (แบ่งหน้า + กรอง + ค้นหา) p95 ≤ 500 ms

## วิธีรัน

```bash
# 1) ข้อมูล 5,000 เอกสาร (+ revision 6,500) ในโครงการเดียว — ห้ามรันกับ production
psql "$DATABASE_URL" -v project_code=P26-001 -v owner_email=pm@demo.wems.local -f infra/load/seed-register.sql

# 2) โหลด: ผู้ใช้หลายคน (API จำกัด 300 ครั้ง/นาที/คน), ramp 15 → 30 VU, 90 วินาที
k6 run -e BASE_URL=http://localhost:4000 -e PASSWORD=… -e PROJECT_CODE=P26-001 \
  -e EMAILS=dc@demo.wems.local,dm@demo.wems.local,drafter@demo.wems.local,eng1@demo.wems.local,eng2@demo.wems.local,pm@demo.wems.local,senior@demo.wems.local,site@demo.wems.local,exec@demo.wems.local \
  infra/load/register.k6.js

# 3) ลบข้อมูลทดสอบ
psql "$DATABASE_URL" -f infra/load/cleanup-register.sql
```

คำค้นที่สุ่ม: หน้าแรก/หน้าสุ่ม (pageSize 50), เรียงตาม `updatedAt`, กรองสาขา, กรองสถานะ revision `IN_REVIEW`, ค้นหาคำไทย (trigram), ค้นหาเลขที่เอกสาร

## ผล

| วันที่ | สภาพแวดล้อม | ข้อมูล | โหลด | p95 ทะเบียน | median | max | error | ผล |
|---|---|---|---|---|---|---|---|---|
| 2026-10-03 | cloud sandbox (API `NODE_ENV=production` 1 process, PostgreSQL 16 + Redis เครื่องเดียวกัน) | 5,000 เอกสาร / 6,500 revision | 30 VU, 1,555 request ใน 90 วินาที (~17 req/s) | **77 ms** | 38 ms | 158 ms | 0% | ✅ ผ่าน (เป้า 500 ms) |

หมายเหตุ
- ค่าบน staging จะสูงกว่านี้เพราะเครือข่ายและ DB แยกเครื่อง — รันซ้ำบน staging ก่อน pilot และบันทึกเพิ่มในตารางนี้
- 17 req/s ต่อเนื่องสูงกว่าการใช้งานจริงของผู้ใช้พร้อมกัน 100 คน (`09-nfr.md` §1) หลายเท่า เพราะผู้ใช้จริงไม่ได้เปิดทะเบียนทุกวินาที
