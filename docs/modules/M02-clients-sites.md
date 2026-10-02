# M02 · ลูกค้า สถานที่ และจุดเก็บตัวอย่าง (เฟส 1 / จุดเก็บตัวอย่างเฟส 3)

> Data model: `crm.prisma`

## 1. ขอบเขต

- ลูกค้า (นิติบุคคล/หน่วยงาน/บุคคล) พร้อมผู้ติดต่อ
- สถานที่ของลูกค้า (โรงงาน อาคาร ระบบประปา ระบบบำบัด …) พร้อมพิกัด ประเภทอาคาร ก–จ เลขทะเบียนโรงงาน และมาตรฐานน้ำทิ้งตั้งต้น
- จุดเก็บตัวอย่างในสถานที่ (เฟส 3)
- หน้าลูกค้ารวมศูนย์: โครงการ งานแล็บ ใบเสนอราคา ที่เกี่ยวข้อง

## 2. กติกาธุรกิจ

- **BR-CRM-001** `Client.code` ไม่ซ้ำ ระบบเสนอให้จากชื่อภาษาอังกฤษ/ไทย (แก้ได้ตอนสร้างเท่านั้น) รูปแบบ `[A-Z0-9-]{2,12}`
- **BR-CRM-002** `taxId` ถ้ากรอกต้องเป็นตัวเลข 13 หลักและผ่าน checksum ของเลขประจำตัวผู้เสียภาษีไทย; `taxId + branchCode` ซ้ำ → เตือนว่ามีลูกค้านี้แล้ว
- **BR-CRM-003** ลูกค้าที่มีโครงการ/งานแล็บ/ใบเสนอราคาอ้างถึงลบไม่ได้ ทำได้เพียงปิดใช้งาน (`isActive = false`) — ปิดแล้วเลือกในรายการใหม่ไม่ได้ แต่ข้อมูลเดิมยังแสดง
- **BR-CRM-004** ผู้ติดต่อหลัก (`isPrimary`) มีได้ 1 คนต่อลูกค้า
- **BR-CRM-005** `Site.code` ไม่ซ้ำภายในลูกค้าเดียวกัน; `buildingClass` กรอกได้เมื่อ `siteType = BUILDING`; `factoryRegistrationNo` กรอกได้เมื่อ `siteType = FACTORY`
- **BR-CRM-006** มาตรฐานตั้งต้นของจุดเก็บตัวอย่าง: `SamplingPoint.defaultStandardId` → ถ้าว่างใช้ `Site.defaultStandardId`; ระบบเสนอมาตรฐานอาคารตาม `buildingClass` อัตโนมัติ
- **BR-CRM-007** ผู้ติดต่อที่ขอให้ลบข้อมูลส่วนบุคคล → ทำให้ไม่ระบุตัวตน (`06-security.md` §8)

## 3. API

| Method | Path | สิทธิ์ |
|---|---|---|
| GET | `/clients` (กรอง `q`, `clientType`, `isActive`, `province`) | `client.read` |
| POST / PATCH / DELETE | `/clients[/{id}]` | `client.manage` |
| GET | `/clients/{id}/summary` | `client.read` — จำนวนโครงการ งานแล็บ ใบเสนอราคา ล่าสุด |
| GET / POST / PATCH / DELETE | `/clients/{id}/contacts[/{contactId}]` | `client.read` / `client.manage` |
| POST | `/contacts/{id}/anonymize` | `user.manage` |
| GET / POST / PATCH / DELETE | `/clients/{id}/sites[/{siteId}]` | `client.read` / `client.manage` |
| GET / POST / PATCH / DELETE | `/sites/{id}/sampling-points[/{pointId}]` | `client.read` / `client.manage` หรือ `lab.masterdata.manage` (เฟส 3) |

## 4. หน้าจอ

- `/clients` ตารางลูกค้า (รหัส ชื่อ ประเภท จังหวัด โครงการที่เปิดอยู่ สถานะ) + ค้นหา
- `/clients/[id]` แท็บ: ข้อมูลทั่วไป · ผู้ติดต่อ · สถานที่ (แผนที่จุด) · โครงการ · งานแล็บ (เฟส 3) · ใบเสนอราคา (เฟส 4)
- ฟอร์มสถานที่: ที่อยู่แบบ จังหวัด → อำเภอ/เขต → ตำบล/แขวง → รหัสไปรษณีย์ (ข้อมูลอ้างอิงฝังในแอปจาก dataset สาธารณะของไทย ใส่ใน `apps/web/src/data/thai-address.json`), เลือกพิกัดบนแผนที่ (Leaflet + OpenStreetMap tiles; ตรวจเงื่อนไขการใช้ tile server ก่อนใช้งานจริง)

## 5. สถานการณ์ทดสอบรับงาน

| รหัส | สถานการณ์ | ผลที่ต้องได้ |
|---|---|---|
| AT-CRM-01 | กรอกเลขผู้เสียภาษีผิด checksum | 400 ที่ฟิลด์ `taxId` |
| AT-CRM-02 | ลบลูกค้าที่มีโครงการ | 409 `CLIENT_IN_USE` และปุ่มปิดใช้งานแทน |
| AT-CRM-03 | สร้างสถานที่ BUILDING ประเภท ข | ระบบเสนอมาตรฐาน `BLD-2548-B` เป็นมาตรฐานตั้งต้น |
