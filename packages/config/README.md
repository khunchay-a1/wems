# @wems/config

ค่าตั้งที่ทุก package ใน monorepo ใช้ร่วมกัน

| ไฟล์ | ใช้กับ | วิธีใช้ |
|---|---|---|
| `tsconfig/base.json` | ทุกโปรเจกต์ TS (strict) | — |
| `tsconfig/nestjs.json` | `apps/api` | `"extends": "@wems/config/tsconfig/nestjs.json"` |
| `tsconfig/nextjs.json` | `apps/web` | `"extends": "@wems/config/tsconfig/nextjs.json"` |
| `tsconfig/library.json` | `packages/*` ที่ build เป็น library | `"extends": "@wems/config/tsconfig/library.json"` |
| `eslint/index.js` | ทุก package | `createConfig({ tsconfigRootDir: import.meta.dirname, deterministicFiles: NEST_DETERMINISTIC_FILES })` |
| `prettier/index.js` | ทั้ง repo | root `prettier.config.js` re-export ไว้แล้ว |

`deterministicFiles` บังคับกฎข้อ 7 ใน `CLAUDE.md` (ห้าม `new Date()`/`Date.now()`/`randomUUID()` ใน service/domain) — `apps/api` ต้องเปิดใช้ด้วย `NEST_DETERMINISTIC_FILES`
