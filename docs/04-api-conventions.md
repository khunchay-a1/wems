# 04 · API conventions

> รายการ endpoint ของแต่ละโมดูลอยู่ในหัวข้อ "API" ของ `modules/*.md` — เอกสารนี้คือกติกาที่ทุก endpoint ต้องทำตาม

## 1. พื้นฐาน

- Base path: `/api/v1` (Nest `setGlobalPrefix('api')` + URI versioning `v1`)
- JSON UTF-8, ชื่อฟิลด์ camelCase, enum ส่งเป็นค่า SCREAMING_SNAKE ตาม Prisma
- Header ที่ client ส่ง: `Accept-Language: th|en` (ค่าเริ่มต้น th), `X-Request-Id` (ถ้าไม่ส่ง server สร้างให้และคืนใน response header)
- ทุก endpoint ต้องมี decorator OpenAPI ครบ (summary, DTO, response, error) และ `operationId` รูปแบบ `<Tag>_<verb><Noun>` เช่น `Documents_listDocuments`, `Reviews_decideStep` — ชื่อนี้กลายเป็นชื่อเมธอดใน client ที่ generate

## 2. การยืนยันตัวตน

| Client | วิธีส่ง token | หมายเหตุ |
|---|---|---|
| Web | cookie `wems_at` (access, httpOnly, Secure, SameSite=Lax, Path=/api) และ `wems_rt` (refresh, httpOnly, Path=/api/v1/auth) | ทุก request ที่เปลี่ยนข้อมูลต้องมี header `X-CSRF-Token` ตรงกับ cookie `wems_csrf` (อ่านได้จาก JS) |
| Mobile | `Authorization: Bearer <access>`; refresh token ส่งใน body ของ `/auth/refresh` | เก็บใน secure storage |

รายละเอียด flow อยู่ใน `06-security.md` §2

## 3. การตั้งชื่อ resource และ action

| รูปแบบ | ใช้เมื่อ | ตัวอย่าง |
|---|---|---|
| `GET /projects/{projectId}/documents` | รายการที่ขึ้นกับ parent | ทะเบียนเอกสารของโครงการ |
| `GET /documents/{id}` | เข้าถึงด้วย id ตรง | รายละเอียดเอกสาร |
| `POST /projects/{projectId}/documents` | สร้างลูก | ลงทะเบียนเอกสาร |
| `PATCH /documents/{id}` | แก้บางฟิลด์ (ต้องส่ง `version`) | แก้ชื่อเอกสาร |
| `DELETE /clients/{id}` | soft delete (ต้องส่ง `?version=`) | |
| `POST /revisions/{id}/submit` | **action** ที่เปลี่ยนสถานะ ใช้คำกริยา | ส่งตรวจ |

- path เป็น kebab-case พหูพจน์ (`/review-steps`, `/design-bases`)
- ซ้อนได้ไม่เกิน 1 ระดับ
- การเปลี่ยนสถานะทำผ่าน action endpoint เท่านั้น — `PATCH` ห้ามแก้ `status`

## 4. Status code

| กรณี | Code |
|---|---|
| อ่านสำเร็จ / action สำเร็จ (คืน resource ล่าสุด) | 200 |
| สร้างสำเร็จ (คืน resource + header `Location`) | 201 |
| สร้างซ้ำด้วย id เดิมจาก client (idempotent) | 200 (คืนแถวเดิม) |
| ลบสำเร็จ | 204 |
| รับงานไปทำเบื้องหลัง (เช่น สร้างรายงานใหญ่) | 202 + `{ jobId }` |
| JSON ผิดรูป / DTO ไม่ผ่าน | 400 `VALIDATION_FAILED` |
| ไม่ได้ล็อกอิน / token หมดอายุ | 401 `UNAUTHENTICATED` / `TOKEN_EXPIRED` |
| มีสิทธิ์เห็น resource แต่ไม่มีสิทธิ์ทำ action | 403 `FORBIDDEN` |
| ไม่พบ **หรือไม่มีสิทธิ์เห็น** (ไม่บอกว่ามีอยู่) | 404 `NOT_FOUND` |
| version ไม่ตรง / สถานะไม่อนุญาต / ซ้ำ | 409 `CONFLICT_STALE_VERSION` / `INVALID_STATE_TRANSITION` / `DUPLICATE` |
| ไฟล์ใหญ่เกิน / ชนิดไม่อนุญาต | 413 `FILE_TOO_LARGE` / 415 `UNSUPPORTED_FILE_TYPE` |
| ขัดกติกาธุรกิจ | 422 + รหัสเฉพาะ เช่น `DOC_PDF_RENDITION_REQUIRED` |
| บัญชีถูกล็อก | 423 `ACCOUNT_LOCKED` |
| เกิน rate limit | 429 `RATE_LIMITED` (+ `Retry-After`) |

## 5. รูปแบบ error (RFC 9457 Problem Details)

`Content-Type: application/problem+json`

```json
{
  "type": "https://wems.local/errors/DOC_PDF_RENDITION_REQUIRED",
  "title": "ต้องมีไฟล์ PDF ก่อนส่งตรวจ",
  "status": 422,
  "detail": "เอกสารประเภท DWG ต้องแนบไฟล์ PDF สำหรับตรวจก่อนส่งตรวจ",
  "instance": "/api/v1/revisions/0192f0c4-.../submit",
  "code": "DOC_PDF_RENDITION_REQUIRED",
  "rule": "BR-DOC-030",
  "errors": [{ "field": "files", "code": "REQUIRED", "message": "ต้องมีไฟล์ PDF" }],
  "requestId": "01J9Z..."
}
```

- `title`/`detail` แปลตาม `Accept-Language` จาก catalog `apps/api/src/common/i18n/errors.{th,en}.json` — web/mobile แสดง `detail` ได้ทันที
- `code` คงที่ ใช้ใน test และ logic ฝั่ง client; `rule` = รหัสกติกาธุรกิจที่ละเมิด (ถ้ามี)
- ห้ามส่ง stack trace/ข้อความจากฐานข้อมูลออกไป (log ฝั่ง server พร้อม requestId แทน)

## 6. รายการและการค้นหา

Query parameter มาตรฐาน:

| Param | ความหมาย | ตัวอย่าง |
|---|---|---|
| `page`, `pageSize` | หน้า (เริ่ม 1), ขนาด (ค่าเริ่มต้น 25, สูงสุด 100) | `?page=2&pageSize=50` |
| `sort` | ฟิลด์เรียง คั่นด้วย `,` ขึ้นต้น `-` = มากไปน้อย (ต้องอยู่ใน allowlist ของ endpoint) | `?sort=-updatedAt,number` |
| `q` | ค้นหาข้อความ (trigram) | `?q=ถังตกตะกอน` |
| ฟิลด์กรอง | ค่าเดียวหรือหลายค่าคั่น `,` | `?status=IN_REVIEW,APPROVED&disciplineId=...` |
| ช่วงเวลา | `<field>From`, `<field>To` (ISO date) | `?updatedFrom=2026-09-01` |

Response แบบรายการ:

```json
{ "data": [ { "...": "..." } ], "meta": { "page": 1, "pageSize": 25, "total": 312 } }
```

Feed ที่ยาว (notification, audit, sync) ใช้ cursor: `?cursor=<opaque>&limit=100` → `{ "data": [...], "meta": { "nextCursor": "..." | null } }`

Resource เดี่ยวคืน object ตรงๆ ไม่ห่อ `data`

## 7. Response DTO

- ห้ามคืน Prisma object ตรงๆ — map เป็น response DTO เสมอ (ไม่หลุด `passwordHash`, `mfaSecretEnc`, token hash)
- ทุก resource ที่มีสถานะคืน **`allowedActions: string[]`** ที่ server คำนวณจากสิทธิ์ + สถานะ + กติกา เช่น `["upload","submit","void"]` — web/mobile ใช้แสดง/ซ่อนปุ่ม **ห้าม** คำนวณกติกาซ้ำฝั่ง client
- action หลักที่ผู้ใช้มีสิทธิ์แต่ยังทำไม่ได้เพราะเงื่อนไขไม่ครบ คืนใน **`blockedActions: { action, code }[]`** เช่น `{ "action": "submit", "code": "DOC_PDF_RENDITION_REQUIRED" }` — UI แสดงปุ่มแบบ disabled พร้อมเหตุผล (แปลจาก `code`)
- ทุก resource ที่แก้ได้คืน `version`
- ผู้ใช้ที่อ้างถึงคืนเป็น `{ id, displayName }` (ย่อ) ไม่ต้อง include ทั้ง object
- Decimal คืนเป็น string, วันที่อย่างเดียวเป็น `"YYYY-MM-DD"` (ดู `03-data-model.md` §4)

## 8. Concurrency และ idempotency

**Optimistic locking** — `PATCH` และ action ทุกตัวต้องส่ง `version` ที่ client เห็นล่าสุด; ไม่ตรง → 409 `CONFLICT_STALE_VERSION` พร้อม resource ปัจจุบันใน `current` ของ problem

**Idempotency-Key** — header UUID สำหรับ action ที่ไม่ควรเกิดซ้ำ:
- **บังคับ** สำหรับ request จากมือถือทุก `POST` ที่สร้าง/เปลี่ยนข้อมูล (ยกเว้น `/auth/*` และ `/files/upload-url`) และสำหรับ action สำคัญจากเว็บ (`submit`, `decision`, `send`, `issue`)
- server เก็บ `(userId, key) → { requestHash, status, body }` 24 ชั่วโมง (`IdempotencyRecord`)
- key เดิม + body เดิม → คืนผลเดิม; key เดิม + body ต่าง → 422 `IDEMPOTENCY_KEY_REUSED`

**id จาก client** — entity ที่สร้างออฟไลน์ส่ง `id` (UUIDv7) มากับ `POST`; ถ้ามีแล้วและเป็นของผู้ใช้เดิม → 200 คืนแถวเดิม; เป็นของคนอื่น → 409 `DUPLICATE`

## 9. ไฟล์

```text
POST /files/upload-url         { originalName, mimeType, sizeBytes, purpose }  → 201 { fileId, uploadUrl, method:"PUT", headers, expiresAt }
POST /files/{id}/complete      → 200 FileDto (status PROCESSING)
GET  /files/{id}               → FileDto (status, sha256, pageCount, previewUrl)
GET  /files/{id}/download-url  → { url, expiresAt }   (presigned 5 นาที)
```

- `purpose` เช่น `DOCUMENT_REVISION`, `ATTACHMENT`, `SIGNATURE_IMAGE`, `LICENSE_SCAN` ใช้เลือกชนิด/ขนาดที่อนุญาต
- การผูกไฟล์กับ entity ทำผ่าน endpoint ของ entity นั้น (เช่น `POST /revisions/{id}/files { fileId, role }`) — สิทธิ์ดาวน์โหลดคิดจาก entity ที่ผูก

## 10. เหตุการณ์แบบ realtime (เว็บ)

`GET /events` (Server-Sent Events, ใช้ cookie) ส่ง event:

| event | data | ใช้ทำอะไร |
|---|---|---|
| `notification.created` | `{ id, type, title }` | เพิ่มตัวเลขกระดิ่ง |
| `review.updated` | `{ cycleId, revisionId }` | refresh หน้าตรวจ |
| `document.updated` | `{ documentId, projectId }` | invalidate query ของทะเบียน |
| `file.processed` | `{ fileId, status }` | อัปเดตสถานะอัปโหลด |

ส่ง heartbeat ทุก 25 วินาที; หลาย instance กระจาย event ผ่าน Redis pub/sub; มือถือใช้ FCM แทน SSE

## 11. Rate limit

| กลุ่ม | ขีดจำกัด |
|---|---|
| `/auth/login`, `/auth/refresh`, การยืนยันลายมือชื่อ | 10 ครั้ง/นาที ต่อ IP+อีเมล |
| API ทั่วไป | 300 ครั้ง/นาที ต่อผู้ใช้ |
| ลิงก์ใบนำส่งสาธารณะ | 30 ครั้ง/นาที ต่อ IP |

## 12. เวอร์ชันและความเข้ากันได้ของมือถือ

- เพิ่มฟิลด์/endpoint ใหม่ = ไม่ต้องเปลี่ยนเวอร์ชัน; ลบ/เปลี่ยนความหมาย = ต้องทำ `/api/v2` เฉพาะ endpoint นั้น หรือรอให้แอปทุกเครื่องอัปเดตก่อน
- `GET /app/config` (ไม่ต้องล็อกอิน) คืน `{ minSupportedVersion: { android, ios }, latestVersion, maintenanceMessage? }` — แอปที่ต่ำกว่า `minSupportedVersion` ต้องบังคับอัปเดต
- client ที่ generate ต้องทนต่อค่า enum ใหม่ (`unknown_enum_value: true` ใน swagger_parser)

## 13. รายการ error code

ทุก code ต้องมีข้อความใน `errors.th.json` และ `errors.en.json` — รหัสของโมดูลเอกสารดูตารางเต็มใน `modules/M04-design-documents.md` §11

| Code | HTTP | ที่มา |
|---|---|---|
| `VALIDATION_FAILED` | 400 | DTO ไม่ผ่าน |
| `UNAUTHENTICATED` / `TOKEN_EXPIRED` / `INVALID_CREDENTIALS` | 401 | `06-security.md` §2 |
| `FORBIDDEN` | 403 | มีสิทธิ์เห็นแต่ทำ action ไม่ได้ |
| `NOT_FOUND` | 404 | ไม่มีหรือไม่มีสิทธิ์เห็น |
| `CONFLICT_STALE_VERSION` / `INVALID_STATE_TRANSITION` / `DUPLICATE` | 409 | §8, `05-workflows.md` |
| `SYNC_CURSOR_EXPIRED` | 410 | `08-mobile.md` §5.1 |
| `SYNC_SCOPE_FORBIDDEN` | 403 | `08-mobile.md` §5.1 |
| `FILE_TOO_LARGE` / `UNSUPPORTED_FILE_TYPE` | 413 / 415 | M01 §5 |
| `IDEMPOTENCY_KEY_REUSED` | 422 | §8 |
| `ACCOUNT_LOCKED` | 423 | `06-security.md` §2.1 |
| `RATE_LIMITED` | 429 | §11 |
| `LAST_ADMIN` | 422 | BR-PLT-002 |
| `CLIENT_IN_USE` | 409 | BR-CRM-003 |
| `MEMBER_HAS_PENDING_REVIEWS` / `PROJECT_HAS_OPEN_ITEMS` | 409 | BR-PRJ-003 / BR-PRJ-021 |
| `DOC_*`, `TRN_*`, `DBS_*`, `IMPORT_INVALID_ROWS` | ตามตาราง | M04 §11 |
| `LAB_INSTRUMENT_NOT_USABLE` / `LAB_SELF_APPROVAL` | 422 | BR-LAB-030 / BR-LAB-040 |
| `SMP_CONTAINER_ALREADY_LINKED` | 409 | BR-SMP-013 |
| `TS_DAILY_LIMIT` | 422 | BR-COM-020 |

โมดูลในเฟสหลังเพิ่ม code ในรูปแบบ `<PREFIX>_<คำอธิบาย>` (`SITE_`, `LAB_`, `SMP_`, `COM_`/`TS_`) และเพิ่มแถวในตารางนี้

## 14. Endpoint ระบบ

| Endpoint | ใช้ทำอะไร |
|---|---|
| `GET /health/live` | process ยังทำงาน |
| `GET /health/ready` | DB, Redis, S3 พร้อม |
| `GET /app/config` | ค่าตั้งสำหรับแอป |
| `GET /sync/pull` | pull sync ของมือถือ (ดู `08-mobile.md` §5) |
| `GET /events` | SSE สำหรับเว็บ |
