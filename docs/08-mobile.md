# 08 · Mobile app (Flutter)

## 1. เป้าหมายตามเฟส

| เฟส | ความสามารถ | ออฟไลน์ |
|---|---|---|
| 1 | ล็อกอิน, โครงการที่ติดตาม, ทะเบียนเอกสาร, เปิด PDF ฉบับใช้งาน, ปักหมุดเอกสารไว้ใช้ออฟไลน์, กล่องงานตรวจ + ตัดสิน/ลงนาม, แจ้งเตือน push | ดูทะเบียนและ PDF ที่ปักหมุด (ตัดสินงานตรวจต้องออนไลน์) |
| 2 | รายงานประจำวัน, ปัญหาหน้างาน (รูป + ปักหมุดบนแบบ), checklist, คำถามหน้างาน | สร้าง/แก้/ส่งได้ทั้งหมด แล้ว sync ภายหลัง |
| 3 | ทริปเก็บตัวอย่าง, สแกน QR ขวด, ค่าภาคสนาม, ลายมือชื่อ, ส่งมอบตัวอย่าง | ทั้งหมด |

## 2. Stack

| เรื่อง | แพ็กเกจ | หมายเหตุ |
|---|---|---|
| Framework | Flutter stable + Dart 3 | Material/Cupertino แยกเป็นแพ็กเกจ `material_ui`/`cupertino_ui` แล้ว — ใช้ตาม template ของ `flutter create` เวอร์ชันที่ใช้ และห้าม import `package:flutter/material.dart` ปนกับ `package:material_ui/...` |
| State / DI | `flutter_riverpod` + `riverpod_generator` | |
| Routing | `go_router` | deep link จาก push |
| API client | `dio` + `retrofit` สร้างด้วย `swagger_parser` (json_serializer: `freezed`) จาก `packages/api-contract/openapi.json` | ห้ามแก้โค้ดที่ generate · **เฟส 1** ใช้ `lib/core/api/wems_api.dart` เขียนมือ (ชื่อเมธอดตาม operationId) เพราะใช้ไม่กี่ endpoint; `swagger_parser.yaml` เตรียมไว้แล้ว |
| Local DB | `drift` (SQLite) | แนะนำเปิดการเข้ารหัสด้วย SQLCipher ตั้งแต่เฟส 2 (ตามคู่มือ drift) |
| Secure storage | `flutter_secure_storage` | refresh token, DB key |
| PDF | `pdfrx` (MIT) | render + overlay หมุดความเห็นเอง; pdfrx 2.5+ ใช้ `material_ui` ต้องตั้ง localizations ตามเอกสารของแพ็กเกจ |
| Push | `firebase_messaging` + `flutter_local_notifications` | |
| เบื้องหลัง | `workmanager` | Android ทุก 15 นาทีขั้นต่ำ; iOS best effort |
| เครือข่าย | `connectivity_plus` | trigger sync เมื่อกลับมาออนไลน์ |
| กล้อง/รูป | `image_picker` (หรือ `camera`), `flutter_image_compress` | เฟส 2 |
| GPS | `geolocator` | เฟส 2–3 |
| QR | `mobile_scanner` | เฟส 3 |
| ลายมือชื่อ | `signature` | เฟส 3 |
| อื่นๆ | `uuid` (v7), `intl` + gen-l10n (th, en), `package_info_plus`, `local_auth` (ล็อกแอป), `sentry_flutter` | |

## 3. โครงสร้างโปรเจกต์

```text
apps/mobile/
├── lib/
│   ├── main.dart                       # อ่าน flavor จาก --dart-define-from-file
│   ├── app/                            # app.dart, router.dart, theme.dart
│   ├── l10n/                           # app_th.arb, app_en.arb (คีย์ enum* และ enum_labels.dart generate จาก enum-labels.json ด้วย tools/gen-i18n-enums.mjs — gen-l10n รับ ARB ได้ไฟล์เดียวต่อภาษา)
│   ├── core/
│   │   ├── api/                        # dio + interceptors (auth, csrf-free bearer, idempotency, request-id, locale)
│   │   │   └── generated/              # swagger_parser output (ห้ามแก้)
│   │   ├── auth/                       # session repository, token store, refresh single-flight
│   │   ├── db/                         # drift database, tables, DAOs, migrations
│   │   ├── sync/                       # pull_sync.dart, outbox_processor.dart, upload_queue.dart, sync_scheduler.dart
│   │   ├── files/                      # offline document store (pin, verify sha256, eviction)
│   │   ├── push/                       # FCM registration + deep link mapper
│   │   └── util/                       # uuid7, thai_date.dart (พ.ศ.), result types
│   └── features/
│       ├── auth/  home/  projects/  documents/  reviews/  notifications/  settings/
│       ├── daily_reports/  issues/  inspections/  site_queries/      # เฟส 2
│       └── sampling/                                                   # เฟส 3
│           └── (แต่ละ feature) data/ · application/ · presentation/
├── test/                               # unit + widget
└── integration_test/
```

กติกา: widget ไม่เรียก API ตรง → ผ่าน repository (อ่านจาก drift เป็นหลัก, เขียนผ่าน outbox สำหรับ entity ออฟไลน์); ทุกข้อความผ่าน `AppLocalizations`

## 4. Auth

- login → เก็บ refresh token ใน secure storage, access token ในหน่วยความจำ; ส่ง `platform`, `deviceId` (สุ่มครั้งแรกแล้วเก็บ), `deviceName`
- interceptor: 401 `TOKEN_EXPIRED` → refresh ครั้งเดียว (single-flight) แล้ว retry; refresh ล้ม → หน้า login
- logout ปกติ: ถ้ามี outbox ค้าง → เตือน "มีข้อมูลยังไม่ส่ง N รายการ" ให้ sync ก่อน; ออกแล้วลบข้อมูลในเครื่องทั้งหมด
- ถูกเพิกถอน session: ลบ PDF ที่ปักหมุดและข้อมูล cache ทันที แต่เก็บ outbox + ไฟล์ที่รออัปโหลดไว้จนกว่าผู้ใช้เดิมล็อกอินกลับมา (ผู้ใช้อื่นล็อกอิน → ลบทั้งหมด)
- ตัวเลือกล็อกแอปด้วย biometric เมื่อกลับมาจากเบื้องหลัง > 5 นาที

## 5. Sync

### 5.1 Pull (server → เครื่อง)

```text
GET /api/v1/sync/pull?scope=project:<uuid>&cursor=<opaque>&limit=500
```

```json
{
  "scope": "project:0192f0c4-…",
  "changes": [
    { "entityType": "Document", "op": "UPSERT", "id": "…", "data": { "…": "DocumentSyncDto" } },
    { "entityType": "DocumentRevision", "op": "DELETE", "id": "…" }
  ],
  "nextCursor": "c2VxOjEyMzQ1",
  "hasMore": false,
  "serverTime": "2026-09-26T10:00:00.000Z"
}
```

- scope ที่เครื่องติดตาม: `global`, `user:<me>`, `project:<id>` ของโครงการที่ผู้ใช้เลือก "ติดตามบนมือถือ" (ค่าเริ่มต้น = โครงการที่เป็นสมาชิกและ ACTIVE), (เฟส 3) `trip:<id>`
- เก็บ cursor แยกต่อ scope; ไม่มี cursor = **snapshot** (server จำ `maxSeq` ตอนเริ่ม ส่ง entity ปัจจุบันทั้งหมดทีละหน้า หน้าสุดท้ายคืน cursor = `maxSeq` แล้วต่อด้วย change log)
- server อ่าน `change_logs` ที่ `scopeKey = scope AND seq > cursor` รวมรายการซ้ำของ entity เดียวกัน แล้วโหลดข้อมูลปัจจุบันเป็น `*SyncDto` (DTO แบบย่อ)
- entity ออกจาก scope (เช่น ขั้นตรวจถูกมอบให้คนอื่น) → server เขียน `DELETE` ใน scope เดิม
- cursor เก่ากว่าที่เก็บ (90 วัน) → 410 `SYNC_CURSOR_EXPIRED` → ลบข้อมูลของ scope แล้ว snapshot ใหม่
- ไม่มีสิทธิ์ scope แล้ว → 403 `SYNC_SCOPE_FORBIDDEN` → ลบข้อมูลของ scope

Entity ที่ sync ในเฟส 1 (payload = `*SyncDto` ใน OpenAPI):

| scope | entityType (ลำดับใน snapshot) | หมายเหตุ |
|---|---|---|
| `global` | `Discipline`, `DocumentType` (`MasterItemSyncDto`) | รวมรายการที่ปิดใช้ (`isActive=false`) |
| `user:<me>` | `ReviewStep` (`MyReviewStepDto`) | เฉพาะขั้นที่ `ACTIVE` ในรอบ `IN_PROGRESS`; ตัดสินแล้ว/ถูกมอบให้คนอื่น/ยกเลิกรอบ → `DELETE` |
| `project:<id>` | `Project`, `ProjectMember` (`id` = userId), `Document`, `DocumentRevision` | `DocumentFile` ไม่แยกเป็น entity — ฝังเป็น `files[]` (เฉพาะไฟล์ current) ใน `DocumentRevisionSyncDto`; ไม่มี `document.read` = ไม่ส่งเอกสาร |

- `Notification` ไม่ sync ผ่าน change log — แอปอ่าน `GET /notifications` ตอนออนไลน์และ cache หน้าแรกไว้ใน drift (เปลี่ยนจากร่างเดิม: แจ้งเตือนสร้างโดย worker นอก transaction ของข้อมูล จึงไม่มี change log ที่เชื่อถือได้)
- cursor มีเวลาออกฝังอยู่: ไม่ได้ pull นานกว่า 90 วัน (ระยะเก็บ change log ของงาน cleanup) → 410; cursor ที่ไม่ได้ออกโดย server → 400 `VALIDATION_FAILED`
- `limit` ค่าเริ่มต้น 500 สูงสุด 1000; snapshot เสร็จแล้ว `hasMore` = มี change log ใหม่หลังจุดเริ่ม snapshot หรือไม่

### 5.2 Push (เครื่อง → server) — outbox

ตาราง drift `outbox`:

| คอลัมน์ | ความหมาย |
|---|---|
| `seq` | ลำดับ (autoincrement) |
| `method`, `path`, `body` | request ที่จะส่ง |
| `idempotencyKey` | UUID สร้างตอนเข้าคิว (ส่งซ้ำใช้ค่าเดิม) |
| `entityType`, `entityId` | entity ที่เกี่ยวข้อง (ใช้แสดงสถานะในหน้าจอ) |
| `dependsOnSeq` | ต้องรอรายการนี้สำเร็จก่อน (เช่น สร้างรายงานก่อนแนบรูป) |
| `status` | `PENDING` · `IN_FLIGHT` · `DONE` · `FAILED` (ต้องให้ผู้ใช้แก้) · `CONFLICT` |
| `attempts`, `nextAttemptAt`, `lastError` | retry |

การประมวลผล:
1. ทำตามลำดับ `seq`; รายการที่ `dependsOnSeq` ยังไม่ DONE ให้ข้าม
2. body อ้างไฟล์ที่ยังอัปโหลดไม่เสร็จด้วย placeholder `"$upload:<uploadId>"` → แทนด้วย `fileId` จริงก่อนส่ง
3. 2xx → DONE และ upsert ผลลัพธ์ลง drift; 409 → CONFLICT (แสดงเทียบข้อมูล server/เครื่อง ให้ผู้ใช้เลือก); 4xx อื่น → FAILED (แสดงข้อความจาก problem+json ให้แก้แล้วส่งใหม่); 5xx/เครือข่าย → backoff 5 วินาที, 30 วินาที, 2 นาที, 10 นาที, สูงสุดทุก 1 ชั่วโมง
4. เรียก pull ของ scope ที่เกี่ยวข้องหลัง push ชุดหนึ่งเสร็จ

Trigger sync: เปิดแอป, กลับมาออนไลน์, หลังบันทึกข้อมูล (debounce 2 วินาที), ดึงหน้าจอลงเพื่อรีเฟรช, งานเบื้องหลังทุก 15 นาที

### 5.3 อัปโหลดไฟล์ (เฟส 2–3)

- ถ่ายรูป → บีบอัด (ด้านยาว ≤ 2048 px, JPEG คุณภาพ 80) → เก็บในโฟลเดอร์แอป → เข้าคิว `upload_queue` → `POST /files/upload-url` → PUT → `POST /files/{id}/complete` → ปลด placeholder ใน outbox
- เก็บเวลาถ่ายและพิกัดจากเครื่องไว้ส่งใน `Attachment.takenAt/latitude/longitude`
- ลบไฟล์ในเครื่องหลังอัปโหลดสำเร็จและ entity DONE แล้ว 7 วัน

### 5.4 เวลาและ id

- entity ที่สร้างบนเครื่องใช้ UUIDv7 จากเครื่อง (`03-data-model.md` §3)
- เวลาจากเครื่อง (`takenAt`, `sampledAt`) ส่งตามจริง; ถ้า `serverTime` ต่างจากเวลาเครื่อง > 10 นาที แสดงคำเตือนให้ตั้งเวลาเครื่องอัตโนมัติ

## 6. เอกสารออฟไลน์ (เฟส 1)

- ปุ่ม "ปักหมุดไว้ใช้ออฟไลน์" ที่เอกสาร → ดาวน์โหลด PDF ฉบับใช้งาน (`latestApprovedRevisionId`, ประทับตราจาก server) → ตรวจ sha256 กับค่า `sha256` ใน `GET /revisions/{id}/download` (hash ของไฟล์ที่ประทับตราแล้วที่ URL นั้นให้มา) → เก็บพร้อม metadata
- sync พบ `latestApprovedRevisionId` เปลี่ยน → ไฟล์เดิมถูกทำเครื่องหมาย "ฉบับเก่า" (แถบแดงบนหน้าจอ PDF ทุกหน้า) + push `revision.superseded` → ดาวน์โหลดฉบับใหม่อัตโนมัติเมื่อใช้ Wi-Fi (ตั้งค่าได้) แล้วลบฉบับเก่า
- เปิด PDF ที่ไม่ได้ปักหมุดขณะออนไลน์ = cache ชั่วคราว (LRU, รวมไม่เกินที่ตั้งไว้ ค่าเริ่มต้น 2 GB)
- หน้า "พื้นที่เก็บข้อมูล" แสดงเอกสารที่ปักหมุด ขนาด และปุ่มลบ

## 7. หน้าจอเฟส 1

| หน้าจอ | เนื้อหา |
|---|---|
| Login / MFA | อีเมล รหัสผ่าน, รหัส TOTP, ข้อความ error จาก server |
| หน้าแรก | จำนวนงานตรวจที่รอ (ใกล้ครบกำหนดก่อน), เอกสารที่ปักหมุดและสถานะ "ฉบับเก่า", แจ้งเตือนล่าสุด, สถานะ sync (ล่าสุดเมื่อ, รายการค้าง) |
| โครงการ | รายการโครงการที่ติดตาม + สวิตช์ติดตาม/เลิกติดตาม |
| ทะเบียนเอกสาร | ค้นหา (ออฟไลน์ค้นใน drift), กรองสาขา/ประเภท/สถานะ, แสดงฉบับใช้งานและสัญลักษณ์ปักหมุด |
| รายละเอียดเอกสาร | revision ทั้งหมด (สถานะ, วัตถุประสงค์, วันที่), ฉบับใช้งานเด่นชัด, ปุ่มเปิด PDF / ปักหมุด |
| PDF viewer | pdfrx, zoom/pinch, หน้าถัดไป, แถบสถานะ revision (และแถบแดงถ้าฉบับเก่า), แสดงหมุดความเห็น (ออนไลน์) |
| กล่องงานตรวจ | ขั้นที่ ACTIVE ของฉัน เรียงตาม `dueAt`, ป้ายเลยกำหนด |
| หน้าตรวจ | PDF + รายการความเห็น (เพิ่มหมุดด้วยการแตะค้าง), bottom sheet ตัดสิน (ผ่าน/ผ่านตามความเห็น/ตีกลับ + หมายเหตุ) → dialog ลงนาม (รหัสผ่านหรือ PIN) — ต้องออนไลน์ |
| แจ้งเตือน | รายการ + แตะเพื่อไปหน้าที่เกี่ยวข้อง |
| ตั้งค่า | ภาษา, ปฏิทิน พ.ศ./ค.ศ., ดาวน์โหลดเฉพาะ Wi-Fi, ขนาด cache, ล็อกแอป, PIN ลงนาม (ตั้งบนเว็บ), เวอร์ชันแอป |

## 8. Push และ deep link

- ลงทะเบียน FCM token หลัง login (`POST /push-devices`) และเมื่อ token เปลี่ยน; ลบเมื่อ logout
- data payload `{ type, entityType, entityId, projectId, notificationId, link }` (`link` = path ของหน้าเว็บที่เกี่ยวข้อง ใช้หา documentId) → map เป็น route (`lib/core/push/deep_links.dart`):

| type | route |
|---|---|
| `review.step.activated`, `review.step.due_soon`, `review.step.overdue`, `review.step.reassigned` | `/reviews/:stepId` |
| `revision.approved`, `revision.rejected`, `revision.superseded` | `/projects/:projectId/documents/:documentId` |
| `transmittal.client_response_recorded` | `/projects/:projectId/documents/:documentId` |
| `comment.created` | `/projects/:projectId/documents/:documentId?comment=:id` |
| (เฟส 2–3) `issue.assigned`, `dailyreport.returned`, `sampletest.holding_time_warning` … | หน้าของ entity นั้น |

- แอปอยู่เบื้องหน้า → แสดง banner ในแอป; เบื้องหลัง → การแจ้งเตือนของระบบ

## 9. หน้าจอเฟส 2–3 (สรุป — รายละเอียดใน M05, M07)

- **เฟส 2**: แท็บ "วันนี้" ต่อโครงการ, ฟอร์มรายงานประจำวันแบบขั้นตอน, สร้างปัญหา (รูป → ตำแหน่งบนแบบ/GPS → รายละเอียด), รายการปัญหาที่ฉันรับผิดชอบ + อัปเดตสถานะพร้อมรูปหลังแก้, checklist ทีละข้อ, คำถามหน้างาน; ทุกฟอร์มบันทึกร่างอัตโนมัติและแสดงสถานะ sync ต่อรายการ (รอส่ง/ส่งแล้ว/ต้องแก้)
- **เฟส 3**: ทริปของฉัน, แผนที่และลำดับจุด, flow ต่อจุด (เช็กอิน GPS → รูป → ค่าภาคสนาม + เครื่องมือ → สแกน QR ขวด → ลายมือชื่อตัวแทนลูกค้า → เสร็จ), ส่งมอบตัวอย่าง (ลายมือชื่อทั้งสองฝ่าย)

## 10. Build และการแจกจ่าย

- Flavor: `dev`, `staging`, `prod` — bundle id ต่างกัน, ไอคอนต่างสี, ค่า API base URL จาก `--dart-define-from-file=env/<flavor>.json`
- เวอร์ชัน `major.minor.patch+build`; เช็ก `/app/config` ตอนเปิดแอป ต่ำกว่า `minSupportedVersion` → บังคับอัปเดต
- ทดสอบภายใน: Firebase App Distribution (Android), TestFlight (iOS)
- ใช้งานจริง (แอปภายในองค์กร): Android — Managed Google Play (private app) หรือ MDM; iOS — Apple Business Manager (custom app) หรือ TestFlight ระยะสั้น — **เลือกใน open-questions**
- CI: `flutter pub get` (gen-l10n), `dart run build_runner build --delete-conflicting-outputs` (drift — ไฟล์ `*.g.dart` และ `lib/l10n/gen/` ไม่ commit), `flutter analyze --no-fatal-infos`, `flutter test`, build APK debug flavor dev

## 11. การทดสอบมือถือ

- Unit: outbox processor (ลำดับ, dependsOn, placeholder, backoff, 409/4xx/5xx), pull sync (snapshot → changes, 410, 403), thai_date, revision banner logic — ใช้ fake API และ drift in-memory
- Widget: หน้าทะเบียน (ออฟไลน์), หน้าตรวจ (ปุ่มตาม `allowedActions`), dialog ลงนาม
- Integration (`integration_test`): login → ติดตามโครงการ → ปักหมุด PDF → ตัดเน็ต → เปิด PDF ได้ → ต่อเน็ต → ได้ฉบับใหม่; อนุมัติงานตรวจด้วย PIN (ต่อ API staging หรือ mock server)
