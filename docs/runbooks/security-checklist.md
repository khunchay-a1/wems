# Checklist ความปลอดภัยก่อน pilot (P1-15)

อ้างอิง `06-security.md` (เป้าหมาย OWASP ASVS ระดับ 2) — ตรวจเมื่อ 2026-10-03 บน commit ของ P1-15
สถานะ: ✅ ผ่าน (มีหลักฐาน) · 🔧 แก้ใน P1-15 · ⏳ ต้องทำ/ตัดสินก่อน pilot · ➖ ไม่อยู่ในเฟส 1

## 1. การยืนยันตัวตนและ session (§2)

| ข้อ | สถานะ | หลักฐาน |
|---|---|---|
| รหัสผ่าน ≥ 12 ตัว, ห้ามตรงอีเมล/ชื่อ, รายการรหัสยอดนิยม, argon2id m=64MB t=3 p=1 | ✅ | `apps/api/src/common/auth/password.ts`, `password.spec.ts`, `common-passwords.ts` |
| ผิด 10 ครั้ง → ล็อก 15 นาที + อีเมล; ข้อความ `INVALID_CREDENTIALS` เสมอ | ✅ | AT-PLT-01 ใน `test/auth.e2e-spec.ts` |
| MFA TOTP, บังคับ ADMIN (`mfaSetupRequired`), secret เข้ารหัส AES-256-GCM | ✅ | `test/auth.e2e-spec.ts`, `common/crypto/crypto.ts` · มือถือ: ผู้ใช้ที่ต้องตั้ง MFA/เปลี่ยนรหัสถูกส่งไปทำบนเว็บ |
| Access JWT 15 นาที, refresh หมุนเวียน, เก็บเฉพาะ SHA-256, reuse → เพิกถอนทั้ง family + audit | ✅ | AT-PLT-02 |
| สิทธิ์โหลดจาก DB ทุก request (ถอดสิทธิ์มีผลทันที) | ✅ | AT-PLT-06 |
| Cookie `HttpOnly; Secure; SameSite=Lax`, `wems_rt` Path `/api/v1/auth`, CSRF double-submit | ✅ | `auth.controller.ts`, `auth.guard.ts`, `test/auth.e2e-spec.ts` |
| มือถือ: refresh token ใน Keychain/Keystore, access token ในหน่วยความจำ, refresh single-flight, 401 → ลบ PDF/ข้อมูลในเครื่อง | ✅ (ยังไม่ได้รันบนเครื่องจริง) | `apps/mobile/lib/core/auth/`, `core/api/api_client.dart`, `SessionController._revoked` |
| ล็อกแอปด้วย biometric หลัง 5 นาที | ✅ (ตัวเลือก) | `apps/mobile/lib/app/app.dart` |

## 2. การกำหนดสิทธิ์ (§3)

| ข้อ | สถานะ | หลักฐาน |
|---|---|---|
| permission ของบทบาท + ขอบเขตโครงการ, มองไม่เห็น = 404, เห็นแต่ทำไม่ได้ = 403 | ✅ | AT-PRJ-04, AT-DOC-14, e2e ทุกโมดูล |
| ปุ่มบนเว็บ/มือถือมาจาก `allowedActions`/`blockedActions` | ✅ | `07-web-ui.md`, หน้าตรวจบนมือถือใช้ `allowedActions` ของขั้นตรวจ |
| separation of duties, ใบอนุญาตผู้อนุมัติ | ✅ | AT-DOC-04, AT-DOC-08 |
| sync มือถือ: scope ที่ไม่มีสิทธิ์ = 403 `SYNC_SCOPE_FORBIDDEN`, scope ของผู้อื่น = 403 | ✅ | `test/sync.e2e-spec.ts` |

## 3. การลงนาม (§4) และลิงก์สาธารณะ (§5)

| ข้อ | สถานะ | หลักฐาน |
|---|---|---|
| ยืนยันรหัสผ่าน/PIN ซ้ำ, `SignatureEvent` เก็บ hash ไฟล์ + payload, IP, UA | ✅ | AT-DOC-07, `test/design-basis.e2e-spec.ts` |
| token ลิงก์ 32 ไบต์ (HMAC), DB เก็บ SHA-256, หมดอายุ/เพิกถอน → 410 | ✅ | AT-DOC-11 |
| ดาวน์โหลดผ่าน presigned 5 นาที + บันทึก `TransmittalDownload` | ✅ | AT-DOC-11 |
| rate limit 30 ครั้ง/นาที/IP | 🔧 | เพิ่ม `@Throttle` ที่ `PublicTransmittalsController` + ทดสอบใน AT-DOC-11 |
| `X-Robots-Tag: noindex`, `Referrer-Policy: no-referrer` บนหน้า `/t/*` | ✅ | `apps/web/next.config.ts` |

## 4. ไฟล์ (§6)

| ข้อ | สถานะ | หลักฐาน |
|---|---|---|
| ตรวจนามสกุล + magic bytes ใน worker, ไม่ตรง → REJECTED | ✅ | AT-PLT-05, `common/files/magic.spec.ts` |
| ขนาดสูงสุดตามชนิด | ✅ | `files.service.ts` |
| bucket private, presigned GET 5 นาที, `attachment` สำหรับชนิดที่ไม่ใช่ PDF/รูป | ✅ | `files.service.ts` (`DOWNLOAD_URL_TTL_SEC`), `test/files.e2e-spec.ts` |
| bucket versioning + lifecycle 90 วัน | ⏳ | ตั้งตอนสร้าง bucket staging/production (`backup-restore.md` §1, Q22) |
| ClamAV | ➖ | ทางเลือก — ยังไม่เปิด |
| ดาวน์โหลดเอกสาร CONFIDENTIAL ถูก audit | ✅ | `revisions.service.ts` `download()` |

## 5. Header, การตั้งค่า, dependency (§7)

| ข้อ | สถานะ | หลักฐาน |
|---|---|---|
| API: helmet — HSTS 1 ปี, nosniff, CSP `default-src 'none'; frame-ancestors 'none'` | ✅ | `apps/api/src/app.setup.ts` |
| เว็บ: CSP เฉพาะ origin ตัวเอง + object storage + `blob:` worker, `frame-ancestors 'none'` | 🔧 | เพิ่มใน `apps/web/src/proxy.ts` (อ่าน `S3_PUBLIC_ENDPOINT` ตอน runtime); Playwright e2e 6/6 ผ่านพร้อม CSP |
| ไม่เปิด CORS | ✅ | ไม่มี `enableCors` |
| Swagger เฉพาะ dev/staging (`SWAGGER_ENABLED`, ค่าเริ่มต้นปิดเมื่อ production) | ✅ | `common/config/app-config.ts` |
| Log ไม่มีรหัสผ่าน/token/cookie | ✅ | `common/logging/logger.module.ts` (`redact`) |
| Secret อยู่นอก repo (`.env`, `env/*.json` ของมือถือ ignore) | ✅ | `.gitignore`, `.env.example` |
| `pnpm audit` ใน CI (fail ที่ high) + Dependabot | 🔧 | `.github/workflows/ci.yml`, `.github/dependabot.yml` |
| ผล `pnpm audit --prod` วันนี้: high 0, moderate 2 | ⏳ ยอมรับชั่วคราว | `uuid` < 11.1.1 ผ่าน `exceljs` (ช่องโหว่อยู่ใน v3/v5/v6 เมื่อส่ง buffer — exceljs ใช้ v4) · `js-yaml` ผ่าน `@nestjs/swagger` (Swagger ปิดใน production) — ติดตามรุ่นใหม่ของทั้งสองแพ็กเกจ |
| ไม่ใช้แพ็กเกจ RC ใน production | ✅ | ล็อกเวอร์ชันใน `CLAUDE.md` |

## 6. PDPA (§8)

| ข้อ | สถานะ | หลักฐาน |
|---|---|---|
| ไม่เก็บเลขบัตรประชาชน วันเกิด ที่อยู่บ้านของพนักงาน | ✅ | schema `User` |
| ทำให้ผู้ติดต่อของลูกค้าไม่ระบุตัวตน | ✅ | `Clients_anonymizeContact` (BR-CRM-007) |
| ส่งออกข้อมูลของบุคคลเป็น JSON | ⏳ | ยังไม่มี endpoint สำหรับพนักงาน — ทำก่อนรับคำขอแรก (ผู้ดูแลส่งออกจาก DB ได้ชั่วคราว) |
| TLS 1.2+ และเข้ารหัสที่จัดเก็บ | ⏳ | Caddy (TLS อัตโนมัติ), ดิสก์/ข้อมูลสำรองเข้ารหัส (`backup.sh` ใช้ age) — ยืนยันตอนติดตั้ง staging |
| privacy notice ครั้งแรกที่ล็อกอิน | ⏳ | รอข้อความจากฝ่ายกฎหมาย/DPO (`open-questions.md`) |

## 7. Audit (§9)

| ข้อ | สถานะ | หลักฐาน |
|---|---|---|
| ทุก transaction ที่เปลี่ยนข้อมูลบันทึก audit | 🔧 | `tools/check-audit.mjs` (อยู่ใน `pnpm check:spec`): 87 transaction ผ่าน; พบและแก้ 3 จุด — เพิ่ม/แก้/ลบรายการในใบนำส่ง (`transmittal.item_add/item_update/item_remove`) + ทดสอบใน AT-DOC-10; ยกเว้นโดยมีเหตุผล 2 จุด (นำเข้า Excel บันทึกผ่าน `createInTx`, การหมุน refresh token ปกติ) |
| `audit_logs` append-only ใน production (INSERT/SELECT) | 🔧 | `infra/postgres/prod-roles.sql` — ทดสอบแล้ว (UPDATE/DELETE ถูกปฏิเสธ) รวม `signature_events` |
| หน้า Audit ค้นหา/ส่งออก CSV | ✅ | `test/numbering.e2e-spec.ts` |

## 8. สิ่งที่ต้องทำก่อน pilot

1. ติดตั้ง staging ตาม `02-architecture.md` (Caddy TLS, `SWAGGER_ENABLED=false`, `S3_PUBLIC_ENDPOINT`, บทบาท DB จาก `prod-roles.sql`)
2. ตั้ง bucket versioning + lifecycle + replication และ cron สำรองข้อมูล แล้วทดสอบกู้คืนบน staging (`backup-restore.md`)
3. ให้ DPO ยืนยันตาราง PDPA และข้อความ privacy notice
4. Firebase project สำหรับ push (Q23) และช่องทางแจกจ่ายแอป
5. สแกนช่องโหว่จากภายนอก (เช่น OWASP ZAP baseline) กับ staging และบันทึกผลในไฟล์นี้
