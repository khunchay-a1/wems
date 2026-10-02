# ADR-0003 · สร้าง PDF ด้วย Chromium (Gotenberg)

- สถานะ: ยอมรับ (2026-09-26)

## บริบท
ภาษาไทยไม่มีช่องว่างระหว่างคำ ไลบรารีสร้าง PDF ส่วนใหญ่ใน Node ตัดบรรทัดภาษาไทยไม่ได้ และวางสระ/วรรณยุกต์ผิด เอกสารที่ส่งลูกค้า (ใบนำส่ง ใบรายงานผล ใบเสนอราคา) ต้องดูเป็นทางการ

## การตัดสินใจ
- ทุก PDF ที่ระบบสร้าง = HTML template + CSS → Gotenberg (Chromium) ซึ่งตัดคำไทยด้วย ICU
- ฝังฟอนต์ Sarabun (SIL OFL) ใน template
- ตราประทับบน PDF แบบที่อัปโหลด ใช้ `pdf-lib`; ข้อความไทยในตรา render ด้วย Gotenberg เป็น PDF เล็กแล้ว `embedPage`

## ผลที่ตามมา
- ต้องรัน container Gotenberg (~ 1 GB image) ใน dev/staging/prod
- template แก้ด้วย HTML/CSS ได้ง่าย ทดสอบด้วยการ extract ข้อความจาก PDF
- ทางเลือกที่ไม่เลือก: pdfmake/@react-pdf (ตัดคำไทยไม่ได้), Puppeteer ใน worker เอง (ดูแล Chromium เองยากกว่า)
