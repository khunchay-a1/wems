# M06 · ห้องปฏิบัติการ LIMS (เฟส 3)

> Data model: `lab.prisma` · สถานะ: `05-workflows.md` §8 · seed: `docs/data/seed/parameters.csv`, `standards.csv`, `calc-formulas.json`
> แนวปฏิบัติอ้างอิง ISO/IEC 17025:2017 (ความถูกต้องของข้อมูล การตรวจสอบย้อนกลับ การแก้ไขรายงาน) — **ก่อนเริ่มเฟส 3** ให้ผู้จัดการห้องปฏิบัติการทบทวนสเปกนี้ รายการวิธีวิเคราะห์ ขอบข่ายการรับรอง และรูปแบบใบรายงานผลจริงของบริษัท

## 1. ขอบเขต

Master data (พารามิเตอร์ วิธีวิเคราะห์ สูตรคำนวณ เกณฑ์ QC แพ็กเกจ มาตรฐาน เครื่องมือ) → ลงทะเบียนงานและตัวอย่าง → พิมพ์ฉลาก QR → รับตัวอย่าง → worklist/batch → บันทึกผลและคำนวณ → QC → ทบทวน → อนุมัติ → ประเมินกับมาตรฐาน → ใบรายงานผล (รวมฉบับแก้ไข) → ส่งลูกค้า

## 2. กติกาธุรกิจ

### ลงทะเบียนและรับตัวอย่าง
- **BR-LAB-001** งานวิเคราะห์ต้องมีลูกค้า; ถ้ามาจากใบเสนอราคาที่ ACCEPTED ระบบคัดลอกรายการทดสอบมาให้
- **BR-LAB-002** เพิ่มรายการทดสอบด้วยแพ็กเกจและ/หรือวิธีวิเคราะห์รายตัว; พารามิเตอร์เดียวกันซ้ำในตัวอย่างเดียวไม่ได้ (ยกเว้นต่างวิธี)
- **BR-LAB-003** `dueDate` เริ่มต้น = วันรับตัวอย่าง + max(`tatDays`) ของรายการทดสอบ (วันทำการ); URGENT ใช้ครึ่งหนึ่ง (ปัดขึ้น)
- **BR-LAB-010** รับตัวอย่าง: บันทึกอุณหภูมิ สภาพภาชนะ จำนวนภาชนะ; อุณหภูมิเกิน `lab.receiptMaxTempC` (ค่าตั้งต้น 6 °C) หรือภาชนะเสีย → เลือก ACCEPTED_WITH_DEVIATION (ต้องมีหมายเหตุ ซึ่งจะแสดงในรายงาน) หรือ REJECTED
- **BR-LAB-011** `holdingDeadline` = `sampledAt` + `holdingTimeHours` ของวิธี; รับตัวอย่างหลังเลยกำหนดของรายการใด → รายการนั้นถูกตั้ง `holdingTimeExceeded` และต้องมีหมายเหตุในรายงาน
- **BR-LAB-012** เริ่มวิเคราะห์หลัง `holdingDeadline` → `holdingTimeExceeded = true` และเตือนก่อนบันทึก

### การวิเคราะห์ การคำนวณ QC
- **BR-LAB-020** ผลคำนวณด้วย `CalcFormula` ที่ผูกกับวิธี; ระบบเก็บ `rawData`, `calcFormulaId` (เวอร์ชันที่ใช้), `resultValue` (ไม่ปัด) และ `resultText` (ปัดแล้ว)
- **BR-LAB-021** แก้สูตร = สร้างเวอร์ชันใหม่ (`version + 1`); ผลเดิมไม่ถูกคำนวณใหม่อัตโนมัติ
- **BR-LAB-022** เงื่อนไขความใช้ได้ (`validations`) ระดับ ERROR ห้ามบันทึก, WARNING บันทึกได้แต่ต้องมีหมายเหตุ
- **BR-LAB-023** ปัดเศษ: ใช้ `significantFigures` ถ้ากำหนด มิฉะนั้น `decimals`; โหมด `roundingMode`; ค่าต่ำกว่า LOQ → `qualifier = LESS_THAN`, `resultText = "<{LOQ}"`; วิธีที่รายงาน ND (เช่น สารฆ่าศัตรูพืช) ต่ำกว่า LOD → `NOT_DETECTED`, `resultText = "ND"`; เกิน `rangeMax` → บังคับเจือจางใหม่หรือรายงาน `">{rangeMax}"` พร้อมหมายเหตุ
- **BR-LAB-024** ผลคูณ `dilutionFactor` ก่อนปัดเศษ
- **BR-LAB-030** เครื่องมือที่เลยกำหนดสอบเทียบและ `blockWhenOverdue` หรือสถานะไม่ใช่ IN_SERVICE → ใช้บันทึกผลไม่ได้ (`LAB_INSTRUMENT_NOT_USABLE`)
- **BR-LAB-031** Batch: ต้องมี QC ตาม `QcCriterion` (เช่น blank 1 ต่อ batch, duplicate 1 ต่อ 10 ตัวอย่าง); ค่า QC นอกเกณฑ์ → batch QC_FAILED และผลทุกรายการใน batch กลับ IN_PROGRESS
- **BR-LAB-032** สูตร QC: `recovery% = (spiked − unspiked) / added × 100`, LCS `recovery% = measured / expected × 100`, `RPD% = |x1 − x2| / ((x1 + x2) / 2) × 100`

### ทบทวน อนุมัติ และประเมินผล
- **BR-LAB-040** ผู้ทบทวนและผู้อนุมัติต้องไม่ใช่นักวิเคราะห์ของรายการนั้น; การอนุมัติต้องลงนาม (`06-security.md` §4)
- **BR-LAB-041** ทุกการเปลี่ยน `rawData`/`resultValue`/`qualifier`/`status` หลัง RESULT_ENTERED ต้องมีเหตุผล และเขียน `ResultAudit` ทุกฟิลด์ที่เปลี่ยน
- **BR-LAB-042** ประเมินกับมาตรฐาน (ตอนอนุมัติ, เก็บใน `complianceStatus`):

| Comparator | PASS เมื่อ | กรณีพิเศษ |
|---|---|---|
| MAX | ค่า ≤ max | `"<LOQ"` และ LOQ ≤ max → PASS; LOQ > max → NOT_EVALUATED (เตือน "LOQ สูงกว่าเกณฑ์") |
| MIN | ค่า ≥ min | |
| RANGE | min ≤ ค่า ≤ max (รวมขอบ) | |
| NOT_DETECTED | qualifier = NOT_DETECTED | |
| MAX_INCREASE_OVER_BASELINE | ค่า − baseline ≤ max | ไม่มี `baselineValues` → NOT_EVALUATED |
| INFO | – | NOT_EVALUATED เสมอ |
| `evaluation = MANUAL` | ผู้อนุมัติเลือกเอง | ต้องมีหมายเหตุ |

### ใบรายงานผล
- **BR-LAB-050** ออกรายงานได้เมื่อทุกรายการทดสอบของตัวอย่างที่เลือก APPROVED หรือ CANCELLED; ผู้ออกต้องมี `lab.report.issue` และลงนาม
- **BR-LAB-051** แก้รายงานที่ออกแล้ว = ออกฉบับใหม่ `reportVersion + 1` เลขเดิม ระบุ `amendmentReason` และข้อความ "ฉบับแก้ไข แทนฉบับที่ …"; ฉบับเดิม SUPERSEDED (ยังดาวน์โหลดได้พร้อมลายน้ำ)
- **BR-LAB-052** รายงานแสดง: ข้อมูลลูกค้า/สถานที่/จุดเก็บ, วันเวลาเก็บ/รับ/วิเคราะห์, ผู้เก็บ, สภาพตัวอย่างและ deviation, ตารางผล (พารามิเตอร์, วิธี, หน่วย, LOQ, ผล, เกณฑ์, ผ่าน/ไม่ผ่าน), เครื่องหมายรายการที่อยู่ในขอบข่ายการรับรอง, ค่าภาคสนาม (ระบุว่าวัดภาคสนาม), หมายเหตุ holding time, ลายมือชื่อผู้วิเคราะห์/ผู้อนุมัติ, "ผลการทดสอบนี้ใช้กับตัวอย่างที่ทดสอบเท่านั้น", เลขหน้า x/y
- **BR-LAB-053** ส่งรายงานทางอีเมลถึงผู้ติดต่อที่ `receivesLabReports` (เลือกเพิ่ม/ลดได้ตอนส่ง) บันทึก `sentTo`, `sentAt`

## 3. สูตรคำนวณตั้งต้น (`docs/data/seed/calc-formulas.json`)

ประเมินนิพจน์ด้วย `mathjs` ในโหมดจำกัด (อนุญาตเฉพาะตัวแปรจาก `inputs` และฟังก์ชัน `abs min max round sqrt log10 mean`; ห้ามกำหนดตัวแปร/ฟังก์ชัน) และตรวจนิพจน์ตอนบันทึกสูตร — ตั้ง `math.create(all, { number: 'BigNumber', precision: 34 })` เพื่อเลี่ยงความคลาดเคลื่อนของ floating point (เช่น 1250.4 − 1245.2) แล้วแปลงผลเป็น `Prisma.Decimal`

| Code | นิพจน์ | ตัวอย่างทดสอบ |
|---|---|---|
| `BOD5_SEEDED` | `((D1 - D2) - S * Vs) / P` | D1=8.5, D2=4.3, S=0.1, Vs=2, P=0.1 → **40** |
| `BOD5_UNSEEDED` | `(D1 - D2) / P` | D1=8.2, D2=5.1, P=0.2 → **15.5** |
| `COD_TITRIMETRIC` | `(A - B) * M * 8000 / V` | A=10.0, B=7.5, M=0.1, V=2.5 → **800** |
| `TSS_GRAVIMETRIC` | `(A - B) * 1000 / V` | A=1250.4, B=1245.2, V=100 → **52** |
| `TDS_GRAVIMETRIC` | `(A - B) * 1000 / V` | A=48210.5, B=48190.5, V=50 → **400** |
| `OG_GRAVIMETRIC` | `(A - B) * 1000 / V` | A=15.2, B=0.4, V=1000 → **14.8** |

เงื่อนไข BOD: `D1 - D2 >= 2` (ERROR "DO ลดลงน้อยกว่า 2.0 mg/L — dilution นี้ใช้ไม่ได้"), `D2 >= 1` (ERROR "DO คงเหลือน้อยกว่า 1.0 mg/L — dilution นี้ใช้ไม่ได้") — หลาย dilution ที่ใช้ได้ให้เฉลี่ย (`mean`) ตามวิธีของห้องปฏิบัติการ

> สูตรและเงื่อนไขอ้างอิงแนวทาง Standard Methods — ห้องปฏิบัติการต้องยืนยันให้ตรงกับวิธีปฏิบัติงาน (SOP) ของตนก่อนใช้งานจริง

## 4. API (ย่อ)

| กลุ่ม | Endpoint หลัก | สิทธิ์ |
|---|---|---|
| Master data | `/parameters`, `/analytical-methods`, `/calc-formulas` (+ `/calc-formulas/{id}/test` ทดลองคำนวณ), `/qc-criteria`, `/test-packages`, `/regulatory-standards` (+ `/copy` สร้างมาตรฐานเฉพาะราย), `/instruments` (+ `/events`) | อ่าน: `lab.read`; แก้: `lab.masterdata.manage` / `lab.instrument.manage` |
| งาน | `GET/POST /lab-jobs`, `GET/PATCH /lab-jobs/{id}`, `POST /lab-jobs/{id}/open` · `/cancel` · `/close`, `POST /lab-jobs/{id}/samples` | `lab.job.manage` |
| ตัวอย่าง | `GET /samples` (กรองสถานะ/งาน/วันที่), `GET/PATCH /samples/{id}`, `POST /samples/{id}/receive` · `/reject` · `/dispose`, `POST /samples/{id}/tests`, `GET /lab-jobs/{id}/labels.pdf` | `lab.sample.receive` / `lab.job.manage` |
| รับด้วย QR | `GET /containers/{label}` → ตัวอย่างที่ผูก | `lab.sample.receive` |
| Worklist | `GET /sample-tests?status=PENDING,IN_PROGRESS&methodId=&analystId=me` | `lab.result.enter` |
| Batch | `POST /analysis-batches`, `POST /analysis-batches/{id}/tests`, `POST /analysis-batches/{id}/qc-results`, `POST /analysis-batches/{id}/complete` · `/approve` | `lab.result.enter` / `lab.result.approve` |
| ผล | `POST /sample-tests/{id}/start` · `/result` (rawData → คำนวณ) · `/review` · `/approve` · `/reject` · `/reopen` · `/cancel`, `GET /sample-tests/{id}/audit` | ตาม `05-workflows.md` §8 |
| รายงาน | `POST /lab-jobs/{id}/reports`, `GET /test-reports/{id}/preview.pdf`, `POST /test-reports/{id}/submit` · `/issue` · `/send` · `/amend` | `lab.report.issue` |
| แนวโน้ม | `GET /sampling-points/{id}/trend?parameterCode=BOD5&from=&to=` | `lab.read` |

## 5. หน้าจอ (เว็บ; แท็บเล็ตในแล็บ)

- `/lab` แดชบอร์ด: ตัวอย่างรอรับ, ใกล้หมด holding time, ค้างวิเคราะห์ตามพารามิเตอร์, รอทบทวน/อนุมัติ, TAT เลยกำหนด, เครื่องมือใกล้ครบสอบเทียบ
- `/lab/jobs` + `/lab/jobs/[id]` (ตัวอย่าง ตารางรายการทดสอบแบบ matrix ตัวอย่าง × พารามิเตอร์ สถานะเป็นสี, รายงาน)
- `/lab/receive` หน้าจอรับตัวอย่าง: สแกน QR (กล้องแท็บเล็ต/เครื่องสแกน USB), ช่องอุณหภูมิ, สภาพ, ลายมือชื่อส่งมอบ
- `/lab/worklist` แยกตามวิธี → สร้าง batch → ตารางกรอกค่าดิบ (คำนวณทันที แสดงคำเตือน) → QC
- `/lab/review` รายการรอทบทวน/อนุมัติ แบบเลือกหลายรายการ แล้วลงนามครั้งเดียว
- `/lab/reports/[id]` ตัวอย่าง PDF + ออก/ส่ง/แก้ไข
- `/lab/master/*` พารามิเตอร์ วิธี สูตร (มีช่องทดลองคำนวณ) แพ็กเกจ มาตรฐาน; `/lab/instruments`

## 6. สถานการณ์ทดสอบรับงาน

| รหัส | สถานการณ์ | ผลที่ต้องได้ |
|---|---|---|
| AT-LAB-01 | บันทึก BOD D1=8.5 D2=8.0 | ถูกปฏิเสธด้วยข้อความ DO ลดลงน้อยกว่า 2.0 |
| AT-LAB-02 | ผล BOD = 1.2 mg/L, LOQ = 2 | `resultText = "<2"`, เทียบเกณฑ์ ≤ 20 → PASS |
| AT-LAB-03 | ผล pH 9.2 เทียบ `IND-2560` | FAIL |
| AT-LAB-04 | นักวิเคราะห์อนุมัติผลของตัวเอง | 422 `LAB_SELF_APPROVAL` |
| AT-LAB-05 | แก้ผลที่ APPROVED และรายงานออกแล้ว | ต้อง reopen พร้อมเหตุผล → อนุมัติใหม่ → ออกรายงานฉบับแก้ไข v2, v1 = SUPERSEDED, ResultAudit ครบ |
| AT-LAB-06 | ใช้เครื่อง pH meter ที่เลยกำหนดสอบเทียบ | 422 `LAB_INSTRUMENT_NOT_USABLE` |
| AT-LAB-07 | duplicate RPD 35% (เกณฑ์ ≤ 20%) | batch QC_FAILED, รายการกลับ IN_PROGRESS |
| AT-LAB-08 | รับตัวอย่าง BOD หลังเก็บ 50 ชั่วโมง | ตั้ง `holdingTimeExceeded`, รายงานมีหมายเหตุ |
