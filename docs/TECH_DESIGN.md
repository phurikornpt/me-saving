# me-budget — Tech Design (v0.3)

อ้างอิง: [TOR.md](TOR.md) · [UBIQUITOUS_LANGUAGE.md](UBIQUITOUS_LANGUAGE.md) · [DESIGN.md](DESIGN.md)
สถานะ: ⏳ = ยังรอ grill อยู่ · ✅ = ตัดสินใจแล้ว
เวอร์ชันของ library ทุกตัวให้ใช้ stable ล่าสุด แล้วตรวจกับ docs อีกครั้งตอนเริ่ม setup
เอกสารนี้ปรับให้ตรงกับโค้ดที่ทำไปแล้ว (v0.3) ส่วนที่ยังไม่ได้ทำจะระบุไว้ว่า "ยังไม่ทำ"

## 1. Stack
| ชั้น | ตัวเลือก | สถานะ |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript | ✅ (D5) |
| Hosting | Vercel | ✅ (D5) |
| Database | Postgres (Neon ผ่าน Vercel Marketplace) + **Sequelize** | ✅ T1 |
| Auth | **Auth.js** (Credentials: email + password) + **JWT session 90 วัน** ผู้ใช้เดียวเก็บใน env ไม่มีตาราง auth ใน DB | ✅ T2 (แก้ไข: Google → email/password) |
| AI | Google Gemini ผ่าน `@google/genai` รุ่นเริ่มต้น **`gemini-3.5-flash-lite`** (เปลี่ยนได้ด้วย env `GEMINI_MODEL`) ใช้ structured output โดย zod schema เป็น response contract (`responseJsonSchema`) แบบ **free tier** | ✅ T5 |
| Data layer (client) | **TanStack Query** + Next.js Route Handlers (`/api/*`) ใช้ optimistic update ทุกครั้งที่เขียน | ✅ T3 |
| UI | Tailwind CSS v4 + component ทำเองเกือบทั้งหมด (ปุ่ม 3D, ชิป, แป้นตัวเลข, วงล้อ, ปฏิทิน, toast, สวิตช์) + `@radix-ui/react-dialog` สำหรับ bottom sheet เพียงตัวเดียว + Motion (`motion/react`: วงล้อ, `Reorder` ของ widget) | ✅ T6 |
| ฟอนต์ | `next/font/google` → **Mitr** (500/600) ใช้กับ **หัวข้อภาษาไทยเท่านั้น** (class `font-display`) และ **Anuphan** ใช้กับเนื้อหา UI และ **ตัวเลขทุกที่ด้วยตัวหนา (bold)** เพราะเลข 0 ของ Mitr มีขีดเฉียง | ✅ |
| ไอคอน | **Google Material Symbols (Rounded)** ใช้แทน emoji ทั้งหมดใน UI · เก็บเป็น *ชื่อ icon* (เช่น `restaurant`) ในคอลัมน์ `icon` · โหลดแบบ **subset** ผ่านลิงก์ Google Fonts ที่ประกอบจากรายชื่อใน `src/client/icons.ts` (`iconFontUrl()`, พารามิเตอร์ `icon_names`) ถ้าจะใช้ icon ใหม่ต้องเพิ่มชื่อในลิสต์นั้นก่อน (ชื่อที่ไม่อยู่ในลิสต์ `<Icon>` จะ fallback เป็น `more_horiz`) | ✅ T11 |
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

### โครงสร้างโฟลเดอร์ (ตามโค้ดจริง)
```
src/
  domain/               pure TS (ไม่มี I/O) ใช้ร่วมกับ client ได้
    money.ts            Money (สตางค์) + จัดรูปแบบ/parse ข้อความ
    split.ts            Owner, SplitMode, partnerShareFor, สรุปเจ้าของจากบรรทัดใบเสร็จ
    allocate.ts         เฉลี่ยส่วนลด/VAT ลงบรรทัดใบเสร็จ
    partner.ts          ยอดแฟนติด + ยอดค้างตามรายการ (FIFO) + กฎ repayment
    day.ts              timestamp → วันตามเวลาไทย, ช่วงของวัน/เดือน
    streak.ts xp.ts     streak และ XP/Level
    dashboard-layout.ts WIDGET_IDS, DEFAULT_LAYOUT, normalizeLayout
    errors.ts           DomainError + DomainErrorCode
  application/
    ports/index.ts      ports ทั้งหมดอยู่ไฟล์เดียว (EntryRepo, LoggedDayRepo, XpRepo,
                        ReceiptLineRepo, OwnerMemoryRepo, Repos, ReceiptParser, StatsRepo,
                        CategoryRepo, PresetRepo, SettingsRepo, TransactionRunner,
                        LoginAttemptRepo, CredentialVerifier, Clock)
    use-cases/          1 ไฟล์ต่อ use case (บางไฟล์รวมกลุ่มที่เกี่ยวกัน) + *.test.ts
    log-activity.ts     logic กลาง "กดจด" → logged_day + XP + streak (ใช้ร่วมหลาย use case)
    testing/fakes.ts    in-memory fake ของ ports + FixedClock
  infrastructure/
    db/sequelize.ts     instance แบบ cached บน globalThis + pool config
    db/models/index.ts  Sequelize models ทั้งหมด (ใช้ได้เฉพาะในชั้นนี้)
    db/repos/index.ts   repo หลัก (entries, logged_days, xp, receipt_lines, owner_memory) + TransactionRunner
    db/repos/read-repos.ts  StatsRepo (raw SQL) + repo ของ category/preset/settings
    db/repos/login-attempt-repo.ts
    db/migrate.ts + db/migrations/   Umzug (001-initial, 002-seed-categories)
    ai/GeminiReceiptParser.ts
    security/           password.ts (scrypt), env-credential-verifier.ts
    clock/SystemClock.ts
  app/                  หน้า (/, /new, /repay, /scan, /settings, /login), manifest.ts และ api/**
  proxy.ts              Next 16 proxy (เดิมคือ middleware) redirect ไป /login
  lib/                  auth.ts, auth.config.ts, container.ts (composition root),
                        http.ts (api() wrapper + แปลง error → HTTP), schemas.ts (zod)
  components/ client/   ฝั่ง UI: React components, TanStack Query, api client, util
scripts/                migrate.ts, hash-password.ts, try-receipt.ts, smoke/*.py
```

### Use cases (ตามโค้ดจริง — ทำครบแล้ว)
| Use case | ทำอะไร |
|---|---|
| `AuthenticateUser` | ตรวจ email + password เทียบกับ env พร้อมนับครั้งที่ล็อกอินผิด (ต่ออีเมลและต่อ IP) |
| `RecordEntry` | จดรายจ่าย/รายรับ (รวมถึงออกก่อนแฟนและปุ่มลัด) → บันทึก logged_day ถ้าเป็นรายการแรกของวัน → ให้ XP → คืน `{entry, xpGained, streak, leveledUp}` |
| `RecordRepayment` | แฟนจ่ายคืน → ตรวจว่าไม่เกินยอดแฟนติด → ให้โบนัส +20 ถ้ายอดเหลือ 0 |
| `MarkNoSpendDay` | ไม่ได้ใช้เงินวันนี้ (ใช้ได้ถ้าวันนี้ยังไม่ได้จด) |
| `ParseReceipt` | รูป → `ReceiptParser` → ใช้ OwnerMemory ทับค่าที่ AI เดา → คืนร่าง (ไม่บันทึก) ตรวจ mime/ขนาดรูป และงบ 20 ครั้ง/24 ชม. |
| `SaveReceiptEntry` | บันทึกรายการ + บรรทัดใบเสร็จ (เฉลี่ยส่วนลด) → upsert OwnerMemory → ให้ XP เหมือน `RecordEntry` |
| `UpdateEntry` / `DeleteEntry` | แก้/ลบ (ไม่ดึง XP หรือ streak คืน) รายการจากใบเสร็จแก้ยอด/ส่วนแบ่งไม่ได้ (`ENTRY_LOCKED`) และห้ามทำให้ยอดแฟนติดติดลบ |
| `ListEntries` | รายการล่าสุด หรือรายการของวันที่ระบุ (`day`, `limit` ไม่เกิน 100) |
| `GetDashboard` | ข้อมูลทุก widget (streak, level, ยอดแฟนติด, ยอดวันนี้, 5 รายการล่าสุด, ปุ่มลัด, layout, partnerNote) |
| `GetCalendarMonth` | ยอดรายวัน + วิธีที่จดของแต่ละวัน + ยอดรวมเดือน + `maxSpent` สำหรับ heatmap |
| `GetPartnerOutstanding` | ยอดค้างตามรายการ (FIFO) |
| `ManageCategories` / `ManagePresets` / `ManageSettings` | CRUD การตั้งค่า (หมวดใช้ archive ไม่ลบจริง) |

ไม่มี use case `Wake` และไม่มี `dto/` แยก: route `/api/wake` รัน `SELECT 1` ผ่าน `container().sequelize` ตรงๆ และ use case คืนค่าเป็น type ของตัวเอง

### กติกาของแต่ละชั้น
- **domain/** ห้าม import อะไรนอกจาก TS ล้วน เพราะถูก bundle ไปใช้ฝั่ง client ด้วย (optimistic)
- **application/** ห้าม import `next`, `sequelize`, `@google/genai` รู้จักโลกภายนอกผ่าน **ports** เท่านั้น
- **infrastructure/** ห้ามส่ง Sequelize model ออกนอกชั้น repo ต้องแปลงเป็น record/domain entity ทุกครั้ง repo ใช้ **Sequelize model** (`db/models`) เป็นหลัก ส่วน **raw SQL ใช้เฉพาะ aggregate ของ dashboard/ปฏิทิน** ใน `read-repos.ts` (จัดกลุ่มตามวันเวลาไทยพร้อม conditional sum) และไฟล์ migration
- **controller** มีหน้าที่แค่: `auth()` → parse/validate input ด้วย **zod** (`src/lib/schemas.ts`) → เรียก use case → map ผลลัพธ์หรือ error เป็น HTTP ห้ามมี business logic ทุก route ห่อด้วย `api()` ใน `src/lib/http.ts` ซึ่งเช็ก session ก่อนเสมอ
- บังคับกติกาด้วย **`eslint-plugin-boundaries`** ใน `eslint.config.mjs` (`pnpm lint` ล้มถ้ามีใครข้ามชั้น) ชนิดของชั้น: `domain` / `application` / `infrastructure` / `ui` (`src/components`, `src/client`) / `interface` (`src/app`, `src/lib`) ทิศที่ห้าม: domain ห้ามพึ่งชั้นอื่นเลย · application ห้ามพึ่ง infrastructure/interface/ui · infrastructure ห้ามพึ่ง interface/ui · **ui ห้ามพึ่ง application/infrastructure/interface (แตะได้เฉพาะ domain)**
- นอกจากนี้ `domain/` และ `application/` ถูกห้าม import `next`, `react`, `react-dom`, `sequelize`, `pg`, `@google/genai`, `next-auth` ด้วยกฎ `no-restricted-imports`

### Transaction
- port `TransactionRunner.run(async (repos) => { ... })` ให้ทุก repo ใน callback ใช้ transaction เดียวกัน
- ฝั่ง infrastructure ใช้ `sequelize.transaction()` แบบ managed แล้วสร้าง repo ที่ผูกกับ `transaction` นั้นส่งเข้าไป
- use case ที่เขียนหลายตาราง (`RecordEntry`, `RecordRepayment`, `SaveReceiptEntry`) ต้องอยู่ใน transaction เสมอ เพื่อไม่ให้ entry, logged_day และ xp_event หลุดกัน

### Dependency injection
- **ต่อเองใน `container.ts`** ไม่ใช้ DI container library (เช่น tsyringe/inversify) เพราะมีของไม่กี่ตัว ต่อเองอ่านง่ายกว่า และไม่ต้องพึ่ง decorator/reflect-metadata
- `Clock` ถูก inject เข้าไปทุกที่ที่ต้องรู้ว่า "วันนี้คือวันไหน" → เทสเรื่องเที่ยงคืนได้โดยไม่ต้อง mock `Date`
- `container()` สร้างครั้งเดียวต่อ function instance (cache บน `globalThis`) และ `parseReceipt` สร้างแบบ lazy เพื่อไม่ต้องมี `GEMINI_API_KEY` จนกว่าจะมีการสแกน

### Error
- ไม่ได้ login → 401 `UNAUTHORIZED` · zod/JSON ผิด → 400 `BAD_REQUEST` · อย่างอื่น → 500 `INTERNAL` (log ไว้ แต่ไม่ส่งรายละเอียดให้ client)
- `DomainError` แมปเป็น HTTP ใน `src/lib/http.ts`: `INVALID_AMOUNT`/`INVALID_SPLIT`/`INVALID_RECEIPT`/`RECEIPT_TOTAL_MISMATCH` → 422 · `REPAYMENT_EXCEEDS_BALANCE`/`BALANCE_WOULD_GO_NEGATIVE`/`ENTRY_LOCKED`/`NO_SPEND_ALREADY_LOGGED` → 409 · `NOT_FOUND` → 404 · `RATE_LIMITED` (สแกนครบโควตา) → 429 · `AI_UNAVAILABLE` (Gemini ล้ม/ตอบมาอ่านไม่ได้ รวมถึงโดน 429 จาก Google) → 503
- รูปแบบ body: `{ error: { code, message } }` ใช้ `code` คงที่ เช่น `REPAYMENT_EXCEEDS_BALANCE` ให้ client เอาไปแสดงข้อความภาษาไทยเอง

### การเทสตามชั้น
| ชั้น | เทสยังไง |
|---|---|
| domain | Vitest unit test เร็วมาก ไม่มี I/O |
| application | Vitest + **in-memory fake** ของทุก port (FakeEntryRepo, FixedClock, FakeReceiptParser) |
| infrastructure | integration test (`repos.integration.test.ts`) กับ **Postgres 17 ใน Docker** ผ่าน Testcontainers (`@testcontainers/postgresql`) รัน migrations จริงก่อนเทส **ต้องเปิด Docker ก่อนรัน `pnpm test`** (T10) + `GeminiReceiptParser.test.ts` และ `password.test.ts` |
| controller | ไม่มีเทสแยก ใช้ `scripts/smoke/*.py` ยิงเข้า dev server จริงเป็นการตรวจมือแทน |
| UI (บางส่วน) | Vitest ของ logic ล้วน เช่น `Keypad.test.ts`, `ModeWheel.test.ts`, `receiptMath.test.ts` (ไม่มี component test) |

## 2. หลักการข้อมูล (ไม่ขึ้นกับ DB ที่เลือก)
- **เงินเก็บเป็นจำนวนเต็มหน่วยสตางค์** (`integer`) ห้ามใช้ float เด็ดขาด เช่น ฿84.50 → `8450`
- **เวลาเก็บเป็น UTC** แล้วคิด "วัน" ด้วย timezone `Asia/Bangkok` ทุกครั้ง ทั้ง streak, ปฏิทิน และสรุป
- **ค่าที่คำนวณได้จะไม่เก็บซ้ำ** ได้แก่ ยอดแฟนติด, ยอดค้างตามรายการ (FIFO), Level และยอดของแต่ละวันในปฏิทิน ทั้งหมดคิดจากตารางหลักทุกครั้ง (ข้อมูลของคนคนเดียวมีไม่เยอะ query สดได้สบาย)
- **XP เก็บเป็น ledger** (`xp_events`) แบบบันทึกเพิ่มอย่างเดียว ไม่ลบ ตรงกับกฎ "XP ไม่มีวันลดลง"

## 3. Data model (ตาม migration `001-initial`)
```
categories     id, name, icon, kind(expense|income), sort, archived
entries        id, kind(expense|income|repayment),
               occurred_at, created_at,
               total            -- สตางค์ เงินที่ออก/เข้ากระเป๋าจริง
               partner_share    -- สตางค์ (เฉพาะ expense, ค่าเริ่มต้น 0)
               category_id?     -- null ถ้ามาจากใบเสร็จที่มีหลายหมวด
               note?, merchant?, source(manual|preset|receipt|wheel)
receipt_lines  id, entry_id (ON DELETE CASCADE), position, raw_name, canonical_name, qty,
               price            -- สตางค์ หลังเฉลี่ยส่วนลดและ VAT แล้ว
               owner(me|partner|split), category_id, low_confidence
owner_memory   canonical_name (PK), owner, updated_at
presets        id, label, icon, amount, category_id?, partner_mode?(split|partnerAll), sort
logged_days    day (date, PK), kind(entry|no_spend), first_logged_at
xp_events      id, created_at, reason, amount
settings       (1 แถว, id=1) partner_note, dashboard_layout (jsonb: [{id, enabled}] ตามลำดับ)
login_attempts id, key (`email:..`/`ip:..`/`receipt-parse`), attempted_at
schema_migrations name (PK)  -- สร้างโดย Umzug storage ใน migrate.ts
```
- ข้อจำกัดในฐานข้อมูล: `total > 0`, `0 ≤ partner_share ≤ total`, `partner_share = 0` ถ้าไม่ใช่ expense, `kind`/`owner`/`source` เป็นค่าใน CHECK, `xp_events.amount > 0`
- `myShare = total - partner_share` เป็นค่าคำนวณ ไม่ได้เก็บไว้
- ยอดแฟนติด = Σ `partner_share` (expense) − Σ `total` (repayment) และระบบต้องตรวจว่ายอดนี้ ≥ 0 ก่อนบันทึก repayment
- `logged_days` บันทึกตอน**กดจดครั้งแรกของวัน** (ใช้ `created_at` ตามเวลาไทย) ส่วน streak คำนวณจากวันที่ต่อเนื่องในตารางนี้
- ไม่มีตาราง `users` หรือตาราง auth ใดๆ เพราะมีผู้ใช้คนเดียว และ Auth.js ใช้ JWT session เก็บใน cookie

## 4. Flow สำคัญ
### สแกนใบเสร็จ
```
มือถือ: ถ่ายรูป → ย่อรูปฝั่ง client (ด้านยาวประมาณ 1600px, JPEG) ให้ไฟล์ < 4.5MB ตามลิมิตของ Vercel
  → POST /api/receipt/parse (multipart field `image`, ต้อง login แล้ว + งบ 20 ครั้ง/24 ชม.)
server: ส่งรูป + partner_note + รายการ canonical_name ที่มีใน owner_memory → Gemini
  → ได้ JSON ตาม schema → ใช้ owner_memory ทับค่าที่ AI เดา → ส่งกลับให้ client
  (ไม่เก็บรูปไว้ที่ไหนเลย)
client: หน้าตรวจ/แก้ → กดบันทึก → POST /api/receipts (พร้อม lines) สร้าง entry + receipt_lines
  และ upsert owner_memory ของทุกบรรทัดที่ผู้ใช้แก้เจ้าของ
```

### Auth guard
- **ผู้ใช้เดียวอยู่ใน env:** `AUTH_EMAIL` + `AUTH_PASSWORD_HASH` ตรวจใน `authorize()` ของ Credentials provider ถ้าอีเมลหรือรหัสไม่ตรงให้ตอบข้อความเดียวกันเสมอ (ไม่บอกว่าผิดที่ไหน)
- **Hash รหัสผ่านด้วย `scrypt` ของ `node:crypto`** (ไม่ต้องลง dependency เพิ่ม) เทียบด้วย `timingSafeEqual` รูปแบบ `scrypt:<N>:<r>:<p>:<salt>:<hash>` (base64url) ค่าเริ่มต้น N=2^15, r=8, p=3 ซึ่ง **ไม่มีตัว `$` ตั้งใจให้ไม่โดน dotenv/Next ขยาย `$name` ใน `.env`** เวลาตรวจจะ hash รหัสผ่านทุกครั้งแม้อีเมลผิด เพื่อให้เวลาตอบเท่ากัน สร้าง hash ด้วย `pnpm auth:hash` (ถามรหัสผ่านแบบซ่อน ขั้นต่ำ 12 ตัวอักษร)
- **กัน brute force:** ล็อกอินผิดได้ **5 ครั้งต่อ 15 นาที** นับแยกทั้ง **ต่ออีเมล (`email:<..>`) และต่อ IP (`ip:<..>`)** เก็บในตาราง `login_attempts` (key + เวลา) ถ้าล็อกอินสำเร็จจะล้างตัวนับของทั้งสอง key เกินโควตาจะได้ error `RATE_LIMITED` (หน้า login แสดงข้อความแยกจากรหัสผิด) ตารางเดียวกันถูกใช้เป็นงบสแกน AI รายวันด้วย (key `receipt-parse`)
- Auth.js แบบ Credentials ใช้ได้เฉพาะ JWT session (ตรงกับที่ตั้งไว้) และให้ cookie เป็น `httpOnly` + `secure` + `sameSite=lax`
- รหัสผ่านต้องยาวและเดายาก เพราะแอปนี้เปิดสู่อินเทอร์เน็ตและมีข้อมูลการเงิน (แนะนำ ≥ 16 ตัวอักษร หรือ passphrase)
- ทุก route, server action และ `/api/receipt/parse` ต้องเรียก `auth()` แล้วเช็ก session ก่อนทำงานเสมอ จะพึ่ง middleware อย่างเดียวไม่ได้
- `src/proxy.ts` (Next 16 เปลี่ยนชื่อจาก middleware) ใช้ `NextAuth(authConfig).auth` ที่เป็นส่วน edge-safe (`auth.config.ts` ไม่แตะ DB) redirect ทุก request ที่ไม่มี session ไป `/login` ยกเว้น `/login`, `/api/auth/*`, static, `manifest.webmanifest`, `icons/` ดังนั้น API ที่เรียกโดยไม่ login จะโดน redirect (client ถือว่า `res.redirected` = session หมดอายุ) และถ้า proxy ถูกข้าม `api()` ก็ตอบ 401 เองอีกชั้น

### Wake (ลด cold start) ✅ T4
- `GET /api/wake` → เช็ก session (ไม่ผ่านจะตอบ 401) แล้วรัน `SELECT 1` ผ่าน Sequelize ตอบ `204` ทำงานบน Node runtime ใน region เดียวกับ DB
- client ยิง wake ใน 3 จังหวะ ทั้งหมดเป็น fire-and-forget ไม่ await (`src/client/wake.ts`):
  1. ตอน app mount (`Providers.tsx`)
  2. ตอน `visibilitychange` → `visible` (สลับกลับมาที่แอปหรือ PWA)
  3. ตอน `pointerdown` บนปุ่ม [+] (ผ่าน `onPress` ของ `ModeWheel`) — ปุ่มลัด **ยังไม่ได้ต่อ** wake
- throttle ไม่ให้ยิงถี่เกิน 1 ครั้งต่อ 60 วินาที (จำเวลาที่ยิงล่าสุดไว้ใน memory)
- ไม่มี cron หรือ keep-alive ภายนอก → ไม่กิน compute hours ของ Neon ตอนที่ไม่ได้ใช้
- **ตั้ง region ของ Vercel function ให้ตรงกับ region ของ Neon** (เช่น Singapore ทั้งคู่) เพื่อลด latency ทุก query

### API (ตามโค้ดใน `src/app/api`)
ทุก route เป็น `runtime = "nodejs"` และห่อด้วย `api()` (เช็ก session → handler → แปลง error) ยกเว้น `/api/auth/*` ที่เป็นของ Auth.js และ `/api/wake` ที่เช็ก session เอง
| Method | Path | ใช้ทำอะไร |
|---|---|---|
| GET/POST | `/api/auth/[...nextauth]` | handler ของ Auth.js (login/logout/session/csrf) |
| GET | `/api/wake` | ปลุก function + DB (ตอบ 204 ดูหัวข้อ Wake) |
| GET | `/api/dashboard` | ข้อมูลทุก widget ใน request เดียว |
| GET | `/api/calendar?month=2026-10` | ยอดจ่าย/รับรายวัน + วิธีจดของแต่ละวัน + ยอดรวมเดือน |
| GET | `/api/entries?day=YYYY-MM-DD&limit=N` | รายการล่าสุด หรือของวันที่ระบุ |
| POST | `/api/entries` | จดรายจ่าย/รายรับ (รวมออกก่อนแฟน, ปุ่มลัด, จดย้อนหลังด้วย `occurredAt`) → `{ entry, xpGained, streak, leveledUp }` |
| PATCH / DELETE | `/api/entries/[id]` | แก้ / ลบรายการ |
| POST | `/api/repayments` | แฟนจ่ายคืน → `{ entry, balanceAfter, xpGained, streak, leveledUp }` |
| GET | `/api/partner/outstanding` | ยอดค้างตามรายการ (FIFO) |
| POST | `/api/no-spend` | วันนี้ไม่ได้ใช้เงิน |
| POST | `/api/receipt/parse` | รูป (multipart field `image`) → ร่างใบเสร็จ JSON ไม่บันทึกอะไร (`maxDuration = 30`) |
| POST | `/api/receipts` | บันทึกใบเสร็จที่ตรวจแล้ว (1 entry + lines + อัปเดตความจำเจ้าของ) |
| GET / POST | `/api/categories` | รายการหมวด / เพิ่มหมวด |
| PATCH / DELETE | `/api/categories/[id]` | แก้หมวด / ซ่อน (archive) หมวด |
| GET / POST | `/api/presets` | รายการปุ่มลัด / เพิ่มปุ่มลัด |
| PATCH / DELETE | `/api/presets/[id]` | แก้ / ลบปุ่มลัด |
| GET / PATCH | `/api/settings` | โน้ตเกี่ยวกับแฟน + layout ของ dashboard |
- POST ที่เป็นการจด จะตอบกลับพร้อม `{ entry, xpGained, streak, leveledUp }` → client เอาไปแสดงเอฟเฟกต์ได้เลยโดยไม่ต้อง refetch
- **การอัปเดต cache หลังจด:** ตอนนี้ client รอ server ตอบแล้ว `invalidateQueries` (dashboard, calendar, outstanding) พร้อมโชว์ +XP จากค่าที่ server ส่งกลับ (`useAfterLog`) — **ยังไม่ได้ทำ optimistic update (`onMutate`) ตามที่ออกแบบไว้เดิม** ส่วน error จะขึ้น toast
- **เปิดแอปแล้วเห็นข้อมูลทันที:** เก็บ cache ของ TanStack Query ไว้ใน localStorage (key `me-budget-cache`, อายุ 1 วัน, `buster: "v1"`) → เปิดแอปมาเห็นข้อมูลล่าสุดก่อน แล้วค่อย refetch อยู่เบื้องหลัง
- **บทเรียน hydration:** ต้อง **restore cache จาก localStorage หลัง hydrate เสร็จ** (ใน `useEffect` ของ `src/client/Providers.tsx`) ห้าม restore ก่อน render แรก เพราะ client render แรกจะมีข้อมูลต่างจาก HTML ที่ server ส่งมา → hydration mismatch

### Gemini (free tier) ✅ T5
- **รับรู้ความเสี่ยงแล้ว:** บน free tier Google อาจนำรูปใบเสร็จและ prompt (รวมถึงโน้ตเกี่ยวกับแฟน) ไปใช้ปรับปรุงผลิตภัณฑ์ → **ห้ามใส่ข้อมูลอ่อนไหวลงในโน้ตเกี่ยวกับแฟน** เช่น ชื่อจริงหรือเรื่องสุขภาพ และให้ขึ้นคำเตือนเล็กๆ ใต้ช่องโน้ตในหน้าตั้งค่า
- **ถ้าโดน 429/quota หมด:** ขึ้นข้อความ "AI พักก่อน ลองใหม่อีกที หรือกรอกยอดรวมเองไปก่อน" แล้วเข้า flow จดมือ (ตาม Fallback ใน FR-10)
- rate limit ในแอปเองไว้ที่ **20 ใบต่อ 24 ชั่วโมง** (`MAX_PARSES_PER_DAY`, นับจากตาราง `login_attempts` key `receipt-parse` และนับครั้งที่ล้มเหลวด้วย) จะได้ไม่ไปชน quota ของ free tier ตอนที่มีบั๊กยิงวนลูป เกินแล้วตอบ 429 `RATE_LIMITED`
- ถ้าวันหนึ่งอยากเปลี่ยนเป็น paid → แค่เปลี่ยน API key (ผูก billing) ไม่ต้องแก้โค้ด
- `GEMINI_API_KEY` อยู่ใน env ฝั่ง server เท่านั้น
- **รุ่นโมเดล:** ค่าเริ่มต้น `gemini-3.5-flash-lite` (ตามคอมเมนต์ในโค้ด เร็วกว่า Flash เต็มราว 2-4 วินาที เทียบกับราว 8 วินาที เพราะหน้าตรวจแก้ได้ง่ายอยู่แล้ว) override ด้วย env `GEMINI_MODEL`
- **Schema เป็นสัญญา:** zod schema ตัวเดียวใน `GeminiReceiptParser.ts` ถูกแปลงเป็น JSON schema ส่งให้ Gemini (`responseJsonSchema`, `temperature 0.1`) และใช้ `safeParse` ตรวจผลที่ได้กลับมา ถ้าอ่านไม่ได้จะตอบ `AI_UNAVAILABLE`
- **กรองแถวที่ไม่ใช่สินค้า:** regex `NON_PRODUCT` ตัดแถวส่วนลด/โปรโมชั่น/คูปอง/แต้ม/VAT/เงินทอน ฯลฯ ที่ AI เผลอใส่เป็นบรรทัดออก (ส่วนลดระดับบิลไปเฉลี่ยผ่าน `allocate.ts`) ถ้าไม่เหลือสินค้าเลยตอบ `INVALID_RECEIPT`
- **Retry:** ลองใหม่ 1 ครั้งเมื่อได้ 5xx (500/502/503/504) หน่วง 700ms ไม่ retry เมื่อโดน 429 · timeout ของ request 25 วินาที
- ปี พ.ศ. ที่หลุดมาจะถูกแปลงเป็น ค.ศ. ตอน normalise วันที่ และ prompt สั่งให้ถือว่าข้อความในรูปเป็นข้อมูล ไม่ใช่คำสั่ง

### Domain logic (T7)
อยู่ใน `src/domain/` เป็น pure function ทั้งหมด ไม่ import Sequelize หรือ React ฝั่ง API กับฝั่ง client (ตอน optimistic) ใช้โค้ดชุดเดียวกัน:
- `money.ts`: แปลงสตางค์ ↔ ข้อความ และย่อเป็น `k` สำหรับปฏิทิน
- `split.ts`: คิด partner_share จากโหมดหาร/แฟนทั้งหมด/กรอกเอง และสรุปเจ้าของจากบรรทัดใบเสร็จ (หาร = แบ่งครึ่ง สตางค์ที่เศษให้นับเป็นของเรา)
- `allocate.ts`: เฉลี่ยส่วนลด/VAT ระดับบิลตามสัดส่วนราคา (ผลรวมต้องตรงกับยอดบิลทุกสตางค์ เศษไปลงบรรทัดที่ราคาสูงที่สุด)
- `partner.ts`: ยอดแฟนติด ยอดค้างตามรายการแบบ FIFO และกฎ repayment ต้องไม่เกินยอดค้าง
- `day.ts`: แปลง timestamp → วันตามเวลาไทย (`DayKey`) และช่วงของวัน/เดือน
- `dashboard-layout.ts`: id ของ widget, layout เริ่มต้น และ `normalizeLayout` (ตัด id แปลก/ซ้ำ รักษาลำดับของผู้ใช้ เติม widget ใหม่ต่อท้ายแบบเปิด)
- `streak.ts`: คำนวณ streak จาก logged_days
- `xp.ts`: XP ของการกระทำแต่ละอย่าง (ตัวคูณ + เพดานต่อวัน) และ Level จาก XP รวม
- **Vitest** ครอบทุกไฟล์ข้างบน โดยเฉพาะ acceptance scenarios ใน TOR ที่เป็นเรื่องตัวเลข เช่น ข้าว 100 หาร → -50, แฟนคืน 30 → เหลือ 20, ตัวคูณ XP และ streak ข้ามเที่ยงคืน

### สภาพแวดล้อม (T10)
| env | DB | หมายเหตุ |
|---|---|---|
| test | Postgres 17 (Docker, Testcontainers) | รัน migrations ก่อนเทส ต้องมี Docker |
| dev (ในเครื่อง) | Postgres 17 (`docker compose up -d`, user/pass/db = `mebudget`) | migration `002` seed หมวดตั้งต้นให้ (ไม่มีข้อมูลตัวอย่างอื่น) |
| production | Neon + Vercel | ดูหัวข้อ Deploy |
- ต้องมี Docker Desktop หรือ OrbStack บนเครื่อง
- `getSequelize()` เปิด SSL (`rejectUnauthorized: true`) อัตโนมัติเมื่อ `DATABASE_URL` ไม่ใช่ localhost/127.0.0.1

### Environment variables
| ตัวแปร | จำเป็น | ใช้ทำอะไร |
|---|---|---|
| `DATABASE_URL` | ✅ | connection string ของ Postgres (dev: `postgres://mebudget:mebudget@localhost:5432/mebudget`) |
| `AUTH_SECRET` | ✅ | secret ของ Auth.js (สร้างด้วย `openssl rand -base64 32`) |
| `AUTH_EMAIL` | ✅ | อีเมลของผู้ใช้คนเดียว (`container()` จะ throw ถ้าไม่ตั้ง) |
| `AUTH_PASSWORD_HASH` | ✅ | hash จาก `pnpm auth:hash` |
| `AUTH_EXTRA_USERS` | ไม่จำเป็น | บัญชีเพิ่มที่ล็อกอินได้ รูปแบบ `อีเมล\|hash;อีเมล2\|hash2` ทุกบัญชีเห็นข้อมูลชุดเดียวกัน (ไม่มี user_id ในตาราง) |
| `GEMINI_API_KEY` | สำหรับสแกนใบเสร็จ | key ของ Gemini (ฝั่ง server เท่านั้น) |
| `GEMINI_MODEL` | ไม่จำเป็น | override รุ่นโมเดล (ค่าเริ่มต้น `gemini-3.5-flash-lite`) — ยังไม่อยู่ใน `.env.example` |

### Deploy (Vercel + Neon)
- push ขึ้น branch **`develop`** → Vercel deploy ให้
- **Vercel ไม่ได้รัน DB migration ให้** ต้องรันเองทุกครั้งที่มี migration ใหม่: ตั้ง `DATABASE_URL` ของ production แล้วรัน `pnpm db:migrate:prod` (สคริปต์ `scripts/migrate.ts up` ไม่โหลดไฟล์ `.env*` จึงต้องใส่ตัวแปรใน environment เอง) ควรใช้ connection string แบบ **direct (ไม่ใช่ `-pooler`)** ของ Neon สำหรับ migration ส่วนตัวแอปบน Vercel ใช้แบบ pooled
- ตั้ง env ทุกตัวในตารางด้านบนใน Vercel project ด้วย
- ย้อน migration ล่าสุดในเครื่อง: `pnpm db:rollback` (ใช้ `.env.local`)

### Tooling
- **package manager: pnpm** (ห้ามใช้ npm/yarn; `packageManager: pnpm@11.17.0`, Node ≥ 22)
- scripts ใน `package.json`: `dev`, `build`, `start`, `lint`, `test` (`vitest run`), `test:watch`, `typecheck` (`tsc --noEmit`), `db:migrate` / `db:rollback` (อ่าน `.env.local`), `db:migrate:prod` (อ่าน `DATABASE_URL` จาก environment), `auth:hash`
- `pnpm-workspace.yaml` ตั้ง `allowBuilds` เป็น `false` ทั้งหมด (ไม่อนุญาตให้ build script ของ dependency รัน): `@google/genai`, `cpu-features`, `esbuild`, `protobufjs`, `ssh2`, `unrs-resolver` — ถ้าเครื่องมือไหนต้องการ native build ค่อยเปลี่ยนรายตัวโดยตั้งใจ
- เทส: **Vitest** (`include: src/**/*.test.ts`, alias `@` → `src`) รวม integration test ที่ใช้ Testcontainers
- `scripts/smoke/api.py`, `scripts/smoke/receipt.py` เป็นสคริปต์ตรวจ end-to-end **ทำเอง (manual)** ยิงไปที่ dev server `http://localhost:3111` ด้วย session จริง (ต้องมีบัญชีทดสอบ; receipt.py อ่านรหัสผ่านจากตัวแปร `T_PW`) ไม่ได้รันใน `pnpm test` · `scripts/try-receipt.ts` ลองให้ Gemini อ่านรูปใบเสร็จจากไฟล์
- Next.js 16: `middleware` ถูกเปลี่ยนชื่อเป็น **`proxy`** (รัน Node runtime เป็นค่าเริ่มต้น) → ใช้ `src/proxy.ts` สำหรับ redirect ไปหน้า login
- `uuid` เวอร์ชันเก่าที่ Sequelize v6 ดึงมามี advisory ระดับ moderate (กระทบเฉพาะตอนส่ง buffer ซึ่ง Sequelize ไม่ได้ทำ) → รับความเสี่ยงไว้ ไม่ใช้ `--force`

## 5. ข้อจำกัดที่รู้แล้ว
- **Haptic บน iPhone:** Safari ไม่รองรับ `navigator.vibrate` ทำให้วงล้อสั่นได้เฉพาะบน Android ส่วน iOS ต้องใช้แค่ animation กับเสียงแทน
- Vercel function รับ body ได้สูงสุดประมาณ 4.5MB → ต้องย่อรูปก่อนส่งทุกครั้ง

## 6. Tech decisions
| # | เรื่อง | ตัดสินใจ | ใครเลือก |
|---|---|---|---|
| T1 | Database / ORM | Neon Postgres + Sequelize v6 (เคยพิจารณา Supabase แต่ตัดสินใจกลับมาใช้ Neon) repo ใช้ model เป็นหลัก raw SQL เฉพาะ aggregate | เพื่อน |
| T2 | Auth | Auth.js Credentials (email + password) ผู้ใช้เดียวจาก env (`AUTH_EMAIL`, `AUTH_PASSWORD_HASH`) + JWT `maxAge` 90 วัน เดิมเลือก Google แต่เปลี่ยนเป็น email/password "ไปก่อน" | เพื่อน |
| T3 | Data flow | Client-side: TanStack Query + API routes | เพื่อน |
| T4 | Cold start | ปลุกตามจังหวะการใช้งาน (เปิดแอป / กลับมาที่แอป / แตะ [+]) ไม่ใช้ cron | เพื่อน |
| T5 | Gemini tier | Free tier (ยอมรับว่า Google อาจนำข้อมูลไปใช้ปรับปรุงผลิตภัณฑ์) | เพื่อน |
| T6 | UI | ทำเอง: ปุ่ม 3D, ชิป, การ์ด, แป้นตัวเลข, วงล้อ, ปฏิทิน · Radix Dialog: sheet (toast และสวิตช์ทำเอง) · Motion: animation และ `Reorder` widget | เพื่อน |
| T7 | Domain logic + tests | แยก logic เป็น pure TS ใน `src/domain/` (ไม่แตะ DB/React) แล้วเทสด้วย Vitest | Claude |
| T8 | PWA | manifest + ไอคอน + splash ไม่มี service worker (คิวจด offline ย้ายไป backlog) | เพื่อน |
| T9 | Architecture | Clean Architecture ใน Next.js ตัวเดียว (domain / application / infrastructure / controller) ต่อ DI เองใน container.ts + boundaries lint | เพื่อน (รายละเอียด DI/transaction: Claude) |
| T10 | Test/dev DB | Postgres ใน Docker: Testcontainers สำหรับ integration test + docker-compose สำหรับ dev ในเครื่อง ส่วน Neon ใช้เฉพาะ production | เพื่อน |
| T11 | ไอคอน | Material Symbols Rounded แทน emoji ทั้งหมด (หมวด, ปุ่มลัด, วงล้อ, widget) | เพื่อน |

### ข้อควรระวังของ T1 (Sequelize บน Vercel serverless)
- **ใช้เวอร์ชัน stable (v6)** ส่วน v7 (`@sequelize/core`) ตรวจสถานะตอนเริ่ม setup ถ้ายังไม่ stable ก็ใช้ v6 ไปก่อน
- **ใช้ Node.js runtime เท่านั้น** เพราะ Sequelize รันบน Edge runtime ไม่ได้ ดังนั้น route/middleware ที่ต้องแตะ DB ต้องไม่อยู่บน Edge
- **Connection:** ใช้ connection string แบบ **pooled** ของ Neon (`-pooler`) สำหรับตัวแอป ตั้ง `pool.max` = 2 (ตามโค้ด) ส่วน migration ใช้แบบ direct และสร้าง Sequelize instance ครั้งเดียวต่อ function instance (cache ไว้บน `globalThis`) จะได้ไม่เปิด connection ใหม่ทุก request
- **Types:** ใช้ `InferAttributes` / `InferCreationAttributes` ของ v6 ประกาศ model ให้มี type ครบ
- **Migrations:** ใช้ **Umzug** (ไม่ใช้ `sequelize-cli`) รายการ migration ลงทะเบียนใน `src/infrastructure/db/migrate.ts` เก็บสถานะในตาราง `schema_migrations` เอง · `001-initial` เป็น SQL ดิบ (มี CHECK constraint) · **ห้ามใช้ `sync({ alter: true })` บน production**
- **เวลา:** ตั้ง `timezone: '+00:00'` ให้ Sequelize เก็บเป็น UTC แล้วไปแปลงเป็น Asia/Bangkok ใน query หรือฝั่งแอปเอง
- **สตางค์:** คอลัมน์เงินใช้ `DataTypes.INTEGER` (ถ้ากลัวล้นใช้ `BIGINT` ซึ่ง pg จะคืนค่าเป็น string ต้องแปลงเอง)


## บทเรียนจาก production (Vercel)
- **ต้องกำหนด `modelName` ของ Sequelize ทุก model เอง:** ถ้าไม่กำหนด Sequelize ใช้ชื่อ class ซึ่งตัวย่อโค้ดตอน production เปลี่ยนไป ทำให้ฟังก์ชัน association (`setEntry` ฯลฯ) ไปทับ `Model#set` แล้วเรียกวนจน stack ล้น function ล่มด้วย `FUNCTION_INVOCATION_FAILED` เฉพาะตอนบันทึกใบเสร็จ (โหมด dev ไม่ย่อโค้ดจึงไม่เจอ) มีเทสกันไว้ใน `repos.integration.test.ts`
- **ต้องส่ง `pg` เป็น `dialectModule`** ไม่งั้น Vercel ไม่แพ็ก driver เข้า function (`Please install pg package manually`)
- **env ใน Vercel มี scope:** push ที่ `develop` เป็น Preview ถ้าติ๊กตัวแปรไว้แค่ Production จะไม่มาถึง และการแก้ env ไม่ trigger redeploy เอง ใช้ `/api/health` ตรวจ
- **ทดสอบ production build ก่อน push เสมอ** (`pnpm build && pnpm start` + `scripts/smoke/api.py`) โหมด dev ปิดบังบั๊กพวกนี้
