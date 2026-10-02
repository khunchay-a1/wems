---
name: spec-check
description: ตรวจว่าโค้ดของโมดูลใน WEMS ตรงกับสเปก (endpoint, สิทธิ์, state machine, test ของกติกา BR, error code, ป้าย enum) ใช้ก่อนเปิด PR หรือเมื่อผู้ใช้ขอให้ตรวจความครบถ้วนของโมดูล
argument-hint: "[M01-M09 เช่น M04]"
---

# ตรวจโค้ดเทียบสเปก

โมดูล: $ARGUMENTS (ถ้าว่าง ให้ตรวจโมดูลของเฟสปัจจุบันใน `docs/10-roadmap.md`)

รายงานอย่างเดียว **ห้ามแก้โค้ด** เว้นแต่ผู้ใช้สั่ง

1. รันเครื่องมือ:
   - `node tools/check-spec-refs.mjs`
   - `node tools/check-enum-labels.mjs`
   - `node tools/check-spec-refs.mjs --tests BR-<PREFIX>` (M01 = PLT, M02 = CRM, M03 = PRJ, M04 = DOC, M05 = SITE, M06 = LAB, M07 = SMP, M08 = COM)
2. **Endpoint**: ทุกแถวในตาราง API ของ `docs/modules/<module>.md` ต้องมีใน `packages/api-contract/openapi.json` (เทียบ method + path โดยแปลง `{param}` ให้ตรงกัน) และทุก path ใน openapi ของโมดูลต้องอยู่ในสเปก (ไม่มี endpoint เกินที่ไม่ได้บันทึก)
3. **สิทธิ์**: รายการใน `apps/api/src/common/auth/permissions.ts` ตรงกับ `docs/data/seed/roles.json`; endpoint ใช้ permission ตามคอลัมน์ "สิทธิ์" ของสเปก
4. **State machine**: ทุกแถวของตาราง transition ใน `docs/05-workflows.md` ที่เป็นของโมดูลนี้มี test (ผ่าน + ถูกปฏิเสธโดย guard)
5. **Error code**: ทุก code ในตาราง "รหัสข้อผิดพลาด" ของโมดูลมีใน `apps/api/src/common/i18n/errors.th.json` และ `errors.en.json`
6. **เกณฑ์รับงาน**: มี e2e/integration test ที่อ้างรหัส AT ของโมดูลครบ
7. สรุปเป็นตาราง: หัวข้อ · สิ่งที่ขาด/ไม่ตรง · ไฟล์ที่เกี่ยวข้อง · ข้อเสนอการแก้ — เรียงจากเรื่องที่กระทบผู้ใช้มากที่สุด
