# M01 · Platform (เฟส 0)

> Data model: `core.prisma` · ความปลอดภัย: `06-security.md` · สถาปัตยกรรม worker/outbox: `02-architecture.md` §6

## 1. ขอบเขต

การยืนยันตัวตนและ session, ผู้ใช้/แผนก/บทบาท/สิทธิ์, ใบอนุญาตวิชาชีพ, ค่าตั้งระบบ, บริการออกเลขเอกสาร, บริการไฟล์, ความเห็นแบบ polymorphic, การแจ้งเตือน (in-app/อีเมล/push/SSE), audit, change log สำหรับ sync, outbox + worker, ปฏิทินวันทำการ, ค่าตั้งแอปมือถือ, health check

## 2. กติกาธุรกิจ

- **BR-PLT-001** อีเมลผู้ใช้ไม่ซ้ำ (เก็บตัวพิมพ์เล็ก); ปิดใช้งานแทนการลบ; ปิดแล้ว session ทั้งหมดถูกเพิกถอน
- **BR-PLT-002** ต้องมีผู้ใช้ที่มีบทบาท ADMIN และ active อย่างน้อย 1 คนเสมอ (ห้ามถอดบทบาท/ปิดคนสุดท้าย)
- **BR-PLT-003** บทบาทระบบ (`isSystem`) ลบไม่ได้ แต่แก้สิทธิ์ได้; เปลี่ยนสิทธิ์ของบทบาทมีผลทันที (เพิ่ม `perms_ver`)
- **BR-PLT-004** ใบอนุญาต (`ProfessionalLicense`) เพิ่ม/แก้ได้โดย `user.manage`; ผู้ใช้เพิ่มของตัวเองได้แต่ต้องให้ `user.manage` ยืนยัน (`verifiedAt`) ก่อนนำไปใช้ตาม BR-DOC-040
- **BR-PLT-010** ออกเลข: อ่าน `NumberingScheme` (scope โครงการก่อน แล้ว GLOBAL) → สร้าง sequence key → `INSERT ... ON CONFLICT (key) DO UPDATE SET current_value = number_sequences.current_value + 1 RETURNING current_value` **ใน transaction เดียวกับการสร้างเอกสาร** — rollback แล้วเลขอาจข้าม (ยอมรับได้) แต่ห้ามซ้ำ
- **BR-PLT-011** เลขที่ได้ต้องไม่ชนกับ unique ที่มีอยู่ (กรณีนำเข้าเลขเดิม) — ถ้าชน ให้เลื่อนตัวนับแล้วลองใหม่สูงสุด 5 ครั้ง
- **BR-PLT-020** ไฟล์: ขั้นตอน upload-url → PUT → complete → worker ประมวลผล (ดู `02-architecture.md` §7); ไฟล์ที่ยังไม่ AVAILABLE ผูกกับ entity ได้แต่ใช้ส่งตรวจ/ส่งลูกค้าไม่ได้
- **BR-PLT-021** ไฟล์ `PENDING_UPLOAD` เกิน 24 ชั่วโมง → DELETED (cleanup); ไฟล์ที่ไม่มีใครอ้างอิงเกิน 7 วัน → DELETED
- **BR-PLT-022** ไฟล์ที่ sha256 ซ้ำกับไฟล์ที่มีอยู่ของผู้ใช้เดียวกันในเอกสารเดียวกัน → เตือน "ไฟล์นี้เคยอัปโหลดแล้ว" (ไม่บล็อก)
- **BR-PLT-030** การแจ้งเตือนสร้างจาก outbox handler เท่านั้น (ไม่สร้างใน request); ผู้ใช้ไม่ได้รับแจ้งเตือนจากการกระทำของตนเอง
- **BR-PLT-031** อีเมลแจ้งเตือนรวบ (digest) เมื่อมี event ชนิดเดียวกันถึงผู้ใช้คนเดียวกันเกิน 5 ครั้งใน 10 นาที — ฉบับที่ 6 เป็นต้นไปถูกพักไว้ และงาน `email-digest` (ทุก 10 นาที) ส่งรวมเป็นอีเมลเดียว
- **BR-PLT-040** วันทำการ: จ.–ศ. ยกเว้นวันใน setting `calendar.holidays` (รายการวันที่ `YYYY-MM-DD` ที่ ADMIN ดูแลทุกปี); ฟังก์ชัน `addWorkingDays(date, n)` ใช้ทั้งระบบ

## 3. ผู้ใช้และสิทธิ์

- หน้าผู้ดูแล: รายชื่อผู้ใช้ (ค้นหา กรองบทบาท/แผนก/สถานะ), สร้าง/แก้, ตั้งรหัสชั่วคราว, ปลดล็อก, บังคับออกจากระบบ, จัดการใบอนุญาต
- `GET /users/directory` คืน `{ id, displayNameTh, displayNameEn, position, departmentId, isActive, avatarUrl }` ของทุกคน (ข้อมูลน้อยที่สุด) สำหรับแสดงชื่อและเลือกคน — cache ฝั่ง client 10 นาที
- โปรไฟล์ของตัวเอง: ชื่อ เบอร์ ภาษา ปฏิทิน รูป ลายมือชื่อ (PNG พื้นใส ≤ 2 MB) PIN ลงนาม MFA การแจ้งเตือน session ที่เปิดอยู่

## 4. บริการออกเลข

Token ที่ใช้ใน `NumberingScheme.pattern`:

| Token | ค่า |
|---|---|
| `{YYYY}` / `{YY}` | ปี ค.ศ. 4 / 2 หลัก (เวลา Asia/Bangkok) |
| `{BYYYY}` / `{BYY}` | ปี พ.ศ. 4 / 2 หลัก |
| `{MM}` | เดือน 2 หลัก |
| `{PROJECT}` | `Project.code` |
| `{CLIENT}` | `Client.code` |
| `{DISCIPLINE}` | `Discipline.code` |
| `{TYPE}` | `DocumentType.code` |
| `{SEQ:n}` | เลขรัน เติม 0 ให้ครบ n หลัก (เกินแล้วขยายหลักเอง) |

Sequence key = `<entity>|<ค่าของ token ทุกตัวยกเว้น SEQ>|<ช่วง reset>` เช่น DOCUMENT → `DOCUMENT|P26-001|PR|DWG`, SAMPLE (YEARLY) → `SAMPLE|2026`

ค่าตั้งต้น (`docs/data/seed/numbering-schemes.csv`):

| Entity | Pattern | Reset | ตัวอย่าง |
|---|---|---|---|
| PROJECT | `P{YY}-{SEQ:3}` | YEARLY | `P26-001` |
| DOCUMENT | `{PROJECT}-{DISCIPLINE}-{TYPE}-{SEQ:3}` | NEVER | `P26-001-PR-DWG-001` |
| TRANSMITTAL | `TR-{PROJECT}-{SEQ:3}` | NEVER | `TR-P26-001-001` |
| ISSUE | `IS-{PROJECT}-{SEQ:4}` | NEVER | `IS-P26-001-0001` |
| INSPECTION | `IN-{PROJECT}-{SEQ:4}` | NEVER | `IN-P26-001-0001` |
| SITE_QUERY | `SQ-{PROJECT}-{SEQ:3}` | NEVER | `SQ-P26-001-001` |
| LAB_JOB | `LJ{YY}-{SEQ:5}` | YEARLY | `LJ26-00001` |
| SAMPLE | `S{YY}-{SEQ:6}` | YEARLY | `S26-000001` |
| ANALYSIS_BATCH | `B{YY}{MM}-{SEQ:4}` | MONTHLY | `B2609-0001` |
| TEST_REPORT | `RPT{YY}-{SEQ:5}` | YEARLY | `RPT26-00001` |
| SAMPLING_TRIP | `TRP{YY}-{SEQ:4}` | YEARLY | `TRP26-0001` |
| QUOTATION | `QT{YY}-{SEQ:4}` | YEARLY | `QT26-0001` |
| BILLING | `BR{YY}-{SEQ:4}` | YEARLY | `BR26-0001` |

รูปแบบจริง (พ.ศ./ค.ศ., prefix) ให้บริษัทยืนยัน — เปลี่ยนได้ที่หน้าผู้ดูแลโดยไม่ต้องแก้โค้ด; เปลี่ยนแล้วมีผลกับเลขใหม่เท่านั้น

## 5. บริการไฟล์

| `purpose` | ชนิดที่อนุญาต | ขนาดสูงสุด | ผูกกับ |
|---|---|---|---|
| `DOCUMENT_REVISION` | pdf, dwg, dxf, rvt, ifc, xlsx, xls, docx, doc, pptx, csv, zip | 1 GB | `DocumentFile` |
| `ATTACHMENT` | jpg, jpeg, png, heic, pdf, xlsx, docx | 50 MB | `Attachment` |
| `PHOTO` | jpg, jpeg, png, heic | 20 MB | `Attachment` (มือถือบีบอัดก่อนส่ง) |
| `IMPORT` | xlsx, csv | 10 MB | ใช้ครั้งเดียวตอนนำเข้า |
| `SIGNATURE_IMAGE` | png | 2 MB | `User.signatureImageFileId` |
| `LICENSE_SCAN` | pdf, jpg, png | 10 MB | `ProfessionalLicense.fileId` |
| `CLIENT_RESPONSE` | pdf, jpg, png, docx, xlsx | 50 MB | `TransmittalItem.clientCommentFileId`, `Transmittal.acknowledgementFileId` |

Worker (`files` queue) ทำ: คำนวณ sha256, ตรวจ magic bytes, นับหน้า PDF (`pdfinfo`), ทำ preview หน้าแรก 1024 px (`pdftoppm`), รูปภาพ: อ่าน EXIF (เวลา/GPS) ใส่ `metadata` แล้วลบ EXIF ออกจากไฟล์ที่ใช้แสดงผล (เก็บต้นฉบับ)

## 6. การแจ้งเตือน

- **In-app**: กระดิ่งบนเว็บ (SSE `notification.created`) + หน้า "การแจ้งเตือน" (อ่านแล้ว/ยังไม่อ่าน, กดแล้วไปหน้าที่เกี่ยวข้องด้วย `entityType`/`entityId`)
- **Email**: template Handlebars ไทย/อังกฤษตาม `User.locale` ใน `apps/api/templates/mail/`; ทุกอีเมลมีลิงก์กลับเข้าระบบ
- **Push**: FCM data message `{ type, entityType, entityId, projectId }` + notification title/body; มือถือ route ตาม `08-mobile.md` §8
- **ค่ากำหนดของผู้ใช้**: ต่อชนิด event เลือกช่องทางได้ (ค่าเริ่มต้นตาม `05-workflows.md` §10)
- ชนิด event และผู้รับทั้งหมด: `05-workflows.md` §10

## 7. ค่าตั้งระบบ (`Setting`)

ค่าตั้งต้นใน `docs/data/seed/settings.json`

| Key | ชนิด | ค่าตั้งต้น | ใช้ที่ |
|---|---|---|---|
| `company.profile` | object | ชื่อไทย/อังกฤษ ที่อยู่ เลขผู้เสียภาษี โทร อีเมล เว็บ `logoFileId` | หัวกระดาษ PDF/อีเมล |
| `calendar.holidays` | string[] | `[]` (ADMIN กรอกทุกปี) | วันทำการ BR-PLT-040 |
| `calendar.workdayEnd` | string | `"17:00"` | `dueAt` |
| `review.defaultDueDays` | number | `3` | แม่แบบที่ไม่กำหนด |
| `review.reminderTime` | string | `"08:30"` | งานเตือน |
| `transmittal.maxAttachmentMb` | number | `20` | BR-DOC-062 |
| `transmittal.linkExpiryDays` | number | `30` | BR-DOC-062 |
| `revision.skipLetters` | string[] | `[]` (เช่น `["I","O"]`) | อัลกอริทึม label |
| `security.sessionIdleMinutes` | number | `120` | เว็บ |
| `security.requireMfaRoles` | string[] | `["ADMIN"]` | `06-security.md` §2.1 |
| `tax.vatRate` | number | `7` | เฟส 4 (snapshot ลงเอกสาร) |
| `tax.defaultWithholdingRate` | number | `3` | เฟส 4 |
| `quotation.approvalAmount` | number | `500000` | เฟส 4 (BR-COM-003) |
| `quotation.maxDiscountPercent` | number | `10` | เฟส 4 (BR-COM-003) |
| `lab.receiptMaxTempC` | number | `6` | เฟส 3 (BR-LAB-010) |
| `lab.reportFooterNote` | string | ข้อความท้ายใบรายงานผล | เฟส 3 |
| `mobile.minSupportedVersion` | object | `{ "android": "1.0.0", "ios": "1.0.0" }` | `/app/config` |

## 8. API

| Method | Path | สิทธิ์ | หมายเหตุ |
|---|---|---|---|
| POST | `/auth/login` · `/auth/mfa/verify` · `/auth/refresh` · `/auth/logout` | สาธารณะ / session | `06-security.md` §2 |
| GET | `/auth/me` | ล็อกอิน | ผู้ใช้ + permissions + โครงการที่เป็นสมาชิก (id, code, role) |
| POST | `/auth/change-password` · `/auth/mfa/setup` · `/auth/mfa/enable` · `/auth/mfa/disable` · `/auth/signing-pin` | ล็อกอิน | ต้องยืนยันรหัสผ่านเดิม |
| GET / DELETE | `/auth/sessions[/{id}]` | ล็อกอิน | session ของตัวเอง |
| GET | `/users` · `/users/{id}` | `user.manage` | |
| POST / PATCH | `/users[/{id}]` | `user.manage` | BR-PLT-001/002 |
| POST | `/users/{id}/reset-password` · `/unlock` · `/revoke-sessions` | `user.manage` | |
| GET | `/users/directory` | ล็อกอิน | §3 |
| GET / POST / PATCH | `/users/{id}/licenses[/{licenseId}]` | `user.manage` หรือเจ้าของ | BR-PLT-004 |
| POST | `/licenses/{id}/verify` | `user.manage` | |
| GET / POST / PATCH | `/departments[/{id}]` | ล็อกอิน / `user.manage` | |
| GET / POST / PATCH / DELETE | `/roles[/{id}]` | `role.manage` (GET: `user.manage` ด้วย) | BR-PLT-003; ลบได้เฉพาะบทบาทที่ไม่ใช่ระบบ; บทบาท ADMIN ต้องมี `user.manage` และ `role.manage` เสมอ |
| GET | `/permissions` | `role.manage` | รายการรหัสสิทธิ์ + คำอธิบาย |
| PATCH | `/users/me` | ล็อกอิน | แก้โปรไฟล์ตัวเอง (ชื่อ เบอร์ ภาษา ปฏิทิน) |
| GET / PUT | `/settings/{key}` | ล็อกอิน (บาง key) / `settings.manage` | key ที่มีข้อมูลลับอ่านได้เฉพาะ `settings.manage` |
| GET / PUT | `/numbering-schemes[/{id}]` | `settings.manage` | `POST /numbering-schemes/preview` ดูตัวอย่างเลขถัดไปโดยไม่เลื่อนตัวนับ |
| POST | `/files/upload-url` · `/files/{id}/complete` | ล็อกอิน | `04-api-conventions.md` §9 |
| GET | `/files/{id}` · `/files/{id}/download-url` | สิทธิ์จาก entity ที่ผูก | |
| GET | `/attachments?ownerType=&ownerId=` | สิทธิ์จากเจ้าของ | |
| POST / DELETE | `/attachments[/{id}]` | สิทธิ์แก้เจ้าของ | รับ `id` จาก client ได้ |
| GET | `/notifications` | ล็อกอิน | cursor, `unreadOnly`; `meta.unreadCount` |
| GET | `/notifications/unread-count` | ล็อกอิน | ตัวเลขกระดิ่ง |
| POST | `/notifications/{id}/read` · `/notifications/read-all` | ล็อกอิน | |
| GET / PUT | `/notification-preferences` | ล็อกอิน | |
| POST / DELETE | `/push-devices[/{token}]` | ล็อกอิน | ลงทะเบียน FCM token |
| GET | `/events` | ล็อกอิน (cookie) | SSE |
| GET | `/audit-logs` | `audit.read` | กรอง actor, entity, project, ช่วงเวลา; ส่งออก CSV |
| GET | `/sync/pull` | ล็อกอิน | `08-mobile.md` §5 |
| GET | `/app/config` | สาธารณะ | `04-api-conventions.md` §12 |
| GET | `/health/live` · `/health/ready` | สาธารณะ (ready จำกัด IP ภายใน) | |

## 9. หน้าจอ (เว็บ)

`/login`, `/profile`, `/notifications`, `/admin/users`, `/admin/users/[id]`, `/admin/roles`, `/admin/departments`, `/admin/settings` (บริษัท วันหยุด ความปลอดภัย), `/admin/numbering`, `/admin/audit` — รายละเอียดใน `07-web-ui.md` §6.8

## 10. สถานการณ์ทดสอบรับงาน

| รหัส | สถานการณ์ | ผลที่ต้องได้ |
|---|---|---|
| AT-PLT-01 | login ผิด 10 ครั้ง | ครั้งที่ 11 ได้ 423 `ACCOUNT_LOCKED`, มี audit และอีเมลแจ้ง |
| AT-PLT-02 | ใช้ refresh token เดิมซ้ำหลัง refresh แล้ว | ทุก session ในตระกูลถูกเพิกถอน, request ต่อไปได้ 401 |
| AT-PLT-03 | ถอดบทบาท ADMIN จาก admin คนสุดท้าย | 422 `LAST_ADMIN` |
| AT-PLT-04 | สร้างเอกสาร 20 รายการพร้อมกัน (concurrency) ในสาขา/ประเภทเดียวกัน | ได้เลข 001–020 ไม่ซ้ำ |
| AT-PLT-05 | อัปโหลดไฟล์ .exe ที่เปลี่ยนนามสกุลเป็น .pdf | ไฟล์ REJECTED, ผูกกับ revision ไม่ได้ |
| AT-PLT-06 | ถอดสิทธิ์ `document.edit` จากบทบาท ขณะผู้ใช้ล็อกอินอยู่ | request ถัดไปถูกปฏิเสธทันที |
| AT-PLT-07 | ตั้ง `calendar.holidays` มีวันศุกร์ แล้วเปิดขั้นตรวจวันพฤหัส `dueDays=1` | `dueAt` = วันจันทร์ถัดไป 17:00 |
