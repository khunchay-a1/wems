---
paths:
  - "apps/web/**"
---

# กติกาโค้ดเว็บ (Next.js)

- App Router; หน้าที่ดึง/แก้ข้อมูลเป็น client component ใช้ TanStack Query; server component ใช้ทำ layout/shell
- เรียก API ผ่าน client ที่ generate จาก `packages/api-contract` (openapi-fetch) เท่านั้น — ห้าม `fetch('/api/...')` เขียนมือ และห้ามเขียน type ของ API เอง
- ห้ามเขียนกติกาธุรกิจซ้ำ: แสดงปุ่มจาก `allowedActions`, disabled + เหตุผลจาก `blockedActions`
- ข้อความทุกตัวผ่าน next-intl (`messages/th.json`, `messages/en.json`); ป้าย enum จากไฟล์ที่ generate ด้วย `tools/gen-i18n-enums.mjs` — ห้าม hard-code ภาษาไทยใน JSX
- ใช้ component กลางใน `docs/07-web-ui.md` §3 (`DataTable`, `StatusBadge`, `DateField`, `FileUploader`, `PdfViewer`, `SignatureDialog`, `ProblemAlert`, `ConflictDialog`) ก่อนสร้างใหม่
- ตาราง: pagination/sort/filter ที่ server และ sync กับ URL query
- ฟอร์ม: react-hook-form + zod; map `errors[]` จาก problem+json ลงฟิลด์
- วันที่: แสดงผ่าน formatter กลาง (พ.ศ./ค.ศ. ตาม `User.calendar`, เขตเวลา Asia/Bangkok); ส่งวันที่อย่างเดียวเป็น `YYYY-MM-DD`
- Next.js 16 ขึ้นไปใช้ `proxy.ts` (ไม่ใช่ `middleware.ts`)
- ใส่ `data-testid` ให้ element ที่ Playwright ใช้; e2e อยู่ใน `apps/web/e2e/` ตั้งชื่อด้วย AT id
