# Runbook · สำรองและกู้คืนข้อมูล

อ้างอิงเป้าหมาย: `09-nfr.md` §3 (RPO ≤ 15 นาที, RTO ≤ 4 ชั่วโมง, full รายวันเก็บ 30 วัน + รายเดือน 12 เดือน, เข้ารหัส, เก็บนอกเครื่อง, ทดสอบกู้คืนทุกไตรมาส)

## 1. สิ่งที่ต้องสำรอง

| ข้อมูล | วิธี | ความถี่ / เก็บนาน | หมายเหตุ |
|---|---|---|---|
| PostgreSQL (ทุกตาราง) — **ทางหลักสำหรับ RPO 15 นาที** | WAL archiving + base backup ด้วย pgBackRest (`infra/backup/pgbackrest.conf.example`) หรือ PITR ของ managed DB | WAL ต่อเนื่อง (`archive_timeout = 300`), full รายสัปดาห์, diff รายวัน; เก็บ 30 วัน | ตัดสินใจตาม Q03 (เครื่องเองหรือ managed) |
| PostgreSQL — สำเนาตรรกะ | `infra/backup/backup.sh` (`pg_dump -Fc` → เข้ารหัส age → S3 อีกที่) | ทุกวัน 02:30; รายวัน 30 วัน + ฉบับวันที่ 1 ของเดือน 12 เดือน (lifecycle ของบัคเก็ตสำรอง) | กู้คืนข้ามเวอร์ชัน/ตรวจสอบได้ง่าย, RPO 24 ชั่วโมง |
| ไฟล์ (bucket `wems-…`) | versioning เปิด + replication ไปบัคเก็ตอีกที่ (`aws s3 sync` ตาม cron หรือ replication ของผู้ให้บริการ) | ต่อเนื่อง / รายชั่วโมง; เวอร์ชันเก่า 90 วัน | ไฟล์ไม่เคยถูกแก้ทับ (revision ใหม่ = object ใหม่) |
| ค่า `.env` / secret | secret manager ของบริษัท | ทุกครั้งที่เปลี่ยน | **ห้าม**อยู่ในบัคเก็ตเดียวกับข้อมูลสำรอง |
| กุญแจถอดรหัสข้อมูลสำรอง (age identity) | ตู้เซฟ/ password manager ของผู้ดูแล 2 คน | — | เครื่องที่สำรองมีแค่ public key |

## 2. ติดตั้งการสำรองรายวัน (สำเนาตรรกะ)

```bash
# ครั้งเดียว: สร้างกุญแจ (เก็บไฟล์ private ไว้นอกเซิร์ฟเวอร์)
age-keygen -o wems-backup.key        # บรรทัด "public key: age1…" คือ BACKUP_AGE_RECIPIENT

# /etc/cron.d/wems-backup
30 2 * * * wems  . /etc/wems/backup.env && /opt/wems/infra/backup/backup.sh >> /var/log/wems-backup.log 2>&1
```

`/etc/wems/backup.env`: `DATABASE_URL`, `BACKUP_AGE_RECIPIENT`, `BACKUP_DIR`, `BACKUP_S3_URI` (บัคเก็ตคนละที่/คนละบัญชีกับระบบหลัก), `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT_URL` (ถ้าไม่ใช่ AWS)

การเฝ้าระวัง: ถ้า `backup.sh` จบด้วย exit code ≠ 0 ให้ส่งอีเมลแจ้งผู้ดูแล (`09-nfr.md` §4 "backup ล้ม") — ตั้งด้วย `MAILTO` ของ cron หรือระบบ monitoring

## 3. กู้คืน

### 3.1 กู้คืนฐานข้อมูลจากสำเนาตรรกะ (ทดสอบรายไตรมาส / ระบบเสียทั้งเครื่อง)

1. ประกาศช่วงบำรุงรักษา: ตั้ง `maintenanceMessage` ใน setting `app.config` (มือถือแสดงข้อความ) และหยุด API + worker
2. สร้างฐานข้อมูลใหม่ว่าง (อย่ากู้ทับฐานเดิมจนกว่าจะตรวจผ่าน): `createdb wems_restore`
3. ดึงไฟล์สำรองล่าสุด (และ `.sha256`) จากบัคเก็ตสำรอง
4. ```bash
   BACKUP_AGE_IDENTITY=./wems-backup.key \
   TARGET_DATABASE_URL=postgresql://wems_owner:…@db:5432/wems_restore \
   infra/backup/restore.sh wems-db-20261003T023000Z.dump.age
   ```
   สคริปต์ตรวจ checksum → ถอดรหัส → `pg_restore` → พิมพ์รายงาน `verify.sql` (จำนวนผู้ใช้ โครงการ เอกสาร revision ไฟล์ ลายมือชื่อ audit และเวลา audit ล่าสุด)
5. เทียบรายงานกับค่าที่คาด (เวลา audit ล่าสุดต้องใกล้เวลาที่สำรอง)
6. รัน `infra/postgres/prod-roles.sql` บนฐานใหม่ (สิทธิ์ `wems_app`)
7. ชี้ `DATABASE_URL` ของ API/worker ไปฐานใหม่ (หรือ rename ฐาน) → เปิดระบบ → ตรวจ `/api/v1/health/ready`, ล็อกอิน, เปิดเอกสาร 1 ฉบับ, ดาวน์โหลด PDF 1 ไฟล์
8. แจ้งผู้ใช้: ข้อมูลหลังเวลาสำรองต้องบันทึกใหม่ (มือถือส่ง outbox ที่ค้างอยู่ให้เองเมื่อออนไลน์)

### 3.2 กู้คืนแบบ point-in-time (pgBackRest)

```bash
systemctl stop wems-api wems-worker
pgbackrest --stanza=wems --type=time --target="2026-10-03 10:45:00+07" --delta restore
systemctl start postgresql   # recovery จบแล้วค่อยเปิด API/worker
```

### 3.3 ไฟล์

- object ถูกลบโดยไม่ตั้งใจ: กู้เวอร์ชันก่อนหน้าใน bucket เดิม (versioning)
- bucket เสียทั้งก้อน: ชี้ `S3_BUCKET`/`S3_ENDPOINT` ไปบัคเก็ตสำรอง หรือ `aws s3 sync s3://wems-replica s3://wems-new`
- ตรวจความครบ: `select count(*) from file_objects where status = 'AVAILABLE'` เทียบกับจำนวน object (ยกเว้น `stamps/`, `previews/`, `transmittals/` ที่สร้างใหม่ได้)

## 4. บันทึกการทดสอบกู้คืน (ทำทุกไตรมาส — `11-testing.md` §4)

| วันที่ | สภาพแวดล้อม | ไฟล์สำรอง | ผล | เวลาที่ใช้ | ผู้ทดสอบ | หมายเหตุ |
|---|---|---|---|---|---|---|
| 2026-10-03 | dev (cloud sandbox) | `wems-db-20261003T122555Z.dump.age` (324 KB) | ✅ ตาราง 87, users 15, documents 30, revisions 25, signature_events 9, audit_logs 158 ตรงกับต้นทางทุกค่า; API ชี้ฐานที่กู้แล้ว `health/ready` ok และล็อกอินได้ | < 1 นาที | Claude (P1-15) | ทดสอบสคริปต์เท่านั้น — ต้องทำซ้ำบน staging พร้อมไฟล์ใน bucket ก่อน pilot |

## 5. สิทธิ์ฐานข้อมูลใน production

`infra/postgres/prod-roles.sql`: `wems_owner` เป็นเจ้าของ schema (ใช้รัน migration), API/worker ต่อด้วย `wems_app` ที่ไม่มีสิทธิ์สร้างตาราง และ **INSERT/SELECT ได้อย่างเดียว** บน `audit_logs` และ `signature_events` (`06-security.md` §9) — ทดสอบแล้ว 2026-10-03: UPDATE/DELETE audit/signature ได้ `permission denied`, INSERT audit ได้, CREATE TABLE ได้ `permission denied for schema public`
