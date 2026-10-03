# me-budget

เว็บแอปบันทึกรายรับ-รายจ่ายส่วนตัวสำหรับคนไทย (ใช้คนเดียว, เงินบาทอย่างเดียว, mobile-first ติดตั้งเป็น PWA ได้) เน้น **จดให้เร็วที่สุด** และรองรับกรณี "ออกก่อนแฟน" (จ่ายแทนแฟนไปก่อนแล้วตามเก็บทีหลัง) พร้อม gamification เล็กๆ ให้กลับมาจดทุกวัน

## ฟีเจอร์ที่ใช้ได้แล้ว
- **จดเร็ว:** dashboard + ปุ่ม [+] ลอย แตะสั้น = จดรายจ่าย, กดค้าง = วงล้อเลือกโหมด 6 ช่อง (รายจ่าย, รายรับ, ออกก่อนแฟน, แฟนจ่ายคืน, ไม่ได้ใช้เงิน, สแกนใบเสร็จ) แล้วแตะหมวดเพื่อบันทึกเลย
- **ปุ่มลัด (Preset):** แตะครั้งเดียวจดเลย ตั้งเป็นออกก่อนแฟนได้ มีแถบ "ย้อนกลับ" 5 วินาทีหลังจด
- **ออกก่อนแฟน:** หาร / ของแฟนทั้งหมด / กรอกเอง, ยอดแฟนติด, แฟนจ่ายคืน (หักยอดรวม), ดูยอดค้างตามรายการแบบ FIFO
- **หมวดหมู่:** หมวดตั้งต้น เพิ่ม/ซ่อนหมวดเองได้ icon เป็น Material Symbols
- **สแกนใบเสร็จด้วย AI (Gemini):** อ่านรายการสินค้า เดาเจ้าของ (เรา/แฟน/หาร) จากความจำเจ้าของและโน้ตเกี่ยวกับแฟน มีหน้าตรวจ/แก้ก่อนบันทึก ไม่เก็บรูป จำกัด 20 ครั้งต่อ 24 ชั่วโมง
- **Dashboard widget ปรับแต่งได้:** streak, ยอดแฟนติด, ปุ่มลัด, วันนี้, ปฏิทิน (heatmap + sheet รายการรายวัน), รายการล่าสุด เปิด/ปิดและลากเรียงได้ เก็บไว้บน DB
- **Gamification:** streak รายวัน, วันไม่ได้ใช้เงิน, XP/Level, แถบเตือน streak จะหลุด, เอฟเฟกต์ +XP และหน้าฉลองตอนเลเวลอัป/streak ครบ 7, 30, 100 วัน
- **Login:** email + password ผู้ใช้เดียว (Auth.js Credentials), session 90 วัน, จำกัดล็อกอินผิด 5 ครั้งต่อ 15 นาที (ต่ออีเมลและต่อ IP)

ยังไม่ทำ: งบประมาณ (FR-5), notification, badges, streak freeze, export CSV, มาสคอต, ระบบเสนอปุ่มลัดอัตโนมัติ, คิวจด offline, สรุปรายสัปดาห์/กราฟ/ตัวกรอง ดูสถานะละเอียดใน [docs/TOR.md](docs/TOR.md)

## Stack
Next.js 16 (App Router) + TypeScript · Tailwind CSS v4 · TanStack Query (persist ลง localStorage) · Motion · Radix Dialog · Auth.js (`next-auth` v5 beta) · Sequelize v6 + Postgres (Neon ใน production) · Umzug (migrations) · Google Gemini (`@google/genai`) · zod · Vitest + Testcontainers · pnpm

## เริ่มใช้งาน (dev ในเครื่อง)
ต้องมี Node.js ≥ 22, pnpm และ Docker (Docker Desktop หรือ OrbStack)

```bash
docker compose up -d            # Postgres 17 ที่ localhost:5432 (user/pass/db = mebudget)
cp .env.example .env.local      # แล้วแก้ค่าตามด้านล่าง
pnpm install
pnpm db:migrate                 # สร้างตาราง + seed หมวดตั้งต้น
pnpm auth:hash                  # ถามรหัสผ่านแบบซ่อน (อย่างน้อย 12 ตัวอักษร) แล้วพิมพ์ AUTH_PASSWORD_HASH=...
pnpm dev                        # http://localhost:3000
```

ค่าใน `.env.local`:

| ตัวแปร | ใช้ทำอะไร |
|---|---|
| `DATABASE_URL` | connection string ของ Postgres (ค่าใน `.env.example` ใช้กับ docker compose ได้เลย) |
| `AUTH_SECRET` | secret ของ Auth.js สร้างด้วย `openssl rand -base64 32` |
| `AUTH_EMAIL` | อีเมลของผู้ใช้คนเดียว |
| `AUTH_PASSWORD_HASH` | ผลลัพธ์จาก `pnpm auth:hash` (รูปแบบ `scrypt:...` ไม่มีตัว `$`) |
| `GEMINI_API_KEY` | key ของ Gemini ใช้เฉพาะตอนสแกนใบเสร็จ (ฝั่ง server เท่านั้น) |
| `GEMINI_MODEL` | (ไม่บังคับ) เปลี่ยนรุ่นโมเดล ค่าเริ่มต้น `gemini-3.5-flash-lite` |

## Scripts
| คำสั่ง | ทำอะไร |
|---|---|
| `pnpm dev` / `build` / `start` | รัน dev server / build / รัน production build |
| `pnpm lint` | ESLint (รวมกฎ boundaries ของชั้นสถาปัตยกรรม) |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` / `pnpm test:watch` | Vitest (ต้องเปิด Docker เพราะมี integration test) |
| `pnpm db:migrate` / `pnpm db:rollback` | รัน / ย้อน migration กับ DB ใน `.env.local` |
| `pnpm db:migrate:prod` | รัน migration กับ `DATABASE_URL` ที่ตั้งใน environment (ไม่อ่านไฟล์ `.env*`) ใช้กับ production |
| `pnpm auth:hash` | สร้าง hash รหัสผ่านสำหรับ `AUTH_PASSWORD_HASH` |

ใช้ **pnpm เท่านั้น** (ไม่ใช้ npm/yarn) · `pnpm-workspace.yaml` ปิด build script ของ dependency ทั้งหมดผ่าน `allowBuilds: false`

## สถาปัตยกรรม
Clean Architecture ใน Next.js ตัวเดียว dependency ชี้เข้าหาชั้นในเสมอ:

```
src/app/api, src/lib   (interface: route handler → auth() → zod → use case → HTTP)
        ↓
src/infrastructure     (Sequelize repos, Gemini parser, scrypt, clock)  ──implements──▶ ports
        ↓
src/application        (use cases + ports; ไม่รู้จัก Next/Sequelize/Gemini)
        ↓
src/domain             (pure TS: เงินเป็นสตางค์, split, FIFO, streak, XP; ใช้ร่วมกับ client ได้)

src/components, src/client   (UI; แตะได้เฉพาะ domain เท่านั้น)
```

- ต่อ dependency เองใน `src/lib/container.ts` (composition root) ไม่ใช้ DI library
- กฎข้ามชั้นบังคับด้วย **`eslint-plugin-boundaries`** ใน `eslint.config.mjs` (`pnpm lint` ล้มถ้าข้ามชั้น) และ `domain/` กับ `application/` ห้าม import `next`, `react`, `sequelize`, `pg`, `@google/genai`, `next-auth`
- เวลาเก็บเป็น UTC แต่คิด "วัน" ด้วย `Asia/Bangkok` เสมอ · repo ใช้ Sequelize model ส่วน raw SQL ใช้เฉพาะ aggregate ของ dashboard/ปฏิทิน (`read-repos.ts`)
- Next 16 ใช้ `src/proxy.ts` แทน middleware สำหรับ redirect ไปหน้า login

## การทดสอบ
- `pnpm test` รัน Vitest: unit test ของ domain และ use case (ใช้ in-memory fake) + integration test ของ repo กับ **Postgres จริงใน Docker ผ่าน Testcontainers** (ต้องเปิด Docker ก่อน)
- `scripts/smoke/api.py` และ `scripts/smoke/receipt.py` เป็นสคริปต์ตรวจ end-to-end แบบ **manual** ยิงไปที่ dev server (`http://localhost:3111`) ต้องมีบัญชีทดสอบเอง ไม่ได้รวมใน `pnpm test`
- `scripts/try-receipt.ts` ลองให้ Gemini อ่านรูปใบเสร็จจากไฟล์: `pnpm tsx --env-file=.env.local scripts/try-receipt.ts <รูป>`

## Deploy
- push ขึ้น branch **`develop`** → Vercel deploy ให้ (ตั้ง env ทุกตัวข้างบนใน Vercel)
- **Vercel ไม่รัน migration ให้** ต้องรันเองด้วย `DATABASE_URL=<neon direct url> pnpm db:migrate:prod` ทุกครั้งที่มี migration ใหม่ ควรใช้ connection string แบบ direct (ไม่ใช่ `-pooler`) ของ Neon ส่วนตัวแอปใช้แบบ pooled
- ตั้ง region ของ Vercel function ให้ตรงกับ region ของ Neon

## เอกสาร
- [docs/TOR.md](docs/TOR.md) — requirements, สถานะการทำ, decision log
- [docs/TECH_DESIGN.md](docs/TECH_DESIGN.md) — สถาปัตยกรรม, data model, API, Gemini, deploy
- [docs/DESIGN.md](docs/DESIGN.md) — design language, ฟอนต์, ไอคอน, สิ่งที่ค้นพบตอนทดสอบหน้าจริง
- [docs/UBIQUITOUS_LANGUAGE.md](docs/UBIQUITOUS_LANGUAGE.md) — คลังศัพท์กลาง
