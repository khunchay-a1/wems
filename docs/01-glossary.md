# 01 · อภิธานศัพท์และรหัสมาตรฐาน

> ป้ายแสดงผล (ไทย/อังกฤษ) ของ **ทุก enum** ในระบบอยู่ที่ `docs/data/enum-labels.json` — web และ mobile ต้องใช้ป้ายจากไฟล์นี้เท่านั้น ห้ามตั้งเอง

## 1. ศัพท์หลัก

| คำไทย | English | ชื่อในโค้ด | ความหมาย |
|---|---|---|---|
| โครงการ | Project | `Project` | หน่วยงานตามสัญญา มีรหัส ลูกค้า ทีม และเอกสาร |
| ทะเบียนเอกสาร | Document register | `Document` | รายการเอกสาร/แบบทั้งหมดของโครงการ 1 แถว = 1 เลขเอกสาร |
| เลขเอกสาร | Document number | `Document.number` | เลขเฉพาะที่ระบบออกให้ ห้ามซ้ำทั้งระบบ |
| ฉบับแก้ไข | Revision | `DocumentRevision` | ฉบับหนึ่งของเอกสาร เช่น Rev.A, Rev.0 |
| ฉบับใช้งาน | Latest approved revision | `Document.latestApprovedRevisionId` | revision ล่าสุดที่อนุมัติแล้ว หน้างานต้องใช้ฉบับนี้ |
| ไฟล์ PDF สำหรับตรวจ | PDF rendition | `DocumentFileRole.PDF_RENDITION` | PDF ที่ใช้ดู ตรวจ ให้ความเห็น และส่งลูกค้า |
| ไฟล์ต้นฉบับ | Native file | `DocumentFileRole.NATIVE` | DWG / RVT / XLSX / DOCX ที่ใช้แก้ไข |
| รอบการตรวจ | Review cycle | `ReviewCycle` | การส่งตรวจ 1 ครั้ง; ถูกตีกลับแล้วส่งใหม่ = รอบใหม่ |
| ขั้นตอนตรวจ | Review step | `ReviewStep` | งานของผู้ตรวจ 1 คนใน 1 รอบ (ตรวจสอบ/ทบทวน/อนุมัติ) |
| แม่แบบขั้นตอน | Workflow template | `WorkflowTemplate` | ลำดับขั้นตอนตรวจที่ใช้ซ้ำได้ ผูกกับประเภทเอกสาร |
| ตารางตอบความเห็น | Comment Resolution Sheet (CRS) | รายงาน | ตารางความเห็นทุกข้อ พร้อมคำตอบและสถานะปิด |
| ใบนำส่งเอกสาร | Transmittal | `Transmittal` | ใบนำส่งที่บันทึกว่าส่งเอกสารฉบับใด ให้ใคร เมื่อไร เพื่ออะไร |
| ผลตอบกลับของลูกค้า | Client return code | `ClientReturnCode` | ผลพิจารณาเอกสารของลูกค้า (รหัส 1–4) |
| แผนส่งมอบเอกสาร | Master Deliverable List (MDL) | `DocumentPlan` | วันที่วางแผน/คาดการณ์/จริง ของการออกเอกสารแต่ละวัตถุประสงค์ |
| ค่าออกแบบ | Design basis | `DesignBasis` | อัตราการไหล คุณภาพน้ำดิบ และเป้าหมายน้ำทิ้งที่ใช้ออกแบบ |
| ผู้มีใบอนุญาต | Licensed engineer | `ProfessionalLicense` | ผู้ถือใบอนุญาตประกอบวิชาชีพวิศวกรรมควบคุม (กว.) |
| การลงนามอิเล็กทรอนิกส์ | E-signature | `SignatureEvent` | การอนุมัติที่ยืนยันตัวตนซ้ำ และบันทึก hash ของไฟล์ |
| รายงานประจำวัน | Daily site report | `DailyReport` | บันทึกกำลังคน เครื่องจักร งานที่ทำ สภาพอากาศ (เฟส 2) |
| ปัญหาหน้างาน | Issue / Punch item | `Issue` | ข้อบกพร่อง/ความเสี่ยงที่ต้องแก้และตรวจปิด (เฟส 2) |
| คำถามหน้างาน | Site query (RFI) | `SiteQuery` | คำถามจากทีมหน้างานถึงทีมออกแบบ (เฟส 2) |
| งวดงาน | Payment milestone | `PaymentMilestone` | งวดการส่งมอบและรับเงินตามสัญญา (เฟส 2) |
| งานวิเคราะห์ | Lab job | `LabJob` | คำขอวิเคราะห์ 1 ครั้งของลูกค้า มีได้หลายตัวอย่าง (เฟส 3) |
| ตัวอย่าง | Sample | `Sample` | น้ำ 1 ตัวอย่าง จาก 1 จุด ณ เวลาหนึ่ง (เฟส 3) |
| รายการทดสอบ | Sample test | `SampleTest` | การวิเคราะห์ 1 พารามิเตอร์ของ 1 ตัวอย่าง (เฟส 3) |
| พารามิเตอร์ | Parameter | `Parameter` | สิ่งที่วัด เช่น BOD, COD, pH |
| วิธีวิเคราะห์ | Analytical method | `AnalyticalMethod` | วิธีมาตรฐาน เช่น SM 5210 B พร้อม LOD/LOQ ระยะเวลาเก็บรักษา |
| ระยะเวลาเก็บรักษา | Holding time | `holdingTimeHours` | เวลาสูงสุดจากเก็บตัวอย่างถึงวิเคราะห์ |
| ชุดการวิเคราะห์ | Analysis batch | `AnalysisBatch` | กลุ่มตัวอย่างที่วิเคราะห์พร้อมกันพร้อม QC (เฟส 3) |
| ใบรายงานผล | Test report | `TestReport` | ใบรายงานผลการวิเคราะห์ที่ส่งลูกค้า (เฟส 3) |
| การส่งมอบตัวอย่าง | Chain of custody | `CustodyTransfer` | บันทึกการส่งต่อตัวอย่างพร้อมลายมือชื่อ (เฟส 3) |
| ทริปเก็บตัวอย่าง | Sampling trip | `SamplingTrip` | แผนออกเก็บตัวอย่างหลายจุดใน 1 วัน (เฟส 3) |
| มาตรฐานน้ำทิ้ง | Regulatory standard | `RegulatoryStandard` | เกณฑ์ตามประกาศที่ใช้เปรียบเทียบผล |

## 2. รหัสสาขางาน (Discipline)

ข้อมูลตั้งต้นใน `docs/data/seed/disciplines.csv` — เพิ่ม/ปิดได้ในหน้าผู้ดูแลระบบ

| รหัส | ไทย | English |
|---|---|---|
| GE | ทั่วไป | General |
| PR | กระบวนการ | Process |
| CV | โยธา | Civil |
| ST | โครงสร้าง | Structural |
| AR | สถาปัตยกรรม | Architectural |
| ME | เครื่องกล | Mechanical |
| PL | ระบบท่อ | Piping |
| EE | ไฟฟ้า | Electrical |
| IC | เครื่องมือวัดและระบบควบคุม | Instrumentation & Control |
| EN | สิ่งแวดล้อม | Environmental |
| SV | สำรวจ | Survey |
| GT | ธรณีเทคนิค | Geotechnical |

## 3. วัตถุประสงค์การออกเอกสาร (Purpose code)

| รหัส | ไทย | English | ใช้เมื่อ |
|---|---|---|---|
| FI | เพื่อทราบ | For Information | ส่งให้ทราบ ไม่ต้องตอบ |
| FR | เพื่อพิจารณา | For Review | ขอความเห็นลูกค้า (ยังไม่ใช่แบบสุดท้าย) |
| FA | เพื่ออนุมัติ | For Approval | ขอให้ลูกค้าอนุมัติ |
| FT | เพื่อประกวดราคา | For Tender | ใช้ประกวดราคา/จัดหาผู้รับเหมา |
| FC | เพื่อก่อสร้าง | For Construction | แบบที่ใช้ก่อสร้างได้ |
| AB | แบบก่อสร้างจริง | As-Built | บันทึกสิ่งที่ก่อสร้างจริงหลังงานเสร็จ |

## 4. รหัสผลตอบกลับของลูกค้า (Client return code)

| รหัส | ไทย | ผลต่อเอกสาร |
|---|---|---|
| CODE_1 | อนุมัติ | ใช้ต่อได้ |
| CODE_2 | อนุมัติตามความเห็น | ใช้ต่อได้ ต้องแก้ตามความเห็นใน revision ถัดไป |
| CODE_3 | แก้ไขแล้วส่งใหม่ | ต้องออก revision ใหม่ (ระบบแจ้งเจ้าของเอกสาร) |
| CODE_4 | ไม่อนุมัติ | ต้องออก revision ใหม่ (ระบบแจ้งเจ้าของเอกสารและ PM) |
| INFO | รับทราบ | ใช้กับเอกสารที่ส่งเพื่อทราบ |

## 5. ระบบ Revision (ตั้งต่อโครงการ `Project.revisionScheme`)

| Scheme | ก่อนออกเพื่อก่อสร้าง (FI/FR/FA/FT) | เพื่อก่อสร้าง/As-built (FC/AB) | ตัวอย่างลำดับ |
|---|---|---|---|
| `ALPHA_NUMERIC` (ค่าเริ่มต้น) | A, B, C, … Z, AA, AB, … | 0, 1, 2, … | A → B → 0 → 1 → 2 |
| `ISO19650` | P01, P02, … | C01, C02, … | P01 → P02 → C01 → C02 |

กติกาการออกเลข revision อยู่ใน `modules/M04-design-documents.md` BR-DOC-020 ถึง BR-DOC-024

## 6. ประเภทเอกสาร (Document type)

ข้อมูลตั้งต้นใน `docs/data/seed/document-types.csv`

| รหัส | ไทย | ต้องมี PDF | ผู้อนุมัติต้องมีใบอนุญาต | Workflow ตั้งต้น |
|---|---|---|---|---|
| DWG | แบบ | ✔ | ✔ | `DRAW_CHECK_APPROVE` |
| PID | แผนภาพท่อและเครื่องมือวัด (P&ID) | ✔ | ✔ | `DRAW_CHECK_APPROVE` |
| PFD | แผนผังกระบวนการ | ✔ | ✔ | `DRAW_CHECK_APPROVE` |
| CAL | รายการคำนวณ | ✔ | ✔ | `DRAW_CHECK_APPROVE` |
| SPC | ข้อกำหนดทางเทคนิค | ✔ | – | `CHECK_APPROVE` |
| RPT | รายงาน | ✔ | – | `CHECK_APPROVE` |
| BOQ | บัญชีแสดงปริมาณวัสดุและราคา | ✔ | – | `CHECK_APPROVE` |
| DS | แผ่นข้อมูลอุปกรณ์ | ✔ | – | `CHECK_APPROVE` |
| LST | รายการอุปกรณ์/รายการอื่น | ✔ | – | `CHECK_APPROVE` |
| MAN | คู่มือ O&M | ✔ | – | `CHECK_APPROVE` |
| SCH | แผนงาน | ✔ | – | `APPROVE_ONLY` |
| MOM | บันทึกการประชุม | ✔ | – | `APPROVE_ONLY` |
| LET | หนังสือ | ✔ | – | `APPROVE_ONLY` |
| OTH | อื่นๆ | – | – | `APPROVE_ONLY` |

## 7. รูปแบบการแสดงผล

| เรื่อง | กติกา |
|---|---|
| วันที่ | เก็บ UTC (`timestamptz`) แสดงเขตเวลา `Asia/Bangkok`; ค่าเริ่มต้นแสดง พ.ศ. เช่น `26 ก.ย. 2569` (ผู้ใช้เลือก ค.ศ. ได้ `User.calendar`) |
| วันที่อย่างเดียว | ฟิลด์ `@db.Date` (เช่น วันที่รายงาน) ไม่มีเขตเวลา ห้ามแปลงผ่าน `Date` ของ JS แบบมีเวลา |
| ตัวเลข/เงิน | คั่นหลักพันด้วย `,` ทศนิยม 2 ตำแหน่งสำหรับเงิน สกุล `THB` แสดง "บาท" |
| ผลแล็บ | แสดง `resultText` ที่ปัดเศษแล้วตามวิธีวิเคราะห์ ไม่แสดง `resultValue` ดิบในรายงาน |
| หน่วย | mg/L, °C, pH (ไม่มีหน่วย), ADMI, mL/L, µS/cm, NTU, MPN/100 mL |
| ชื่อคน | แสดง `displayNameTh` เป็นหลัก ภาษาอังกฤษใช้ `displayNameEn` ถ้ามี |
