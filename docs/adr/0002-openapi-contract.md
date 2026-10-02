# ADR-0002 · OpenAPI เป็นสัญญาระหว่าง API กับ client

- สถานะ: ยอมรับ (2026-09-26)

## บริบท
client มีสองภาษา (TypeScript, Dart) ถ้าเขียน type ซ้ำด้วยมือจะหลุดจาก API จริง

## การตัดสินใจ
- NestJS สร้าง OpenAPI จาก DTO + decorator (`@nestjs/swagger` CLI plugin) → `packages/api-contract/openapi.json` (commit ลง repo)
- เว็บ: `openapi-typescript` + `openapi-fetch`; มือถือ: `swagger_parser` → retrofit + freezed
- `operationId` รูปแบบ `<Tag>_<verb><Noun>`; CI ล้มถ้าไฟล์ที่ generate ไม่ตรงกับที่ commit

## ผลที่ตามมา
- ทุกการเปลี่ยน API ต้อง generate และ commit ทั้งสามที่ใน PR เดียว
- DTO ต้องมี decorator ครบ (รวม enum, nullable, example) ไม่อย่างนั้น client จะได้ type ผิด
- ทางเลือกที่ไม่เลือก: tRPC/ts-rest (ไม่รองรับ Dart), GraphQL (เกินความจำเป็นสำหรับระบบภายใน)
