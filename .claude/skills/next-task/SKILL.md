---
name: next-task
description: ทำ task ถัดไป (หรือ task ที่ระบุ) ตาม docs/10-roadmap.md ของ WEMS ตั้งแต่อ่านสเปก เขียน test และโค้ด จนผ่าน Definition of Done แล้วติ๊กใน roadmap
disable-model-invocation: true
argument-hint: "[task-id เช่น P1-04]"
---

# ทำ task ถัดไปใน roadmap

Task: $ARGUMENTS — ถ้าว่าง ให้เลือก task แรกใน `docs/10-roadmap.md` ที่ยังไม่ติ๊ก `[x]` และ task ก่อนหน้าในเฟสเดียวกันที่มันต้องพึ่งเสร็จแล้ว

1. **อ่าน task** ใน `docs/10-roadmap.md`: ขอบเขต, สเปกที่อ้างถึง (`§`), เกณฑ์รับงาน (AT-xxx) และ Definition of Done ด้านบนของไฟล์
2. **อ่านสเปกที่อ้างถึงทั้งหมด** — โมดูลใน `docs/modules/`, สถานะใน `docs/05-workflows.md`, สิทธิ์ใน `docs/06-security.md`, ตารางใน `docs/03-data-model.md`, และแถวที่เกี่ยวข้องใน `docs/open-questions.md`
3. **เตรียม repo**: `git status` ต้องสะอาด แล้วสร้าง branch `feat/<task-id ตัวเล็ก>-<slug>` (เช่น `feat/p1-04-document-register`)
4. **วางแผนสั้นๆ** (แสดงให้ผู้ใช้เห็น): ไฟล์ที่จะสร้าง/แก้, test ที่จะเขียนพร้อมรหัส BR/AT, ความเสี่ยง
   - สเปกขาดหรือขัดกัน → เลือกทางที่ย้อนกลับง่ายที่สุด เพิ่มแถวใน `docs/open-questions.md` ระบุค่าที่สมมติ แล้วทำต่อ (หยุดถามเฉพาะเมื่อการตัดสินใจย้อนกลับไม่ได้ เช่น ลบข้อมูล เปลี่ยนสัญญา API ที่ปล่อยแล้ว)
5. **เขียน test ก่อน** สำหรับ domain logic (state machine, กติกา BR, คำนวณ) — ชื่อ test ขึ้นต้นด้วยรหัส BR/AT
6. **Implement** ตาม `CLAUDE.md` และ `.claude/rules/*` (API: transaction + audit + change log + outbox; สิทธิ์; optimistic locking; response DTO + `allowedActions`)
7. **ตรวจ** เฉพาะส่วนที่แตะและส่วนที่ได้รับผลกระทบ:
   - `pnpm lint && pnpm typecheck && pnpm test`
   - แตะ API → `pnpm api:contract` แล้ว generate client มือถือ (`dart run swagger_parser` + `build_runner`)
   - แตะ schema → migration + `node tools/check-enum-labels.mjs`
   - แตะมือถือ → `flutter analyze && flutter test`
   - `node tools/check-spec-refs.mjs`
8. **ทวน Definition of Done** ทีละข้อ และรันสถานการณ์ AT ของ task (e2e/Playwright หรือ integration)
9. **อัปเดตเอกสาร**: พฤติกรรมต่างจากสเปก → แก้สเปกให้ตรง; ติ๊ก `[x]` ที่ task ใน roadmap
10. **Commit** แบบ conventional commits: `feat(<module>): <task-id> <สรุปภาษาอังกฤษ>` แล้วสรุปให้ผู้ใช้: ทำอะไร, test อะไรผ่าน, ค่าที่สมมติ/เรื่องที่ค้าง และ task ถัดไปที่แนะนำ
