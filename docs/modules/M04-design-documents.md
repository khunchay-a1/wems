# M04 · งานออกแบบและเอกสาร ★ MVP (เฟส 1)

> Data model: `apps/api/prisma/schema/document.prisma` · สถานะ: `05-workflows.md` §1–5 · หน้าจอ: `07-web-ui.md` §6 · มือถือ: `08-mobile.md` §7
> รหัสกติกา `BR-DOC-xxx` ใช้อ้างอิงในโค้ด (comment), ชื่อ test และ error `rule`

## 1. ขอบเขต

**ในเฟส 1**
- ทะเบียนเอกสารต่อโครงการ: ลงทะเบียน นำเข้าจาก Excel ออกเลขอัตโนมัติ ค้นหา กรอง ส่งออก
- Revision และไฟล์: PDF สำหรับตรวจ + ไฟล์ต้นฉบับ + ไฟล์ประกอบ, อัปโหลดซ้ำได้ขณะร่าง
- Workflow ตรวจ/อนุมัติตามแม่แบบ, ขั้นขนาน, มอบหมายแทน, เตือนครบกำหนด, ลงนามอิเล็กทรอนิกส์, ตรวจใบอนุญาต
- ความเห็นบน PDF (หมุด/กรอบ) + ตารางตอบความเห็น (CRS) ส่งออก PDF/Excel
- ใบนำส่ง: PDF ใบนำส่ง, อีเมลแนบไฟล์หรือลิงก์ดาวน์โหลดมีวันหมดอายุ, บันทึกการรับ, ผลตอบกลับของลูกค้า
- แผนส่งมอบ (วันที่วางแผน/คาดการณ์/จริง) และรายงาน MDL
- Design basis (กรอกมือ; เชื่อมผลแล็บในเฟส 3)
- ตราประทับสถานะบน PDF ตอนดาวน์โหลด

**ไม่อยู่ในเฟส 1**: เปรียบเทียบไฟล์ 2 revision แบบซ้อนภาพ, markup แบบวาดอิสระ/cloud, ค้นหาข้อความภายใน PDF, ลายมือชื่อดิจิทัลแบบ PKI, template รายการคำนวณ (เฟส 5)

## 2. User stories

| รหัส | ในฐานะ | ต้องการ | เพื่อ |
|---|---|---|---|
| US-DOC-01 | DC / วิศวกร | ลงทะเบียนเอกสารแล้วได้เลขอัตโนมัติ | เลขไม่ซ้ำ ไม่ต้องจำลำดับ |
| US-DOC-02 | DC | นำเข้ารายการเอกสาร (MDL) จาก Excel | เริ่มโครงการได้เร็ว |
| US-DOC-03 | วิศวกร / ช่างเขียนแบบ | สร้าง revision อัปโหลด PDF+DWG แล้วส่งตรวจ พร้อมเลือกผู้ตรวจ | งานเดินตามขั้นตอน |
| US-DOC-04 | ผู้ตรวจ | เห็นงานที่รอฉันทั้งหมดในที่เดียว (เว็บ/มือถือ) พร้อมวันครบกำหนด | ไม่ตกหล่น |
| US-DOC-05 | ผู้ตรวจ | ปักหมุดความเห็นบนตำแหน่งในแบบ แล้วตัดสิน ผ่าน/ผ่านตามความเห็น/ตีกลับ | สื่อสารชัดเจน |
| US-DOC-06 | ผู้อนุมัติ (มี กว.) | อนุมัติโดยยืนยันรหัสผ่าน/PIN | มีหลักฐานการลงนาม |
| US-DOC-07 | ผู้จัดทำ | ตอบความเห็นทีละข้อ แล้วส่งตรวจรอบใหม่ | ปิดความเห็นครบ |
| US-DOC-08 | PM | มอบหมายงานตรวจแทนเมื่อผู้ตรวจลา | งานไม่ค้าง |
| US-DOC-09 | DC | สร้างใบนำส่ง เลือก revision ที่อนุมัติแล้ว ส่งอีเมลลูกค้า | มีหลักฐานว่าส่งอะไร เมื่อไร |
| US-DOC-10 | DC | บันทึกว่าลูกค้ารับแล้ว และผลตอบกลับ (รหัส 1–4) | ติดตามการอนุมัติของลูกค้า |
| US-DOC-11 | ทีมหน้างาน | เปิดแบบ "ฉบับใช้งาน" บนมือถือแม้ไม่มีเน็ต และรู้ทันทีเมื่อมีฉบับใหม่ | ไม่ใช้แบบผิดฉบับ |
| US-DOC-12 | PM | เห็นความคืบหน้าการส่งมอบเอกสารเทียบแผน | คุมกำหนดส่ง |
| US-DOC-13 | วิศวกรกระบวนการ | บันทึกค่าออกแบบ (อัตราการไหล คุณภาพน้ำดิบ เป้าหมายน้ำทิ้ง) และให้หัวหน้าอนุมัติ | ทีมใช้ค่าเดียวกัน |
| US-DOC-14 | ทุกคน | ค้นหาเอกสารด้วยเลขหรือชื่อบางส่วน (ภาษาไทยได้) | หาเจอเร็ว |
| US-DOC-15 | ผู้บริหาร / ผู้ตรวจสอบภายใน | ดูประวัติว่าใครทำอะไรกับเอกสาร | ตรวจสอบย้อนหลังได้ |

## 3. กติกาธุรกิจ (Business rules)

### 3.1 ทะเบียนและเลขเอกสาร

- **BR-DOC-010** เลขเอกสารออกจาก `NumberingScheme` ของ `DOCUMENT` (override ต่อโครงการได้) ค่าตั้งต้น `{PROJECT}-{DISCIPLINE}-{TYPE}-{SEQ:3}` เช่น `P26-001-PR-DWG-001`; ตัวนับแยกตาม (โครงการ, สาขา, ประเภท); เลขที่ออกแล้ว **ไม่นำกลับมาใช้**
- **BR-DOC-011** เปลี่ยนสาขา/ประเภทได้เฉพาะก่อนมี revision ใดถึง APPROVED → ออกเลขใหม่ (เลขเดิมเผาทิ้ง บันทึกใน audit); หลังจากนั้นเลข/สาขา/ประเภทแก้ได้โดย `document.admin` พร้อมเหตุผลเท่านั้น
- **BR-DOC-012** เอกสารจากภายนอก (`source = EXTERNAL`) ได้เลขภายในเหมือนกัน และเก็บเลขเดิมใน `externalNumber`
- **BR-DOC-013** ชื่อเอกสารซ้ำในสาขาและประเภทเดียวกันของโครงการ → เตือน (ไม่บล็อก)
- **BR-DOC-014** สร้าง/แก้เอกสารได้เมื่อโครงการ PLANNING หรือ ACTIVE เท่านั้น (ดู `05-workflows.md` §6)
- **BR-DOC-015** นำเข้า Excel: ตรวจทุกแถวก่อน ถ้ามีแถวผิดแม้แถวเดียว → ไม่บันทึกเลย และคืนรายการข้อผิดพลาดรายแถว (all-or-nothing)
- **BR-DOC-016** นำเข้าแบบระบุเลขเอง (ย้ายข้อมูลเดิม) ต้องมี `document.admin`; หลังนำเข้า ตัวนับของ key ที่ตรงรูปแบบถูกเลื่อนไปเท่ากับเลขสูงสุดที่พบ

### 3.2 Revision และไฟล์

- **BR-DOC-020** Scheme `ALPHA_NUMERIC`: วัตถุประสงค์ FI/FR/FA/FT ใช้ตัวอักษร A, B, …, Z, AA, AB, …; FC/AB ใช้ตัวเลขเริ่ม 0; เมื่อมี revision ตัวเลขแล้ว revision ถัดไปเป็นตัวเลขเสมอ
- **BR-DOC-021** เอกสารหนึ่งมี revision ที่ DRAFT หรือ IN_REVIEW ได้ครั้งละ 1 ฉบับ
- **BR-DOC-022** Scheme `ISO19650`: FI/FR/FA/FT ใช้ P01, P02, …; FC/AB ใช้ C01, C02, …; เมื่อมี C แล้วถัดไปเป็น C เสมอ; ตัวเลขอย่างน้อย 2 หลัก
- **BR-DOC-023** label ของ revision ที่ VOID ถือว่าใช้ไปแล้ว; label ของ revision ร่างที่ถูกทิ้ง (discard) ใช้ใหม่ได้
- **BR-DOC-024** `document.admin` ระบุ label เองได้ตอนสร้าง (`revLabelOverride`) เช่นย้ายเอกสารเดิมที่อยู่ Rev.C — ต้องไม่ซ้ำและต้องอยู่ในรูปแบบของ scheme
- **BR-DOC-025** ทิ้ง revision ร่าง (discard) ได้เมื่อไม่เคยส่งตรวจและไม่มีความเห็น — เป็นการลบจริงกรณีเดียวของ revision
- **BR-DOC-026** ขณะ DRAFT อัปโหลดไฟล์ได้ไม่จำกัด; `PDF_RENDITION` และ `NATIVE` มีไฟล์ current ได้อย่างละ 1 (อัปโหลดใหม่ = version ใหม่), `SUPPORTING` ได้หลายไฟล์; ไฟล์ `PDF_RENDITION` ต้องเป็น `application/pdf`; ขณะ IN_REVIEW ขึ้นไป **อัปโหลดไม่ได้** (`DOC_REVISION_LOCKED`)
- **BR-DOC-027** revision ที่ 2 เป็นต้นไปต้องมี `description` (คำอธิบายการแก้ไข) ก่อนส่งตรวจ

### 3.3 การตรวจและอนุมัติ

- **BR-DOC-030** ส่งตรวจได้เมื่อ: สถานะ DRAFT; มี `PDF_RENDITION` current ที่ AVAILABLE ถ้าประเภทเอกสารกำหนด; ผ่าน BR-DOC-027; เลือก assignee ครบทุกขั้นที่ไม่ optional; assignee ทุกคนผ่าน BR-DOC-041/042
- **BR-DOC-031** ขั้นที่ `stepOrder` เท่ากันทำขนาน; group ถัดไปเปิดเมื่อทุกขั้นใน group เป็น APPROVED/APPROVED_WITH_COMMENTS/SKIPPED; group สุดท้ายครบ → revision APPROVED
- **BR-DOC-032** ขั้นใดตีกลับ → cycle REJECTED ทันที, ขั้นที่เหลือ CANCELLED, revision กลับเป็น DRAFT และปลดล็อกไฟล์
- **BR-DOC-033** `APPROVED_WITH_COMMENTS` ต้องมีความเห็นจากขั้นนั้น ≥ 1 ข้อ; `REJECTED` ต้องมี `note` หรือความเห็น OPEN จากขั้นนั้น
- **BR-DOC-034** สร้าง revision ใหม่: ความเห็น OPEN/RESPONDED ของ revision ก่อนหน้าถูกคัดลอกเป็น OPEN (อ้าง `carriedFromCommentId`) และตัวเดิมปิดอัตโนมัติพร้อมบันทึก "ยกไป Rev.X"
- **BR-DOC-035** ผู้ตรวจสร้างความเห็นแบบ review (มี `reviewStepId`) ได้เฉพาะขณะขั้นของตน ACTIVE; สมาชิกโครงการเขียนความเห็นทั่วไป (`NONE`) ได้ทุกเวลา
- **BR-DOC-036** `dueAt` = `activatedAt` + `dueDays` วันทำการ (จ.–ศ. ไม่นับวันหยุดใน setting `calendar.holidays`) เวลา 17:00 Asia/Bangkok
- **BR-DOC-037** มอบหมายแทน: assignee มอบต่อให้ผู้มีคุณสมบัติได้; PM ของโครงการหรือ `document.admin` เปลี่ยน assignee ของขั้น PENDING/ACTIVE ได้; ต้องระบุเหตุผล; เก็บ `delegatedFromUserId`
- **BR-DOC-038** เตือน: 1 วันทำการก่อนครบกำหนด (08:30) และทุกวันทำการเมื่อเลยกำหนด; เลยกำหนด ≥ 2 วันทำการ แจ้ง PM ด้วย
- **BR-DOC-039** ไฟล์ที่ถูกตรวจตรึงไว้ตอนส่ง (`reviewedFileId`, `reviewedFileSha256`); การตัดสินทุกครั้งผูกกับ hash นี้

### 3.4 คุณสมบัติผู้ตรวจ/ผู้อนุมัติ

- **BR-DOC-040** ถ้า `DocumentType.requiresLicensedApprover` และขั้นเป็น APPROVE ที่ `requiresLicense`: ผู้อนุมัติต้องมี `ProfessionalLicense` ชนิด ENGINEER ที่ `isActive`, ผ่านการยืนยันแล้ว (`verifiedAt` ไม่ว่าง — BR-PLT-004), ไม่หมดอายุ ณ วันที่ตัดสิน, สาขาอยู่ใน `allowedLicenseBranches` (ถ้ากำหนด) และระดับ ≥ `minLicenseLevel` (ลำดับ ASSOCIATE = ASSOCIATE_SPECIAL < PROFESSIONAL < SENIOR); ตรวจตอนส่งตรวจ (ถ้าใบอนุญาตจะหมดก่อน `dueAt` → เตือน) และตรวจซ้ำตอนตัดสิน (บล็อก)
- **BR-DOC-041** assignee ต้องเป็นผู้ใช้ active, เข้าถึงโครงการได้, มีสิทธิ์ `document.review` (CHECK/REVIEW) หรือ `document.approve` (APPROVE), และมีบทบาทในโครงการตรง `allowedProjectRoles` ของขั้น (ถ้ากำหนด)
- **BR-DOC-042** ถ้าโครงการ `requireSeparationOfDuties`: ผู้จัดทำ revision และผู้อัปโหลด PDF ที่ถูกตรวจ เป็น assignee ของขั้น CHECK หรือ APPROVE ไม่ได้; คนเดียวกันเป็นทั้ง CHECK และ APPROVE ในรอบเดียวไม่ได้
- **BR-DOC-043** ขั้นที่ `requiresSignature` ต้องยืนยันตัวตนซ้ำ (รหัสผ่านหรือ PIN ลงนาม) และสร้าง `SignatureEvent` (ดู `06-security.md` §4)

### 3.5 ใบนำส่ง

- **BR-DOC-060** รายการในใบนำส่งต้องเป็น revision สถานะ APPROVED หรือ ISSUED ของเอกสารในโครงการเดียวกัน และเอกสารต้อง `confidentiality = CLIENT_SHAREABLE` (อื่นๆ → `DOC_NOT_SHAREABLE`); revision ซ้ำในใบเดียวกันไม่ได้
- **BR-DOC-061** รายการที่ไม่ใช่ฉบับใช้งานล่าสุดของเอกสาร → เตือนก่อนส่ง (ไม่บล็อก)
- **BR-DOC-062** ส่งทาง `EMAIL_ATTACHMENT` เมื่อขนาดไฟล์รวม ≤ `transmittal.maxAttachmentMb` (ค่าตั้งต้น 20) มิฉะนั้นระบบเปลี่ยนเป็น `EMAIL_LINK` อัตโนมัติและแจ้งผู้ส่ง; ลิงก์หมดอายุตาม `transmittal.linkExpiryDays` (ค่าตั้งต้น 30)
- **BR-DOC-063** เมื่อส่ง: revision APPROVED → ISSUED (`issuedAt` ครั้งแรก); `DocumentPlan.actualDate` ของวัตถุประสงค์ของใบนำส่งถูกตั้งถ้ายังว่าง
- **BR-DOC-064** ผลตอบกลับของลูกค้าบันทึกต่อรายการ (รหัส วันที่ หมายเหตุ ไฟล์ความเห็น) และคัดลอกไป `DocumentRevision.clientReturnCode`; CODE_3/CODE_4 แจ้งเจ้าของเอกสารและ PM และเอกสารแสดงป้าย "ต้องออก revision ใหม่" จนกว่าจะมี revision ใหม่
- **BR-DOC-065** หน้าลิงก์สาธารณะแสดงเฉพาะรายการในใบนำส่งนั้น ดาวน์โหลดทุกครั้งถูกบันทึก ลิงก์หมดอายุ/เพิกถอน → 410
- **BR-DOC-066** ใบนำส่งที่ SENT แล้วแก้ไม่ได้ ยกเลิกได้เฉพาะ DRAFT

### 3.6 ตราประทับบน PDF

- **BR-DOC-070** ดาวน์โหลด PDF rendition ผ่านระบบจะประทับตราตามสถานะ (ไม่แก้ไฟล์ต้นฉบับ; เก็บไฟล์ที่ประทับแล้วเป็น cache key `fileId + stampHash`):

| สถานะ revision | วัตถุประสงค์ | ตรา |
|---|---|---|
| DRAFT, IN_REVIEW | ใดก็ได้ | ลายน้ำเฉียง `DRAFT – NOT FOR CONSTRUCTION` |
| APPROVED, ISSUED | FI, FR, FA, FT | กล่องมุมขวาล่าง `PRELIMINARY – NOT FOR CONSTRUCTION · Rev.X` |
| APPROVED, ISSUED | FC, AB | กล่องมุมขวาล่าง `APPROVED FOR CONSTRUCTION · Rev.X · <วันที่อนุมัติ> · <ชื่อผู้อนุมัติ> · Ref <signature id 8 ตัว>` (AB ใช้ `AS-BUILT`) |
| SUPERSEDED | ใดก็ได้ | ลายน้ำเฉียงสีแดง `SUPERSEDED – ฉบับเก่า ห้ามใช้` |
| VOID | ใดก็ได้ | ลายน้ำเฉียง `VOID` |

- **BR-DOC-071** ไฟล์ต้นฉบับ (NATIVE) ไม่ประทับตรา; ดาวน์โหลด PDF แบบไม่ประทับตราได้เฉพาะผู้มี `document.edit` ในโครงการ (ใช้แก้ไข/พิมพ์ title block)

### 3.7 Design basis

- **BR-DOC-080** โครงการมี design basis ที่ APPROVED ได้ครั้งละ 1 ฉบับ; อนุมัติฉบับใหม่ → ฉบับเดิม SUPERSEDED
- **BR-DOC-081** แก้ได้เฉพาะ DRAFT; สร้างฉบับใหม่ (revNo + 1) ได้เมื่อไม่มี DRAFT ค้าง โดยคัดลอกรายการจากฉบับล่าสุด
- **BR-DOC-082** รายการที่ `source = MEASURED` ต้องมี `sampleTestIds` (เฟส 3) หรือ `sourceNote` อธิบายที่มา
- **BR-DOC-083** อนุมัติต้องมี `designbasis.approve` + ลงนาม (BR-DOC-043) และผู้อนุมัติต้องไม่ใช่ผู้สร้างฉบับนั้น — `SignatureEvent.fileSha256` เก็บ SHA-256 ของ canonical JSON ของเนื้อหาที่อนุมัติ (ค่าหัว + รายการ)

## 4. อัลกอริทึม revision label (test vectors)

```ts
// domain/revision-label.ts — pure function
nextRevisionLabel(scheme, existing: { label: string; state: 'ACTIVE' | 'VOID' }[], purpose): string
```

| Scheme | revision ที่มีอยู่ (ไม่นับที่ discard) | วัตถุประสงค์ใหม่ | ผลลัพธ์ |
|---|---|---|---|
| ALPHA_NUMERIC | – | FR | `A` |
| ALPHA_NUMERIC | A | FA | `B` |
| ALPHA_NUMERIC | A, B | FC | `0` |
| ALPHA_NUMERIC | A, B, 0 | FR | `1` |
| ALPHA_NUMERIC | – | FC | `0` |
| ALPHA_NUMERIC | Z | FR | `AA` |
| ALPHA_NUMERIC | AZ | FR | `BA` |
| ALPHA_NUMERIC | A, B(VOID) | FR | `C` |
| ALPHA_NUMERIC | 9 | AB | `10` |
| ISO19650 | – | FR | `P01` |
| ISO19650 | P09 | FA | `P10` |
| ISO19650 | P01, P02 | FC | `C01` |
| ISO19650 | C01 | FI | `C02` |

`revIndex` = จำนวน revision ที่ไม่ถูก discard + 1 (ใช้เรียงลำดับ)

## 5. แม่แบบ workflow ตั้งต้น

ข้อมูลใน `docs/data/seed/workflow-templates.json`

| Code | ขั้น (stepOrder: kind) | ใช้กับ |
|---|---|---|
| `DRAW_CHECK_APPROVE` | 1: CHECK (ENGINEER, DESIGN_MANAGER) → 2: APPROVE (DESIGN_MANAGER, PROJECT_MANAGER; ลงนาม; ต้องมีใบอนุญาต) | DWG, PID, PFD, CAL |
| `CHECK_APPROVE` | 1: CHECK (ENGINEER, DESIGN_MANAGER, PROJECT_MANAGER) → 2: APPROVE (DESIGN_MANAGER, PROJECT_MANAGER; ลงนาม) | SPC, RPT, BOQ, DS, LST, MAN |
| `APPROVE_ONLY` | 1: APPROVE (PROJECT_MANAGER, DESIGN_MANAGER; ลงนาม) | SCH, MOM, LET, OTH |
| `MULTI_DISCIPLINE` | 1: CHECK ×n ขนาน (ต่อสาขา) → 2: REVIEW (DESIGN_MANAGER) → 3: APPROVE (PROJECT_MANAGER; ลงนาม; ใบอนุญาต) | เลือกเองต่อเอกสาร เช่น แบบรวมหลายสาขา |

ตอนส่งตรวจ ระบบคัดลอกขั้นจากแม่แบบลง `ReviewStep` (แก้แม่แบบภายหลังไม่กระทบรอบที่ดำเนินอยู่); หน้าส่งตรวจเสนอ assignee ล่าสุดที่เคยใช้กับประเภทเอกสารเดียวกันในโครงการ

## 6. ความเห็นบน PDF และ CRS

- ชนิด anchor ในเฟส 1: `PIN` (จุด) และ `RECT` (กรอบ) พิกัด normalize 0..1 ต่อหน้า (`03-data-model.md` §4) — วาดทับ pdf.js ด้วย layer ของเราเอง
- ความเห็นมีเลขลำดับต่อ revision (`#1`, `#2`, … คำนวณตามเวลาสร้าง) แสดงบนหมุดและใน CRS
- **CRS** (`GET /revisions/{id}/crs?format=pdf|xlsx`) รวมเฉพาะความเห็นจากการตรวจ (สถานะไม่ใช่ `NONE`; ความเห็นทั่วไปและ reply ไม่อยู่ใน CRS) คอลัมน์: ลำดับ, หน้า, ผู้ให้ความเห็น, ขั้นตอน, วันที่, ความเห็น, คำตอบของผู้จัดทำ, สถานะ, ผู้ปิด/วันที่ปิด, ยกมาจาก Rev.
- PDF ของ CRS มีหัวกระดาษ: โครงการ เลขเอกสาร ชื่อ revision รอบที่ และวันที่พิมพ์

## 7. ใบนำส่ง

**ใบนำส่ง PDF** (template `templates/pdf/transmittal.html`, A4 แนวตั้ง, ไทย/อังกฤษตามภาษาของลูกค้า):
- หัว: โลโก้/ชื่อบริษัท ที่อยู่ เลขผู้เสียภาษี (จาก setting `company.profile`), เลขใบนำส่ง, วันที่, โครงการ, ผู้รับ (บริษัท ชื่อ อีเมล), วัตถุประสงค์
- ตาราง: ลำดับ, เลขเอกสาร, ชื่อเอกสาร, Rev., วัตถุประสงค์, รูปแบบ, จำนวนชุด, หมายเหตุ
- ท้าย: ข้อความ, ผู้ส่ง (ชื่อ ตำแหน่ง), ช่องลงนามผู้รับ + วันที่ (สำหรับพิมพ์กลับมา), ลิงก์ดาวน์โหลดและวันหมดอายุ (ถ้า EMAIL_LINK), QR ไปหน้าลิงก์

**อีเมล** (template `templates/mail/transmittal.{th,en}.hbs`): หัวเรื่อง `[<เลขใบนำส่ง>] <subject>`, เนื้อหาสรุปรายการ, แนบใบนำส่ง PDF เสมอ + ไฟล์ (หรือลิงก์), reply-to = อีเมลผู้ส่ง

**เลขใบนำส่ง** ออกตอนสร้าง DRAFT (scheme `TRANSMITTAL` เช่น `TR-P26-001-001`) — ใบที่ยกเลิกแล้วเลขไม่นำกลับมาใช้

**ลิงก์สาธารณะ**: token = HMAC-SHA256 (กุญแจ `APP_ENCRYPTION_KEY`) ของ id ใบนำส่ง + เวลาส่ง; ฐานข้อมูลเก็บเฉพาะ SHA-256 ของ token (`publicTokenHash`) แต่ระบบสร้างลิงก์เดิมให้เจ้าหน้าที่ดู/คัดลอกได้เสมอ; เพิกถอน = ตั้ง `linkRevokedAt`, ขยาย = เลื่อน `linkExpiresAt` และล้างการเพิกถอน; 410 มี `senderEmail` เพื่อให้หน้าเว็บบอกผู้ติดต่อ

**ไฟล์ที่ส่ง**: รูปแบบ `PDF` = PDF rendition ที่ประทับตราตามสถานะ (BR-DOC-070), `NATIVE` = ไฟล์ต้นฉบับ, `PDF_AND_NATIVE` = ทั้งสอง, `HARD_COPY` = ไม่มีไฟล์; ขนาดรวมที่ใช้ตัดสิน BR-DOC-062 คิดจากไฟล์ตามรูปแบบของทุกรายการ

**หน้าดาวน์โหลดสาธารณะ** (`/t/<token>`, Next.js route ไม่ต้องล็อกอิน): ชื่อบริษัท เลขใบนำส่ง วันที่ส่ง วันหมดอายุ ตารางรายการพร้อมปุ่มดาวน์โหลด และปุ่มดาวน์โหลดทั้งหมด (ZIP)

## 8. นำเข้าทะเบียนจาก Excel

Template ดาวน์โหลดได้จากหน้าทะเบียน (`GET /projects/{id}/documents/import-template`) คอลัมน์:

| คอลัมน์ | บังคับ | หมายเหตุ |
|---|---|---|
| `number` | – | ว่าง = ระบบออกเลข; ใส่ = ต้องมี `document.admin` (BR-DOC-016) |
| `title` | ✔ | |
| `titleEn` | – | |
| `discipline` | ✔ | รหัส เช่น `PR` |
| `type` | ✔ | รหัส เช่น `DWG` |
| `source` | – | `INTERNAL` (ค่าเริ่มต้น) / `EXTERNAL` |
| `originator`, `externalNumber` | – | ใช้กับ EXTERNAL |
| `ownerEmail` | – | ต้องเป็นสมาชิกโครงการ |
| `confidentiality` | – | ค่าเริ่มต้น `CLIENT_SHAREABLE` |
| `sheetSize`, `scale`, `tags`, `remarks` | – | tags คั่นด้วย `,` |
| `planFR`, `planFA`, `planFT`, `planFC` | – | วันที่แผน `YYYY-MM-DD` |

ขั้นตอน: อัปโหลดไฟล์ → `POST .../documents/import { fileId, dryRun: true }` แสดงผลตรวจรายแถว → ผู้ใช้ยืนยัน → `dryRun: false` (transaction เดียว)

## 9. แผนส่งมอบและรายงาน MDL

- แต่ละเอกสารมีแผนได้ต่อวัตถุประสงค์ (`DocumentPlan`); `actualDate` ตั้งจากใบนำส่ง (BR-DOC-063) หรือแก้มือโดย DC
- รายงาน MDL (`GET /projects/{id}/reports/mdl?format=xlsx|pdf`): เลข, ชื่อ, สาขา, ประเภท, Rev. ปัจจุบัน/สถานะ, ฉบับใช้งาน, ผลตอบกลับลูกค้าล่าสุด, แผน/คาดการณ์/จริง ของแต่ละวัตถุประสงค์, ความล่าช้า (วัน)
- Dashboard ของโครงการ: จำนวนเอกสารตามสถานะ, ค้างตรวจ (เลยกำหนด), ส่งตามแผนเทียบจริงรายเดือน

## 10. API

สิทธิ์ทุก endpoint ในโครงการต้องผ่านขอบเขตโครงการ (`06-security.md` §3.1) เพิ่มเติมจากที่ระบุ

| Method | Path | สิทธิ์ | หมายเหตุ |
|---|---|---|---|
| GET | `/disciplines`, `/document-types`, `/workflow-templates` | ผู้ใช้ทุกคน | master data (active) |
| POST/PATCH | `/disciplines`, `/document-types`, `/workflow-templates[/{id}]` | `masterdata.manage` | ปิดใช้งานแทนการลบ |
| GET | `/projects/{projectId}/documents` | `document.read` | กรอง: `q`, `disciplineId`, `documentTypeId`, `status`, `revisionStatus`, `purposeCode`, `ownerId`, `clientReturnCode`, `hasOpenComments`, `tag`; เรียง: `number`, `title`, `updatedAt` |
| POST | `/projects/{projectId}/documents` | `document.create` | BR-DOC-010, 013, 014 |
| GET | `/projects/{projectId}/documents/import-template` | `document.create` | ไฟล์ .xlsx |
| POST | `/projects/{projectId}/documents/import` | `document.create` | `{ fileId, dryRun }` BR-DOC-015/016 |
| GET | `/projects/{projectId}/documents/export` | `report.export` | .xlsx ตามตัวกรองเดียวกับรายการ |
| GET | `/documents/{id}` | `document.read` | รวม revision สรุป, แผน, `allowedActions` |
| PATCH | `/documents/{id}` | `document.edit` | BR-DOC-011 |
| POST | `/documents/{id}/hold` · `/resume` · `/cancel` · `/supersede` | `document.edit` | supersede: `{ byDocumentId }` |
| PUT | `/documents/{id}/plans` | `document.edit` | แทนที่รายการแผนทั้งชุด |
| GET | `/documents/{id}/revisions` | `document.read` | |
| POST | `/documents/{id}/revisions` | `document.edit` | `{ purposeCode, description?, revLabelOverride? }` BR-DOC-020–024 |
| GET | `/revisions/{id}` | `document.read` | ไฟล์ current + ประวัติ, รอบตรวจ, `allowedActions` |
| PATCH | `/revisions/{id}` | ผู้จัดทำ / `document.edit` | DRAFT เท่านั้น; เปลี่ยน purpose ก่อนส่งตรวจครั้งแรก → คำนวณ label ใหม่ |
| DELETE | `/revisions/{id}` | ผู้จัดทำ / `document.admin` | discard BR-DOC-025 |
| POST | `/revisions/{id}/files` | ผู้จัดทำ / `document.edit` | `{ fileId, role, note? }` BR-DOC-026 |
| GET | `/revisions/{id}/eligible-reviewers?templateStepId=` | `document.edit` | รายชื่อที่เลือกได้ + สถานะใบอนุญาต |
| POST | `/revisions/{id}/submit` | ผู้จัดทำ / `document.edit` | `{ version, templateId?, steps: [{ templateStepId, assigneeId }], note? }` BR-DOC-030 |
| POST | `/revisions/{id}/cancel-review` | ผู้ส่ง / PM / `document.admin` | `{ version, reason }` |
| POST | `/revisions/{id}/void` | ดู `05-workflows.md` §1 | `{ version, reason }` |
| GET | `/revisions/{id}/download?fileRole=PDF_RENDITION&stamp=true` | `document.read` | `{ url }` BR-DOC-070/071 |
| GET | `/revisions/{id}/crs?format=pdf\|xlsx` | `document.read` | |
| GET | `/review-steps?assigneeId=me&status=ACTIVE` | ผู้ใช้ทุกคน (เห็นของตัวเอง) | กล่องงานตรวจข้ามโครงการ เรียงตาม `dueAt` |
| GET | `/review-cycles/{id}` | `document.read` | |
| POST | `/review-steps/{id}/decision` | assignee | `{ version, decision, note?, signature? }` BR-DOC-033, 039–043; ต้องมี `Idempotency-Key` |
| POST | `/review-steps/{id}/reassign` | assignee / PM / `document.admin` | `{ version, assigneeId, reason }` BR-DOC-037 |
| POST | `/review-steps/{id}/skip` | PM / `document.admin` | `{ version, reason }` |
| GET | `/comments?ownerType=&ownerId=` | ตามเจ้าของ | รวม reply และสถานะ |
| POST | `/comments` | ตามเจ้าของ | `{ ownerType, ownerId, body, anchor?, parentId?, mentions?, reviewStepId? }` BR-DOC-035 |
| GET | `/comments/{id}` | ตามเจ้าของ | thread เดียว (ความเห็นหลัก + reply) |
| PATCH / DELETE | `/comments/{id}` | ผู้เขียน | แก้/ลบได้ก่อนขั้นตรวจตัดสิน (ความเห็นตรวจ: ขั้น ACTIVE และสถานะ OPEN); DELETE ส่ง `?version=` |
| POST | `/comments/{id}/respond` · `/close` · `/reopen` | ดู `05-workflows.md` §3 | respond `{ version, responseNote }` โดยผู้จัดทำ/เจ้าของเอกสาร/`document.edit`; close/reopen `{ version, note? }` โดยผู้เขียนความเห็นหรือ `document.admin` (`note` บันทึกเป็น reply) |
| GET | `/projects/{projectId}/transmittals` | `document.read` | |
| POST | `/projects/{projectId}/transmittals` | `transmittal.manage` | สร้าง DRAFT พร้อมรายการ |
| GET | `/projects/{projectId}/transmittable-revisions?q=` | `document.read` | revision ที่ส่งได้ (BR-DOC-060) + ป้ายไม่ใช่ฉบับล่าสุด (BR-DOC-061) สำหรับตัวเลือกเพิ่มรายการ |
| GET / PATCH | `/transmittals/{id}` | `document.read` / `transmittal.manage` | |
| POST / PATCH / DELETE | `/transmittals/{id}/items[/{itemId}]` | `transmittal.manage` | BR-DOC-060; PATCH แก้จำนวนชุด/รูปแบบ/หมายเหตุขณะ DRAFT |
| POST | `/transmittals/{id}/send` · `/cancel` · `/acknowledge` · `/revoke-link` · `/extend-link` · `/resend-email` | `transmittal.manage` | `05-workflows.md` §4 |
| GET | `/transmittals/{id}/cover-sheet` | `document.read` | `{ url }` |
| POST | `/transmittal-items/{id}/client-response` | `transmittal.manage` | `{ code, returnedAt, note?, fileId? }` BR-DOC-064 |
| GET | `/public/transmittals/{token}` | สาธารณะ (token) | ข้อมูลหน้าดาวน์โหลด |
| GET | `/public/transmittals/{token}/items/{itemId}/download` · `/package` | สาธารณะ (token) | `{ url }` + บันทึก TransmittalDownload |
| GET | `/projects/{projectId}/design-bases` | `document.read` | |
| POST | `/projects/{projectId}/design-bases` | `designbasis.edit` | ฉบับใหม่ BR-DOC-081 |
| GET / PATCH | `/design-bases/{id}` | `document.read` / `designbasis.edit` | PATCH แทนที่ `items` ทั้งชุด |
| POST | `/design-bases/{id}/approve` | `designbasis.approve` | `{ version, signature }` BR-DOC-080, 083 |
| GET | `/parameters`, `/regulatory-standards` | ผู้ใช้ทุกคน | master data (active) สำหรับตัวเลือกพารามิเตอร์/มาตรฐานเป้าหมาย; `GET /design-bases/{id}` แนบเกณฑ์ของมาตรฐานเป้าหมายต่อรายการ (`standardLimit`) |
| GET | `/projects/{projectId}/reports/mdl?format=` | `report.export` | §9 |
| GET | `/projects/{projectId}/documents/stats` | `document.read` | ตัวเลขสำหรับ dashboard |
| GET | `/search?q=` | ผู้ใช้ทุกคน | เอกสาร/โครงการ/ลูกค้าที่เข้าถึงได้ อย่างละ ≤ 10 |

## 11. รหัสข้อผิดพลาดของโมดูล

| Code | HTTP | กติกา |
|---|---|---|
| `DOC_PROJECT_NOT_EDITABLE` | 409 | BR-DOC-014 |
| `DOC_REVISION_IN_PROGRESS` | 409 | BR-DOC-021 |
| `DOC_REVISION_LOCKED` | 409 | BR-DOC-026 |
| `DOC_NUMBER_LOCKED` | 409 | BR-DOC-011 |
| `DOC_REV_LABEL_INVALID` | 422 | BR-DOC-024 |
| `DOC_CANNOT_DISCARD` | 409 | BR-DOC-025 |
| `DOC_FILE_NOT_AVAILABLE` / `DOC_FILE_TYPE_MISMATCH` | 422 | BR-DOC-026 |
| `DOC_PDF_RENDITION_REQUIRED` | 422 | BR-DOC-030 |
| `DOC_REVISION_DESCRIPTION_REQUIRED` | 422 | BR-DOC-027 |
| `DOC_ASSIGNEE_REQUIRED` / `DOC_ASSIGNEE_NOT_ELIGIBLE` | 422 | BR-DOC-030/041 |
| `DOC_SEPARATION_OF_DUTIES` | 422 | BR-DOC-042 |
| `DOC_LICENSE_REQUIRED` / `DOC_LICENSE_EXPIRED` | 422 | BR-DOC-040 |
| `DOC_SIGNATURE_REQUIRED` / `DOC_SIGNATURE_INVALID` | 422 / 401 | BR-DOC-043 |
| `DOC_NOT_ASSIGNEE` | 403 | `06-security.md` §3.4 |
| `DOC_STEP_NOT_ACTIVE` / `DOC_STEP_NOT_OPTIONAL` | 409 | `05-workflows.md` §2 |
| `DOC_COMMENT_REQUIRED` | 422 | BR-DOC-033 |
| `DOC_NOT_SHAREABLE` / `TRN_ITEM_NOT_APPROVED` / `TRN_DUPLICATE_ITEM` | 422 | BR-DOC-060 |
| `TRN_NO_ITEMS` / `TRN_NO_RECIPIENT` | 422 | `05-workflows.md` §4 |
| `TRN_NOT_EDITABLE` | 409 | BR-DOC-066 |
| `TRN_LINK_EXPIRED` | 410 | BR-DOC-065 |
| `DBS_DRAFT_EXISTS` / `DBS_NOT_EDITABLE` / `DBS_SELF_APPROVAL` | 409 / 409 / 422 | BR-DOC-080–083 |
| `IMPORT_INVALID_ROWS` | 422 | BR-DOC-015 (`errors[]` มี `row`, `column`) |

## 12. สถานการณ์ทดสอบรับงาน (ใช้ทำ e2e)

| รหัส | สถานการณ์ | ผลที่ต้องได้ |
|---|---|---|
| AT-DOC-01 | DC ลงทะเบียน DWG สาขา PR ในโครงการ P26-001 สองรายการ | ได้ `P26-001-PR-DWG-001`, `-002` |
| AT-DOC-02 | นำเข้า Excel 50 แถว มี 1 แถวรหัสสาขาผิด | ไม่มีแถวใดถูกบันทึก, แสดงแถวที่ผิด |
| AT-DOC-03 | วิศวกรสร้าง Rev.A (FR) ไม่แนบ PDF แล้วส่งตรวจ | 422 `DOC_PDF_RENDITION_REQUIRED` |
| AT-DOC-04 | ส่งตรวจ Rev.A โดยเลือกตัวเองเป็นผู้ตรวจ | 422 `DOC_SEPARATION_OF_DUTIES` |
| AT-DOC-05 | ผู้ตรวจ CHECK ผ่านตามความเห็นโดยไม่มีความเห็น | 422 `DOC_COMMENT_REQUIRED` |
| AT-DOC-06 | ผู้ตรวจ CHECK ปักหมุด 2 ข้อ แล้วตีกลับ | revision กลับเป็น DRAFT, ผู้จัดทำได้แจ้งเตือน, อัปโหลดไฟล์ใหม่ได้ |
| AT-DOC-07 | ผู้จัดทำตอบความเห็น อัปโหลด PDF ใหม่ ส่งตรวจรอบ 2, ผู้ตรวจปิดความเห็นและผ่าน, ผู้อนุมัติ (กว. สามัญ ยังไม่หมดอายุ) อนุมัติด้วยรหัสผ่าน | Rev.A = APPROVED, มี SignatureEvent ที่ hash ตรงไฟล์รอบ 2, `latestApprovedRevisionId` = Rev.A |
| AT-DOC-08 | ผู้อนุมัติที่ใบอนุญาตหมดอายุเมื่อวานกดอนุมัติ | 422 `DOC_LICENSE_EXPIRED` |
| AT-DOC-09 | สร้าง Rev.0 (FC) ขณะ Rev.A ยังมีความเห็น RESPONDED 1 ข้อ แล้วอนุมัติ Rev.0 | ความเห็นถูกยกมา Rev.0; Rev.A = SUPERSEDED; ดาวน์โหลด Rev.A มีลายน้ำ SUPERSEDED |
| AT-DOC-10 | DC สร้างใบนำส่ง FC รวม Rev.0 (ไฟล์ 5 MB) ส่งอีเมล | ได้เลข `TR-P26-001-001`, อีเมลใน Mailpit มีใบนำส่ง PDF + ไฟล์แนบ, Rev.0 = ISSUED, แผน FC actualDate = วันนี้ |
| AT-DOC-11 | ส่งใบนำส่งไฟล์รวม 150 MB | เปลี่ยนเป็นลิงก์อัตโนมัติ, หน้า `/t/<token>` ดาวน์โหลดได้และถูกบันทึก, เพิกถอนแล้วได้ 410 |
| AT-DOC-12 | บันทึกผลตอบกลับ CODE_3 | เจ้าของเอกสารและ PM ได้แจ้งเตือน, ทะเบียนแสดงป้าย "ต้องออก revision ใหม่" |
| AT-DOC-13 | ผู้ตรวจไม่ดำเนินการจนเลยกำหนด 2 วันทำการ | ได้อีเมลเตือนทุกวันทำการ, PM ได้แจ้งเตือนวันที่ 2 |
| AT-DOC-14 | ผู้ใช้ที่ไม่ใช่สมาชิกโครงการเปิด URL เอกสาร | 404 |
| AT-DOC-15 | ผู้ใช้สองคนแก้ชื่อเอกสารเดียวกันพร้อมกัน | คนที่สองได้ 409 `CONFLICT_STALE_VERSION` |
