# me-budget — Tech Design (v0.2)

อ้างอิง: [TOR.md](TOR.md) · [UBIQUITOUS_LANGUAGE.md](UBIQUITOUS_LANGUAGE.md) · [DESIGN.md](DESIGN.md)
สถานะ: ⏳ = ยังรอ grill อยู่ · ✅ = ตัดสินใจแล้ว
เวอร์ชันของ library ทุกตัวให้ใช้ stable ล่าสุด แล้วตรวจกับ docs อีกครั้งตอนเริ่ม setup

## 1. Stack
| ชั้น | ตัวเลือก | สถานะ |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript | ✅ (D5) |
| Hosting | Vercel | ✅ (D5) |
| Database | Postgres (Neon ผ่าน Vercel Marketplace) + **Sequelize** | ✅ T1 |
| Auth | **Auth.js** (Credentials: email + password) + **JWT session 90 วัน** ผู้ใช้เดียวเก็บใน env ไม่มีตาราง auth ใน DB | ✅ T2 (แก้ไข: Google → email/password) |
| AI | Google Gemini (Flash รุ่นล่าสุด) ผ่าน `@google/genai` ใช้ structured output (JSON schema) แบบ **free tier** | ✅ T5 |
| Data layer (client) | **TanStack Query** + Next.js Route Handlers (`/api/*`) ใช้ optimistic update ทุกครั้งที่เขียน | ✅ T3 |
| UI | Tailwind CSS + component หลักทำเอง + Radix (ผ่าน shadcn แต่ restyle ใหม่) สำหรับ sheet/dialog/toast/switch + Motion | ✅ T6 |
| ฟอนต์ | `next/font/google` → Mitr + Anuphan | ✅ |
| ไอคอน | **Google Material Symbols (Rounded)** ใช้แทน emoji ทั้งหมดใน UI · เก็บเป็น *ชื่อ icon* (เช่น `restaurant`) ในคอลัมน์ `icon` | ✅ T11 |
| แอปบนมือถือ | PWA แบบ **manifest + ไอคอน + splash เท่านั้น** (`display: standalone`) ไม่มี service worker และไม่มี push | ✅ T8 |

## 1.1 Clean Architecture (ฝั่ง API) ✅ T9
ทุกอย่างอยู่ใน Next.js ตัวเดียว แต่แยกเป็นชั้นชัดเจน และ **dependency ชี้เข้าหาชั้นในเสมอ**

```
            ┌──────────────────────────────────────────────┐
            │ app/api/**  (Interface / Controller)          │  Next.js route handlers
            │   auth() → zod validate → use case → HTTP     │
            └───────────────┬──────────────────────────────┘
                            ▼
            ┌──────────────────────────────────────────────┐
            │ application/  (Use cases + Ports)             │  ไม่รู้จัก Next/Sequelize/Gemini
            └───────────────┬──────────────────────────────┘
                            ▼
            ┌──────────────────────────────────────────────┐
            │ domain/  (Entities, Value objects, กฎ)        │  pure TS → client ใช้ร่วมได้
            └──────────────────────────────────────────────┘
   infrastructure/  ──implements──▶  ports ใน application/
   (Sequelize repos, Gemini parser, SystemClock)
   container.ts  = composition root ที่ new ทุกอย่างแล้วส่งเข้า use case
```

### โครงสร้างโฟลเดอร์
```
src/
  domain/
    money.ts            Money (สตางค์) value object
    entry.ts            Entry, ReceiptLine, Owner, กฎ partner_share
    partner.ts          PartnerBalance, FIFO
    day.ts streak.ts xp.ts allocate.ts
    errors.ts           DomainError (เช่น RepaymentExceedsBalance)
  application/
    ports/              EntryRepo, LoggedDayRepo, XpRepo, OwnerMemoryRepo,
                        CategoryRepo, PresetRepo, SettingsRepo,
                        ReceiptParser, Clock, TransactionRunner, DbHealth
    use-cases/          (ดูรายการด้านล่าง) 1 ไฟล์ = 1 use case
    dto/                input/output ของ use case (ไม่ใช่ Sequelize model)
  infrastructure/
    db/sequelize.ts     instance แบบ cached + pool config
    db/models/          Sequelize models (ใช้ได้เฉพาะในชั้นนี้)
    db/repos/           SequelizeEntryRepo ฯลฯ แปลง model ↔ domain entity
    db/migrations/
    ai/GeminiReceiptParser.ts
    clock/SystemClock.ts
  app/api/**/route.ts   controller
  container.ts
  lib/http.ts           แปลง error → HTTP status, ตัวช่วย zod
```

### Use cases (MVP)
| Use case | ทำอะไร |
|---|---|
| `RecordEntry` | จดรายจ่าย/รายรับ (รวมถึงออกก่อนแฟนและปุ่มลัด) → บันทึก logged_day ถ้าเป็นรายการแรกของวัน → ให้ XP → คืน `{entry, xpGained, streak, leveledUp}` |
| `RecordRepayment` | แฟนจ่ายคืน → ตรวจว่าไม่เกินยอดแฟนติด → ให้โบนัส +20 ถ้ายอดเหลือ 0 |
| `MarkNoSpendDay` | ไม่ได้ใช้เงินวันนี้ (ใช้ได้ถ้าวันนี้ยังไม่ได้จด) |
| `ParseReceipt` | รูป → `ReceiptParser` → ใช้ OwnerMemory ทับค่าที่ AI เดา → คืนร่าง (ไม่บันทึก) |
| `SaveReceiptEntry` | บันทึกรายการ + บรรทัดใบเสร็จ (เฉลี่ยส่วนลด) → upsert OwnerMemory → ให้ XP เหมือน `RecordEntry` |
| `UpdateEntry` / `DeleteEntry` | แก้/ลบ (ไม่ดึง XP หรือ streak คืน) |
| `GetDashboard` | ข้อมูลทุก widget |
| `GetCalendarMonth` | ยอดรายวัน + logged_days |
| `GetPartnerOutstanding` | ยอดค้างตามรายการ (FIFO) |
| `ManageCategories` / `ManagePresets` / `UpdateSettings` | CRUD การตั้งค่า |
| `Wake` | `DbHealth.ping()` |

### กติกาของแต่ละชั้น
- **domain/** ห้าม import อะไรนอกจาก TS ล้วน เพราะถูก bundle ไปใช้ฝั่ง client ด้วย (optimistic)
- **application/** ห้าม import `next`, `sequelize`, `@google/genai` รู้จักโลกภายนอกผ่าน **ports** เท่านั้น
- **infrastructure/** ห้ามส่ง Sequelize model ออกนอกชั้น repo ต้องแปลงเป็น domain entity ทุกครั้ง
- **controller** มีหน้าที่แค่: `auth()` → parse/validate input ด้วย **zod** → เรียก use case → map ผลลัพธ์หรือ error เป็น HTTP ห้ามมี business logic
- บังคับกติกาพวกนี้ด้วย **`eslint-plugin-boundaries`** (ทำให้ CI fail ถ้ามีใครข้ามชั้น)

### Transaction
- port `TransactionRunner.run(async (repos) => { ... })` ให้ทุก repo ใน callback ใช้ transaction เดียวกัน
- ฝั่ง infrastructure ใช้ `sequelize.transaction()` แบบ managed แล้วสร้าง repo ที่ผูกกับ `transaction` นั้นส่งเข้าไป
- use case ที่เขียนหลายตาราง (`RecordEntry`, `RecordRepayment`, `SaveReceiptEntry`) ต้องอยู่ใน transaction เสมอ เพื่อไม่ให้ entry, logged_day และ xp_event หลุดกัน

### Dependency injection
- **ต่อเองใน `container.ts`** ไม่ใช้ DI container library (เช่น tsyringe/inversify) เพราะมีของไม่กี่ตัว ต่อเองอ่านง่ายกว่า และไม่ต้องพึ่ง decorator/reflect-metadata
- `Clock` ถูก inject เข้าไปทุกที่ที่ต้องรู้ว่า "วันนี้คือวันไหน" → เทสเรื่องเที่ยงคืนได้โดยไม่ต้อง mock `Date`

### Error
- `DomainError` / `ValidationError` → 400/422 · `NotFound` → 404 · ไม่ได้ login → 401 · `RateLimited` / quota ของ AI → 429 · อย่างอื่น → 500 (log ไว้ แต่ไม่ส่งรายละเอียดให้ client)
- รูปแบบ body: `{ error: { code, message } }` ใช้ `code` คงที่ เช่น `REPAYMENT_EXCEEDS_BALANCE` ให้ client เอาไปแสดงข้อความภาษาไทยเอง

### การเทสตามชั้น
| ชั้น | เทสยังไง |
|---|---|
| domain | Vitest unit test เร็วมาก ไม่มี I/O |
| application | Vitest + **in-memory fake** ของทุก port (FakeEntryRepo, FixedClock, FakeReceiptParser) |
| infrastructure | integration test กับ **Postgres ใน Docker** ผ่าน Testcontainers ทุก test suite ได้ DB ใหม่สะอาด รัน migrations จริงก่อนเทส (T10) |
| controller | ทดสอบบางๆ ว่า validate และ map error ถูกต้อง |

## 2. หลักการข้อมูล (ไม่ขึ้นกับ DB ที่เลือก)
- **เงินเก็บเป็นจำนวนเต็มหน่วยสตางค์** (`integer`) ห้ามใช้ float เด็ดขาด เช่น ฿84.50 → `8450`
- **เวลาเก็บเป็น UTC** แล้วคิด "วัน" ด้วย timezone `Asia/Bangkok` ทุกครั้ง ทั้ง streak, ปฏิทิน และสรุป
- **ค่าที่คำนวณได้จะไม่เก็บซ้ำ** ได้แก่ ยอดแฟนติด, ยอดค้างตามรายการ (FIFO), Level และยอดของแต่ละวันในปฏิทิน ทั้งหมดคิดจากตารางหลักทุกครั้ง (ข้อมูลของคนคนเดียวมีไม่เยอะ query สดได้สบาย)
- **XP เก็บเป็น ledger** (`xp_events`) แบบบันทึกเพิ่มอย่างเดียว ไม่ลบ ตรงกับกฎ "XP ไม่มีวันลดลง"

## 3. Data model (ร่าง)
```
categories     id, name, icon, kind(expense|income), sort, archived
entries        id, kind(expense|income|repayment),
               occurred_at, created_at,
               total            -- สตางค์ เงินที่ออก/เข้ากระเป๋าจริง
               partner_share    -- สตางค์ (เฉพาะ expense, ค่าเริ่มต้น 0)
               category_id?     -- null ถ้ามาจากใบเสร็จที่มีหลายหมวด
               note?, merchant?, source(manual|preset|receipt|wheel)
receipt_lines  id, entry_id, raw_name, canonical_name, qty,
               price            -- สตางค์ หลังเฉลี่ยส่วนลดและ VAT แล้ว
               owner(me|partner|split), category_id, low_confidence
owner_memory   canonical_name (PK), owner, updated_at
presets        id, label, icon, amount, category_id, partner_mode?, sort
logged_days    day (date, PK), kind(entry|no_spend), first_logged_at
xp_events      id, created_at, reason, amount
settings       (1 แถว) partner_note, dashboard_layout (jsonb), ...
```
- `myShare = total - partner_share` เป็นค่าคำนวณ ไม่ได้เก็บไว้
- ยอดแฟนติด = Σ `partner_share` (expense) − Σ `total` (repayment) และระบบต้องตรวจว่ายอดนี้ ≥ 0 ก่อนบันทึก repayment
- `logged_days` บันทึกตอน**กดจดครั้งแรกของวัน** (ใช้ `created_at` ตามเวลาไทย) ส่วน streak คำนวณจากวันที่ต่อเนื่องในตารางนี้
- ไม่มีตาราง `users` หรือตาราง auth ใดๆ เพราะมีผู้ใช้คนเดียว และ Auth.js ใช้ JWT session เก็บใน cookie

## 4. Flow สำคัญ
### สแกนใบเสร็จ
```
มือถือ: ถ่ายรูป → ย่อรูปฝั่ง client (ด้านยาวประมาณ 1600px, JPEG) ให้ไฟล์ < 4.5MB ตามลิมิตของ Vercel
  → POST /api/receipt/parse (ต้อง login แล้ว + rate limit)
server: ส่งรูป + partner_note + รายการ canonical_name ที่มีใน owner_memory → Gemini
  → ได้ JSON ตาม schema → ใช้ owner_memory ทับค่าที่ AI เดา → ส่งกลับให้ client
  (ไม่เก็บรูปไว้ที่ไหนเลย)
client: หน้าตรวจ/แก้ → กดบันทึก → POST /api/entries (พร้อม lines) สร้าง entry + receipt_lines
  และ upsert owner_memory ของทุกบรรทัดที่ผู้ใช้แก้เจ้าของ
```

### Auth guard
- **ผู้ใช้เดียวอยู่ใน env:** `AUTH_EMAIL` + `AUTH_PASSWORD_HASH` ตรวจใน `authorize()` ของ Credentials provider ถ้าอีเมลหรือรหัสไม่ตรงให้ตอบข้อความเดียวกันเสมอ (ไม่บอกว่าผิดที่ไหน)
- **Hash รหัสผ่านด้วย `scrypt` ของ `node:crypto`** (ไม่ต้องลง dependency เพิ่ม) เทียบด้วย `timingSafeEqual` และมีสคริปต์สร้าง hash ไว้ให้ใส่ใน env
- **กัน brute force:** จำกัดความพยายามล็อกอินผิดต่อ IP/อีเมล (เช่น 5 ครั้งต่อ 15 นาที) ซึ่งนี่เป็นจุดที่ต้องเก็บสถานะ จะใช้ตาราง `login_attempts` เล็กๆ ใน DB
- Auth.js แบบ Credentials ใช้ได้เฉพาะ JWT session (ตรงกับที่ตั้งไว้) และให้ cookie เป็น `httpOnly` + `secure` + `sameSite=lax`
- รหัสผ่านต้องยาวและเดายาก เพราะแอปนี้เปิดสู่อินเทอร์เน็ตและมีข้อมูลการเงิน (แนะนำ ≥ 16 ตัวอักษร หรือ passphrase)
- ทุก route, server action และ `/api/receipt/parse` ต้องเรียก `auth()` แล้วเช็ก session ก่อนทำงานเสมอ จะพึ่ง middleware อย่างเดียวไม่ได้
- middleware ใช้แค่ redirect ไปหน้า login (ต้องไม่แตะ DB เพราะอาจรันบน Edge)

### Wake (ลด cold start) ✅ T4
- `GET /api/wake` → เช็ก session แล้วรัน `SELECT 1` ผ่าน Sequelize ตอบ `204` ทำงานบน Node runtime ใน region เดียวกับ DB
- client ยิง wake ใน 3 จังหวะ ทั้งหมดเป็น fire-and-forget ไม่ await:
  1. ตอน app mount
  2. ตอน `visibilitychange` → `visible` (สลับกลับมาที่แอปหรือ PWA)
  3. ตอน `pointerdown` บนปุ่ม [+] หรือปุ่มลัด
- throttle ไม่ให้ยิงถี่เกิน 1 ครั้งต่อ 60 วินาที (จำเวลาที่ยิงล่าสุดไว้ใน memory)
- ไม่มี cron หรือ keep-alive ภายนอก → ไม่กิน compute hours ของ Neon ตอนที่ไม่ได้ใช้
- **ตั้ง region ของ Vercel function ให้ตรงกับ region ของ Neon** (เช่น Singapore ทั้งคู่) เพื่อลด latency ทุก query

### API (ร่าง)
| Method | Path | ใช้ทำอะไร |
|---|---|---|
| GET | `/api/wake` | ปลุก function + DB (ดูหัวข้อ Wake) |
| GET | `/api/dashboard` | ข้อมูลทุก widget ใน request เดียว: streak, XP/Level, ยอดแฟนติด, วันนี้, รายการล่าสุด, เลย์เอาต์ |
| GET | `/api/calendar?month=2026-10` | ยอดจ่าย/รับรายวัน + logged_days ของเดือน |
| GET/POST/PATCH/DELETE | `/api/entries` | รายการ (รวมถึง repayment และรายการจากใบเสร็จพร้อม lines) |
| POST | `/api/no-spend` | วันนี้ไม่ได้ใช้เงิน |
| POST | `/api/receipt/parse` | รูป → JSON (ไม่บันทึกอะไรลง DB) |
| CRUD | `/api/categories`, `/api/presets`, `/api/settings` | ตั้งค่าต่างๆ |
- POST ที่เป็นการจด จะตอบกลับพร้อม `{ entry, xpGained, streak, leveledUp }` → client เอาไปแสดงเอฟเฟกต์ได้เลยโดยไม่ต้อง refetch
- **Optimistic:** ใช้ `onMutate` อัปเดต cache ของ dashboard/รายการทันที แล้วคำนวณ +XP แบบคร่าวๆ ฝั่ง client ไปก่อน พอ server ตอบมาค่อยแก้ให้ตรง ถ้า error ให้ rollback และขึ้น toast
- **เปิดแอปแล้วเห็นข้อมูลทันที:** เก็บ cache ของ TanStack Query ไว้ใน localStorage (persist) → เปิดแอปมาเห็นข้อมูลล่าสุดก่อน แล้วค่อย refetch อยู่เบื้องหลัง

### Gemini (free tier) ✅ T5
- **รับรู้ความเสี่ยงแล้ว:** บน free tier Google อาจนำรูปใบเสร็จและ prompt (รวมถึงโน้ตเกี่ยวกับแฟน) ไปใช้ปรับปรุงผลิตภัณฑ์ → **ห้ามใส่ข้อมูลอ่อนไหวลงในโน้ตเกี่ยวกับแฟน** เช่น ชื่อจริงหรือเรื่องสุขภาพ และให้ขึ้นคำเตือนเล็กๆ ใต้ช่องโน้ตในหน้าตั้งค่า
- **ถ้าโดน 429/quota หมด:** ขึ้นข้อความ "AI พักก่อน ลองใหม่อีกที หรือกรอกยอดรวมเองไปก่อน" แล้วเข้า flow จดมือ (ตาม Fallback ใน FR-10)
- rate limit ในแอปเองไว้ที่วันละ 20 ใบ จะได้ไม่ไปชน quota ของ free tier ตอนที่มีบั๊กยิงวนลูป
- ถ้าวันหนึ่งอยากเปลี่ยนเป็น paid → แค่เปลี่ยน API key (ผูก billing) ไม่ต้องแก้โค้ด
- `GEMINI_API_KEY` อยู่ใน env ฝั่ง server เท่านั้น

### Domain logic (T7)
อยู่ใน `src/domain/` เป็น pure function ทั้งหมด ไม่ import Sequelize หรือ React ฝั่ง API กับฝั่ง client (ตอน optimistic) ใช้โค้ดชุดเดียวกัน:
- `money.ts`: แปลงสตางค์ ↔ ข้อความ และย่อเป็น `k` สำหรับปฏิทิน
- `split.ts`: คิด partner_share จากโหมดหาร/แฟนทั้งหมด/กรอกเอง และสรุปเจ้าของจากบรรทัดใบเสร็จ (หาร = แบ่งครึ่ง สตางค์ที่เศษให้นับเป็นของเรา)
- `allocate.ts`: เฉลี่ยส่วนลด/VAT ระดับบิลตามสัดส่วนราคา (ผลรวมต้องตรงกับยอดบิลทุกสตางค์ เศษไปลงบรรทัดที่ราคาสูงที่สุด)
- `partner.ts`: ยอดแฟนติด และยอดค้างตามรายการแบบ FIFO
- `day.ts`: แปลง timestamp → วันตามเวลาไทย
- `streak.ts`: คำนวณ streak จาก logged_days
- `xp.ts`: XP ของการกระทำแต่ละอย่าง (ตัวคูณ + เพดานต่อวัน) และ Level จาก XP รวม
- **Vitest** ครอบทุกไฟล์ข้างบน โดยเฉพาะ acceptance scenarios ใน TOR ที่เป็นเรื่องตัวเลข เช่น ข้าว 100 หาร → -50, แฟนคืน 30 → เหลือ 20, ตัวคูณ XP และ streak ข้ามเที่ยงคืน

### สภาพแวดล้อม (T10)
| env | DB | หมายเหตุ |
|---|---|---|
| test | Postgres (Docker, Testcontainers) | ใช้เวอร์ชันเดียวกับ Neon และรัน migrations ก่อนเทส |
| dev (ในเครื่อง) | Postgres (`docker compose up`) | มี seed หมวดตั้งต้น + ข้อมูลตัวอย่าง |
| production | Neon (pooled) | migrate ผ่าน connection แบบ direct ใน step deploy |
- ต้องมี Docker Desktop หรือ OrbStack บนเครื่อง

### Tooling
- **package manager: pnpm** (ห้ามใช้ npm/yarn) · `pnpm test`, `pnpm typecheck`, `pnpm lint`
- Next.js 16: `middleware` ถูกเปลี่ยนชื่อเป็น **`proxy`** (รัน Node runtime เป็นค่าเริ่มต้น) → ใช้ `src/proxy.ts` สำหรับ redirect ไปหน้า login
- `uuid` เวอร์ชันเก่าที่ Sequelize v6 ดึงมามี advisory ระดับ moderate (กระทบเฉพาะตอนส่ง buffer ซึ่ง Sequelize ไม่ได้ทำ) → รับความเสี่ยงไว้ ไม่ใช้ `--force`

## 5. ข้อจำกัดที่รู้แล้ว
- **Haptic บน iPhone:** Safari ไม่รองรับ `navigator.vibrate` ทำให้วงล้อสั่นได้เฉพาะบน Android ส่วน iOS ต้องใช้แค่ animation กับเสียงแทน
- Vercel function รับ body ได้สูงสุดประมาณ 4.5MB → ต้องย่อรูปก่อนส่งทุกครั้ง

## 6. Tech decisions
| # | เรื่อง | ตัดสินใจ | ใครเลือก |
|---|---|---|---|
| T1 | Database / ORM | Neon Postgres + Sequelize (เคยพิจารณา Supabase แต่ตัดสินใจกลับมาใช้ Neon) | เพื่อน |
| T2 | Auth | Auth.js Credentials (email + password) ผู้ใช้เดียวจาก env (`AUTH_EMAIL`, `AUTH_PASSWORD_HASH`) + JWT `maxAge` 90 วัน เดิมเลือก Google แต่เปลี่ยนเป็น email/password "ไปก่อน" | เพื่อน |
| T3 | Data flow | Client-side: TanStack Query + API routes | เพื่อน |
| T4 | Cold start | ปลุกตามจังหวะการใช้งาน (เปิดแอป / กลับมาที่แอป / แตะ [+]) ไม่ใช้ cron | เพื่อน |
| T5 | Gemini tier | Free tier (ยอมรับว่า Google อาจนำข้อมูลไปใช้ปรับปรุงผลิตภัณฑ์) | เพื่อน |
| T6 | UI | ทำเอง: ปุ่ม 3D, ชิป, การ์ด, แป้นตัวเลข, วงล้อ, ปฏิทิน · Radix: sheet, dialog, toast, switch · Motion: animation และ `Reorder` widget | เพื่อน |
| T7 | Domain logic + tests | แยก logic เป็น pure TS ใน `src/domain/` (ไม่แตะ DB/React) แล้วเทสด้วย Vitest | Claude |
| T8 | PWA | manifest + ไอคอน + splash ไม่มี service worker (คิวจด offline ย้ายไป backlog) | เพื่อน |
| T9 | Architecture | Clean Architecture ใน Next.js ตัวเดียว (domain / application / infrastructure / controller) ต่อ DI เองใน container.ts + boundaries lint | เพื่อน (รายละเอียด DI/transaction: Claude) |
| T10 | Test/dev DB | Postgres ใน Docker: Testcontainers สำหรับ integration test + docker-compose สำหรับ dev ในเครื่อง ส่วน Neon ใช้เฉพาะ production | เพื่อน |
| T11 | ไอคอน | Material Symbols Rounded แทน emoji ทั้งหมด (หมวด, ปุ่มลัด, วงล้อ, widget) | เพื่อน |

### ข้อควรระวังของ T1 (Sequelize บน Vercel serverless)
- **ใช้เวอร์ชัน stable (v6)** ส่วน v7 (`@sequelize/core`) ตรวจสถานะตอนเริ่ม setup ถ้ายังไม่ stable ก็ใช้ v6 ไปก่อน
- **ใช้ Node.js runtime เท่านั้น** เพราะ Sequelize รันบน Edge runtime ไม่ได้ ดังนั้น route/middleware ที่ต้องแตะ DB ต้องไม่อยู่บน Edge
- **Connection:** ใช้ connection string แบบ **pooled** ของ Neon (`-pooler`) ตั้ง `pool.max` ให้ต่ำ (1–2) และสร้าง Sequelize instance ครั้งเดียวต่อ function instance (cache ไว้บน `globalThis`) จะได้ไม่เปิด connection ใหม่ทุก request
- **Types:** ใช้ `InferAttributes` / `InferCreationAttributes` ของ v6 ประกาศ model ให้มี type ครบ
- **Migrations:** ใช้ `sequelize-cli` (หรือ Umzug) **ห้ามใช้ `sync({ alter: true })` บน production**
- **เวลา:** ตั้ง `timezone: '+00:00'` ให้ Sequelize เก็บเป็น UTC แล้วไปแปลงเป็น Asia/Bangkok ใน query หรือฝั่งแอปเอง
- **สตางค์:** คอลัมน์เงินใช้ `DataTypes.INTEGER` (ถ้ากลัวล้นใช้ `BIGINT` ซึ่ง pg จะคืนค่าเป็น string ต้องแปลงเอง)
