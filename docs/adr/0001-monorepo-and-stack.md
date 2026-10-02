# ADR-0001 · Monorepo และ tech stack

- สถานะ: ยอมรับ (2026-09-26)

## บริบท
ระบบมีเว็บ มือถือ และ API ที่ต้องเปลี่ยนไปพร้อมกัน ทีมที่ดูแลต่อจะใช้ Claude Code เป็นหลัก บริษัทเลือก Flutter สำหรับมือถือ และ TypeScript สำหรับเว็บ/API

## การตัดสินใจ
- Monorepo เดียว (pnpm workspaces + Turborepo) มี `apps/api` (NestJS), `apps/web` (Next.js), `apps/mobile` (Flutter), `packages/*`
- API: NestJS + Prisma 7 + PostgreSQL; งานเบื้องหลังใน process แยก (`worker.ts`) ด้วย BullMQ + Redis
- เว็บ: Next.js (App Router) + Tailwind + shadcn/ui + TanStack Query
- มือถือ: Flutter + Riverpod + go_router + drift

## ผลที่ตามมา
- PR เดียวเปลี่ยน API + client ทั้งสองฝั่งได้ และ CI ตรวจความสอดคล้องได้ในที่เดียว
- Flutter ไม่อยู่ใน pnpm workspace ต้องมี job CI แยก
- ทางเลือกที่ไม่เลือก: React Native (บริษัทเลือก Flutter), Laravel (ทีมถนัด TypeScript มากกว่า), แยก repo (สัญญา API หลุดง่าย)
