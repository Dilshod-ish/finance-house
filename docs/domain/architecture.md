# FinCore — Arxitektura va Ma'lumotlar Modeli

> Kodlash boshlanishidan oldin qabul qilingan qarorlar. Bu hujjat va `prd.md`
> ziddiyatga tushsa — texnik masalalarda shu hujjat, mahsulot masalalarida
> `prd.md` ustun. Ikkalasi ham `CLAUDE.md` dan past turadi.
> Kod nomi: `FinCore` (brend keyin almashtiriladi).
> Maqsad bozor: **O'zbekiston MSB (faza 1) → MDH + global (faza 3)**.
> Referens/raqobatchi: Fintablo, Планфакт, Финансист, Adesk, Aspro.Finance.

---

## 0. Bir jumlada

Bu **buxgalteriya emas**. Bu — biznes egasiga «pulim qayerda, qancha ishladim, qachon uziladi, qaysi yo'nalish foyda keltiryapti» degan 4 savolga **har kuni 5 daqiqada** javob beradigan boshqaruv hisobi platformasi.

---

## 1. Asosiy arxitektura qarori: yagona ikki yozuvli daftar (ledger)

### 1.1 Fintablo'ning strukturaviy nuqsoni

Fintablo'da hisobotlar **modullardan yig'ma qilib tikiladi**: ДДС — operatsiyalardan, ОПиУ — sделkalar + oyliklar + amortizatsiya + qo'lda kiritishdan, Balans — alohida mantiq bilan. Natijada:

- Balansni ishga tushirish uchun «start oyi» va «o'tgan davrlar foydasi» orqali **sun'iy tenglashtirish (plug)** kerak bo'ladi;
- ОПиУ va Balans o'rtasidagi nomuvofiqlikni topish qiyin;
- yangi modul qo'shilsa, uchala hisobotga alohida-alohida ulash kerak.

### 1.2 Bizning yechim

**Har qanday biznes fakti → `journal_entry` (ikki yozuv) → hisobotlar shu daftar ustidan proyeksiya.**

```
                     ┌──────────────────────────────┐
  Manbalar           │      JOURNAL (immutable)      │      Proyeksiyalar
  ─────────          │  entry ─┬─ line (Dt)          │      ────────────
  Bank operatsiya ──▶│         └─ line (Ct)          │──▶  Pul oqimi (DDS)
  Bitim (deal)    ──▶│                               │──▶  P&L (ОПиУ)
  Majburiyat      ──▶│  har bir line'da:             │──▶  Balans
  Oylik           ──▶│   • account_code              │──▶  Kassa kalendari
  Amortizatsiya   ──▶│   • dimensions (yo'nalish,    │──▶  Byudjet plan/fakt
  Kredit foizi    ──▶│     loyiha, kontragent...)    │──▶  Unit-ekonomika
  Soliq           ──▶│   • currency + fx             │──▶  KPI paneli
  Qo'lda kiritish ──▶│   • source_type + source_id   │
                     └──────────────────────────────┘
```

**Bundan kelib chiqadigan majburiy invariantlar (buzilishi mumkin emas):**

| #   | Invariant                                                                                      | Nega                                        |
| --- | ---------------------------------------------------------------------------------------------- | ------------------------------------------- |
| I1  | Har bir `journal_entry` uchun `Σ debit = Σ credit` (funksional valyutada)                      | Balans hech qachon «qiyshaymaydi»           |
| I2  | Yopilgan davrga (`period_lock`) yozuv kiritib bo'lmaydi; faqat storno + qayta yozuv            | Audit va ishonch                            |
| I3  | Har bir `journal_line` da `source_type` + `source_id` majburiy                                 | Har bir raqamdan manba hujjatga drill-down  |
| I4  | `journal_entry` o'chirilmaydi — `reversed_by_id` orqali stornolanadi                           | Immutable audit trail                       |
| I5  | Pul oqimi (DDS) faqat `account_kind IN (bank, cash, ewallet)` bo'lgan liniyalardan hisoblanadi | Kesh va nachisleniyani chalkashtirmaslik    |
| I6  | Nachisleniye sanasi (`accrual_date`) va pul sanasi (`cash_date`) — **alohida maydonlar**       | ОПиУ va ДДС farqining butun mohiyati shunda |

### 1.3 Nima yutamiz

- Balans **avtomatik yig'iladi va har doim to'g'ri keladi** (plug kerak emas).
- ОПиУ → Balans → ДДС o'rtasida **avtomatik sverka** (`ЧП = ΔСК − дивиденды` va h.k.) — bu alohida «Tekshiruv» ekrani bo'ladi. Fintablo'da bu yo'q.
- Yangi modul (masalan, ombor yoki lizing) qo'shilganda faqat «journal entry generator» yoziladi — hisobotlarga tegilmaydi.
- Retroaktiv o'zgarishlar (`as_of` so'rovlar) — «o'tgan oy hisobotini men uni yopgan paytda qanday ko'rgan edim?» degan savolga javob.

---

## 2. Domen modeli

### 2.1 Tenant iyerarxiyasi

```
Organization (tenant, = biznes/holding)
 └── LegalEntity (MCHJ / YaTT / xorijiy OOO / LLC)   ← cheklanmagan
      └── Account (bank hisobi / kassa / karta / e-hamyon / virtual)
```

- **Konsolidatsiya:** hisobotlar `organization` darajasida sukut bo'yicha yig'iladi; `legal_entity_id[]` filtri bilan kesiladi.
- **Ichki oborot (intercompany) eliminatsiyasi:** yuridik shaxslar o'rtasidagi o'tkazmalar konsolidatsiyada avtomatik chiqarib tashlanadi. _Bu Fintablo'da zaif ishlangan joy._
- **Virtual hisob** — reklama kabineti, marketplace balansi, deponent: pul o'tdi lekin xarajat hali sodir bo'lmadi.

### 2.2 O'lchamlar (dimensions)

Har bir `journal_line` quyidagi o'lchamlarni oladi (barchasi ixtiyoriy, lekin `direction` amalda majburiy):

| O'lcham                  | Misol                          | Izoh                               |
| ------------------------ | ------------------------------ | ---------------------------------- |
| `direction_id`           | «Ulgurji», «Chakana», «Onlayn» | Biznes yo'nalishi. Iyerarxik.      |
| `project_id` / `deal_id` | «Yunusobod obyekti»            | Qurilish/agentlik uchun kritik     |
| `counterparty_id`        | Mijoz/yetkazib beruvchi        | Debitorka/kreditorka manbayi       |
| `cost_center_id`         | «Sotuv bo'limi»                | Ixtiyoriy, o'rta biznesdan boshlab |
| `employee_id`            |                                | Oylik va ishbay ish uchun          |
| `tag[]`                  | «aksiya-2026», «tender»        | Erkin                              |

**Bilvosita xarajatlarni taqsimlash (allocation):** yo'nalishi yo'q xarajatlar oy yopilishida tanlangan baza bo'yicha (tushum ulushi / xodimlar soni / to'g'ridan-to'g'ri xarajat ulushi / qo'lda koeffitsient) taqsimlanadi va **alohida `allocation` tipidagi journal entry** yaratadi. Ya'ni taqsimlash ham daftarda ko'rinadi va bekor qilinishi mumkin.

### 2.3 Hisoblar rejasi (Chart of Accounts)

Ikki qatlam:

1. **`gl_account`** — ichki boshqaruv hisoblari rejasi (davlat NSBU/BHMS emas). Sinflar: `1xxx Aktivlar`, `2xxx Majburiyatlar`, `3xxx Kapital`, `4xxx Daromadlar`, `5xxx Xarajatlar`. Foydalanuvchi buni **ko'rmaydi**.
2. **`article`** (modda) — foydalanuvchi ko'radigan qatlam: «Ijara», «Reklama», «Mahsulot sotuvidan tushum». Har bir modda 1 ta `gl_account` ga va 1 ta `pnl_line` ga bog'lanadi.

Modda tipi (`article.flow_type`) — Fintablo mantiqini kengaytiramiz:

- `revenue` — tushum
- `cogs` — sotilgan mahsulot tannarxi
- `opex_variable` / `opex_fixed` — o'zgaruvchan / doimiy xarajat
- `below_ebitda` — foizlar, soliqlar, amortizatsiya
- `below_net_profit` — dividendlar, egasining shaxsiy chiqimlari
- `financing` — kredit olish/qaytarish (P&L ga tushmaydi)
- `investing` — asosiy vosita xarid/sotuvi
- `transfer` — hisoblar o'rtasida (hech qayerga tushmaydi)

### 2.4 Asosiy jadvallar (qisqartirilgan DDL eskizi)

```sql
-- Ko'p ijarachilik: HAR BIR jadvalda org_id + Postgres RLS
create table organization (
  id uuid primary key, name text not null,
  base_currency char(3) not null default 'UZS',
  country_code char(2) not null default 'UZ',
  region_pack text not null default 'uz',      -- soliq/bank/EHF paketi
  fiscal_year_start smallint not null default 1,
  created_at timestamptz not null default now()
);

create table legal_entity (
  id uuid primary key, org_id uuid not null references organization,
  name text not null, legal_form text,          -- MCHJ | YaTT | OOO | LLC
  tax_id text,                                  -- STIR / INN / VAT no.
  functional_currency char(3) not null,
  tax_regime text,                              -- uz: qqs_foyda | aylanma_4 | aylanma_1 | it_park
  vat_registered boolean not null default false
);

create table account (                          -- pul saqlanadigan joy
  id uuid primary key, org_id uuid not null,
  legal_entity_id uuid not null references legal_entity,
  name text not null,
  kind text not null,                           -- bank|cash|card|ewallet|acquiring|virtual
  currency char(3) not null,
  bank_code text, iban text,
  is_active boolean not null default true
);

create table gl_account (
  id uuid primary key, org_id uuid,             -- null = tizim shabloni
  code text not null, name text not null,
  type text not null,                           -- asset|liability|equity|income|expense
  normal_side char(1) not null                  -- D | C
);

create table article (                          -- foydalanuvchi ko'radigan modda
  id uuid primary key, org_id uuid not null,
  parent_id uuid references article,
  name text not null,
  flow_type text not null,                      -- 2.3 dagi ro'yxat
  gl_account_id uuid not null references gl_account,
  pnl_line_code text,
  vat_rate numeric(5,2),                        -- uz: 12.00 | 0 | null
  is_archived boolean not null default false
);

create table direction (
  id uuid primary key, org_id uuid not null,
  parent_id uuid references direction,
  name text not null, is_archived boolean default false
);

create table counterparty (
  id uuid primary key, org_id uuid not null,
  name text not null, tax_id text,              -- STIR
  kind text[],                                  -- customer|supplier|employee|bank|gov
  payment_terms_days int
);

-- ===== YADRO: DAFTAR =====
create table journal_entry (
  id uuid primary key, org_id uuid not null,
  legal_entity_id uuid not null,
  entry_date date not null,                     -- nachisleniye sanasi
  kind text not null,                           -- cash|accrual|payroll|depreciation|
                                                -- tax|loan|allocation|fx_revaluation|
                                                -- opening|closing|manual|reversal
  source_type text not null,                    -- I3: majburiy
  source_id uuid,
  description text,
  reversed_by_id uuid references journal_entry,
  posted_at timestamptz not null default now(),
  posted_by uuid,
  constraint no_self_reverse check (reversed_by_id <> id)
);

create table journal_line (
  id uuid primary key, entry_id uuid not null references journal_entry on delete restrict,
  org_id uuid not null,
  gl_account_id uuid not null,
  side char(1) not null,                        -- D | C
  amount numeric(20,4) not null check (amount > 0),   -- original valyuta
  currency char(3) not null,
  fx_rate numeric(20,10) not null,
  amount_functional numeric(20,4) not null,     -- I1 shu ustun bo'yicha tekshiriladi
  -- o'lchamlar
  account_id uuid references account,           -- pul hisobi (faqat kesh liniyalarda)
  article_id uuid references article,
  direction_id uuid references direction,
  deal_id uuid, project_id uuid,
  counterparty_id uuid, employee_id uuid, cost_center_id uuid,
  tags text[],
  memo text
);
create index on journal_line (org_id, gl_account_id, entry_id);
create index on journal_line (org_id, direction_id);
create index on journal_line (org_id, account_id) where account_id is not null;
```

**I1 ni ma'lumotlar bazasi darajasida majburlash:** `deferred constraint trigger` yoki `journal_entry` ga `is_balanced` generated tekshiruvi + tranzaksiya oxirida trigger. **Ilova qatlamiga ishonmang.**

### 2.5 Operatsion jadvallar (daftarga «yem» beradi)

| Jadval                                                | Vazifa                                                        | Journal generatsiyasi                                  |
| ----------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------ |
| `cash_operation`                                      | Bank/kassa harakati (import yoki qo'lda)                      | `kind=cash`, pul hisobi ↔ modda                        |
| `obligation`                                          | Nachisleniye: akt, hisob-faktura, shartnoma bosqichi          | `kind=accrual`, xarajat/daromad ↔ debitorka/kreditorka |
| `obligation_settlement`                               | Majburiyat ↔ to'lov bog'lanishi (many-to-many, qisman to'lov) | yopish yozuvi                                          |
| `deal` / `deal_item` / `deal_purchase` / `deal_stage` | Bitim, uning tushumi va to'g'ridan-to'g'ri xarajatlari        | tushum + tannarx accrual'lari                          |
| `employee` / `payroll_run` / `payroll_line`           | Oylik, ishbay, soliqlar                                       | `kind=payroll`                                         |
| `asset` / `depreciation_schedule`                     | Asosiy vositalar                                              | `kind=depreciation`, oylik avtomatik                   |
| `loan` / `loan_schedule`                              | Kredit, lizing                                                | asosiy qarz = financing, foiz = xarajat                |
| `tax_accrual`                                         | Soliq nachisleniyasi                                          | `kind=tax`                                             |
| `manual_pnl_entry`                                    | Tashqi tizimdan (1C, iiko, marketplace) qo'lda kiritish       | `kind=accrual`, dublikat himoyasi bilan                |
| `budget` / `budget_line`                              | BDDS va BDR rejalari                                          | daftarga tushmaydi, plan/fakt uchun alohida            |
| `payment_request`                                     | To'lovga ariza + tasdiqlash marshruti                         | tasdiqlangach `cash_operation` reja yozuvi             |
| `scenario` / `scenario_driver`                        | **Yangi:** moliyaviy model, «what-if»                         | daftarga tushmaydi                                     |

### 2.6 «Manba belgisi» — Fintablo'ning eng yaxshi g'oyasini kuchaytiramiz

Fintablo ОПиУ satrida `С / Д / З / Н / И / К / О / Р` belgilarini ko'rsatadi. Bizda bu **`journal_line.source_type` ning UI proyeksiyasi** va uch darajali drill-down bo'ladi:

```
Hisobot yacheykasi (12 480 000 so'm)
   ↓ bosildi
Journal liniyalari ro'yxati (17 ta yozuv, manba belgisi bilan)
   ↓ bosildi
Manba hujjat (bitim kartochkasi / bank operatsiyasi / oylik vedomosti)
   ↓
Original: bank ko'chirmasi qatori, EHF PDF, yuklangan fayl
```

Bu **mahsulotning asosiy ishonch mexanizmi**. Excel'dan ko'chishning bosh to'sig'i — «bu raqam qayerdan chiqdi?». Har bir raqam 3 ta bosishda originalgacha ochilishi kerak. Buni MVP dan chiqarib tashlash mumkin emas.

---

## 3. Ko'p valyutalilik (multi-currency)

O'zbekiston uchun bu **MVP talabi**, opsiya emas: MSB so'm + dollar (ko'pincha yevro/rubl/yuan) bilan ishlaydi.

**Uch qatlamli summa:**

1. `amount` + `currency` — operatsiyaning original valyutasi
2. `amount_functional` — yuridik shaxsning funksional valyutasi (odatda UZS), operatsiya sanasidagi kurs bo'yicha
3. **Taqdimot valyutasi** — hisobot vaqtida hisoblanadi, tanlanadigan siyosat bilan:
   - `transaction` — har bir operatsiya o'z kursida
   - `monthly_average` — ОПиУ uchun standart
   - `closing` — Balans uchun standart

**Kurs manbayi:** CBU (`cbu.uz` ochiq API) kunlik + qo'lda override. `fx_rate` jadvali: `(date, from, to, rate, source)`.

**Kurs farqi:** oy yopilishida valyutadagi hisoblar va debitorka/kreditorka qayta baholanadi → `kind=fx_revaluation` yozuvi → ОПиУ da «Kurs farqi» satri (EBITDA dan pastda). _Fintablo bu narsani deyarli qilmaydi — bu bizning aniq ustunligimiz._

---

## 4. Multi-region: `region_pack` arxitekturasi

Faza 1 — faqat `uz`. Lekin **birinchi kundan shu abstraksiya bilan yoziladi**, aks holda global chiqish rewrite'ga aylanadi.

```ts
interface RegionPack {
  code: 'uz' | 'ru' | 'kz' | 'global';
  locale: { languages: string[]; numberFormat; dateFormat; firstDayOfWeek };
  currency: { default: string; symbolPosition };
  legalForms: LegalForm[]; // MCHJ, YaTT, XK...
  taxRegimes: TaxRegime[]; // pastga qarang
  chartOfAccountsTemplate: GlAccountSeed[];
  articleTemplates: ArticleSeed[]; // sohalar bo'yicha
  bankConnectors: BankConnector[]; // API yoki parser
  statementParsers: StatementParser[]; // 1C-exchange txt, xlsx, pdf, mt940, camt.053
  eInvoiceProvider?: EInvoiceProvider; // Didox / Faktura.uz
  taxAuthorityConnector?: TaxConnector; // soliq.uz
  fxSource: FxSource; // cbu.uz / cbr.ru / ECB
  reportPresets: ReportPreset[];
}
```

### 4.1 O'zbekiston paketi (`uz`) — 2026 holati

**Soliq rejimlari** (`legal_entity.tax_regime`), 2026-yil stavkalari:

| Rejim       | Kim uchun                                             | Stavkalar                                      |
| ----------- | ----------------------------------------------------- | ---------------------------------------------- |
| `aylanma_1` | YaTT / o'zini o'zi band qilgan, aylanma ≤ 1 mlrd so'm | aylanmadan **1%** + ijtimoiy soliq oyiga 1 BHM |
| `aylanma_4` | Yuridik shaxs, aylanma ≤ 1 mlrd so'm                  | aylanmadan **4%**                              |
| `qqs_foyda` | Aylanma > 1 mlrd so'm yoki ixtiyoriy                  | QQS **12%**, foyda solig'i **15%**             |
| `it_park`   | IT Park rezidenti                                     | imtiyozli rejim (konfiguratsiyalanadi)         |

Umumiy: JSHDS **12%**, ijtimoiy soliq **12%** (byudjet tashkilotlari 25%), yuridik shaxs mol-mulk solig'i **1,5%**.

> ⚠️ Stavkalar `region_pack` ichida **sana bo'yicha versiyalangan konfiguratsiya** sifatida saqlanadi (`effective_from`/`effective_to`), kodga hardcode qilinmaydi. Har yanvarda qonun o'zgaradi.

**Kritik mahsulot funksiyasi — «1 mlrd so'm chegarasi radar»:** aylanma soliq to'lovchi kompaniya uchun yillik aylanmani real vaqtda kuzatib, chegaraga yetishni **6–12 oy oldin** prognoz qiladi va QQS+foyda rejimiga o'tish stsenariysini hisoblab beradi (marja qanday o'zgaradi, narxni qancha ko'tarish kerak). **Bu O'zbekiston bozori uchun killer-feature — hech kimda yo'q.**

**QQS hisobi:** kiruvchi/chiquvchi QQS ajratish, EHF bilan sverka, IKPU kodlari bilan ishlash.

**Integratsiyalar (`uz`) — prioritet bo'yicha:**

| Prioritet | Integratsiya                                          | Usul                                                      | Izoh                                                                   |
| --------- | ----------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------- |
| P0        | Bank ko'chirmasi importi                              | Fayl parser: 1C-exchange `.txt`, `.xlsx`, `.csv`, PDF+OCR | O'zbekistonda ochiq banking deyarli yo'q → **parser-first strategiya** |
| P0        | Telegram bot                                          | Naqd operatsiya, chek foto, kunlik dayjest                | UZ da Telegram = asosiy kanal                                          |
| P1        | Didox / Faktura.uz (EHF)                              | API                                                       | Kiruvchi hisob-fakturalar → avtomatik majburiyat                       |
| P1        | Payme / Click / Uzum ekvayring                        | API                                                       | Kunlik reestr + komissiya ajratish                                     |
| P2        | 1C:Buxgalteriya UZ                                    | Fayl almashinuv + API                                     | O'z-o'zi sozlanadigan bo'lishi shart (Fintablo'da yo'q)                |
| P2        | Bank API'lari (TBC, Anor, Kapitalbank, Uzum Business) | REST/OAuth                                                | Mavjud bo'lganda                                                       |
| P3        | soliq.uz shaxsiy kabinet                              | API/parsing                                               | Soliq nachisleniyalarini tortib olish                                  |
| P3        | Ombor: MySklad, Billz, 1C UT                          | API                                                       | Tannarx uchun                                                          |

**Ma'lumotlar joylashuvi:** O'zbekiston shaxsiy ma'lumotlar to'g'risidagi qonuni fuqarolar ma'lumotlarini **mamlakat hududida saqlashni talab qiladi.** Arxitektura `data_residency` ni region darajasida qo'llab-quvvatlashi kerak (UZ uchun mahalliy DC/bulut, global uchun EU/US). Buni keyin qo'shib bo'lmaydi — birinchi kundan region bo'yicha ajratilgan deployment.

---

## 5. Texnik stek

### 5.1 Tanlov va sabab

| Qatlam         | Tanlov                                                           | Nega                                                              |
| -------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------- |
| Monorepo       | **Turborepo + pnpm**                                             | Bitta til, tez CI, umumiy tiplar                                  |
| Backend        | **TypeScript + NestJS** (yoki Hono, agar yengilroq kerak bo'lsa) | Domen boy, DI va modullilik kerak                                 |
| DB             | **PostgreSQL 16** + Row Level Security                           | Moliyaviy ma'lumot = tranzaksion + `numeric` aniqligi             |
| ORM/migratsiya | **Drizzle ORM** + `drizzle-kit`                                  | SQL ga yaqin, generated tiplar, moliyaviy so'rovlarni yashirmaydi |
| Navbat         | **BullMQ + Redis**                                               | Import, hisobot qayta hisoblash, integratsiya sinxronizatsiyasi   |
| Frontend       | **Next.js 15 (App Router) + React 19 + TypeScript**              | SSR hisobotlar, tez TTI                                           |
| UI             | **Tailwind + shadcn/ui + TanStack Table + Recharts**             | Katta jadvallar — TanStack Table majburiy                         |
| Auth           | **better-auth** yoki Keycloak                                    | MFA, SSO (Enterprise uchun)                                       |
| Fayl           | S3-mos (MinIO on-prem UZ uchun)                                  | Chek, ko'chirma, EHF                                              |
| AI             | **Anthropic Claude API**                                         | OCR, kategoriyalash, tahlil, NL so'rov                            |
| Kuzatuv        | OpenTelemetry + Grafana + Sentry                                 |                                                                   |
| Deploy         | Docker + Kubernetes (yoki Hetzner + Coolify MVP uchun)           | Region bo'yicha ajratish                                          |

**Muhim:** pul summalari uchun **hech qachon `float`/`number` ishlatilmaydi.** DB da `numeric(20,4)`, TS da `decimal.js` yoki `bigint` (minor units). Bu lint qoidasi bilan majburlanadi.

### 5.2 Repo strukturasi

```
fincore/
├── apps/
│   ├── api/                  # NestJS
│   ├── web/                  # Next.js
│   ├── worker/               # BullMQ konsyumerlar
│   └── bot/                  # Telegram bot
├── packages/
│   ├── db/                   # Drizzle sxema + migratsiyalar + seed
│   ├── ledger/               # ⭐ YADRO: posting engine, invariantlar
│   ├── reports/              # ⭐ Proyeksiyalar: DDS, P&L, Balans, kalendar
│   ├── region-packs/
│   │   ├── uz/               # soliq, banklar, EHF, CoA shablon
│   │   └── _contract/        # RegionPack interfeysi
│   ├── importers/            # ko'chirma parserlari
│   ├── ai/                   # Claude wrapperlari, promptlar, guardrails
│   ├── shared/               # tiplar, money, date, i18n
│   └── ui/                   # dizayn tizimi
└── docs/
    ├── adr/                  # Architecture Decision Records
    └── domain/               # bu hujjat + hisobot metodologiyasi
```

`packages/ledger` va `packages/reports` — **eng qattiq test qilinadigan** joy: 100% branch coverage, property-based testlar.

### 5.3 Hisobotlarni hisoblash strategiyasi

1. **MVP:** to'g'ridan-to'g'ri `journal_line` ustidan SQL agregatsiya + materialized view (`mv_trial_balance_monthly`). 100k liniyagacha yetarli.
2. **O'sishda:** oylik `balance_snapshot` (har oy yakuni bo'yicha hisob+o'lcham kesimi) + joriy oyni onlayn hisoblash.
3. **Katta mijozlar:** ClickHouse ga replikatsiya, faqat analitika uchun. **Erta optimizatsiya qilmang.**

---

## 6. Xavfsizlik va ruxsatlar

- **RLS:** har bir so'rovda `set local app.org_id`. Ilova qatlamidagi filtrga tayanmaslik.
- **Rollar:** `owner`, `cfo`, `accountant`, `operator`, `head_of_direction`, `viewer`, `auditor` (faqat o'qish + audit log).
- **Obyekt darajasidagi cheklov:** yo'nalish rahbari faqat o'z yo'nalishini ko'radi; oylik moduli alohida ruxsat (maoshlar sezgir).
- **Audit log:** kim, qachon, qaysi maydonni, nimadan nimaga o'zgartirdi. O'chirilmaydi.
- **Davr qulfi:** `period_lock (legal_entity_id, locked_through_date)` — I2.
- **Shifrlash:** at-rest (DB + S3), sezgir maydonlar (maosh) uchun qo'shimcha ustun shifri.
- **API kalitlari:** scope'li, muddatli, oxirgi ishlatilish vaqti ko'rinadi.

---

## 7. AI qatlami (`packages/ai`)

Fintablo'da AI — «tavsiyalar generatori». Bizda AI **ish jarayoniga kirib boradi**:

| Funksiya               | Tavsif                                                               | Xavfsizlik chegarasi                                                                                       |
| ---------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Chek/hisob-faktura OCR | Foto → operatsiya loyihasi (summa, kontragent, modda)                | Har doim **tasdiqlash talab qiladi**, avtomatik post qilmaydi                                              |
| Avtokategoriyalash     | Ko'chirma qatori → modda + yo'nalish taxmini, ishonch darajasi bilan | <85% ishonchda navbatga tushadi                                                                            |
| Anomaliya detektori    | «Ijara odatdagidan 3× yuqori», «dublikat to'lov shubhasi»            | Faqat ogohlantirish                                                                                        |
| Tabiiy tilda so'rov    | «Q3 da qaysi yo'nalish zarar keltirdi?»                              | **Text-to-SQL emas** — oldindan tayyorlangan parametrli so'rovlar to'plami. Erkin SQL generatsiyasi = xavf |
| Oy yopish yordamchisi  | Yopilmagan majburiyatlar, taqsimlanmagan operatsiyalar ro'yxati      | Deterministik qoidalar + AI izohi                                                                          |
| Narrativ hisobot       | Egaga oylik xat: nima o'zgardi va nega                               | Raqamlar deterministik, faqat matn AI                                                                      |

**Qattiq qoida:** AI hech qachon raqam hisoblamaydi. Barcha raqamlar daftardan keladi, AI faqat **tanlaydi, tushuntiradi va taklif qiladi**. Aks holda mahsulotga ishonch nolga tushadi.

---

## 8. Fintablo bilan taqqoslash: nima o'zgardi

| Jihat                           | Fintablo                           | FinCore                            |
| ------------------------------- | ---------------------------------- | ---------------------------------- |
| Hisobot yadrosi                 | Modullardan yig'ma                 | Yagona ikki yozuvli daftar         |
| Balans                          | Start oyida sun'iy tenglashtirish  | Har doim avtomatik teng            |
| Hisobotlararo sverka            | Yo'q                               | Avtomatik «Tekshiruv» ekrani       |
| Ko'p valyuta                    | Zaif                               | Uch qatlamli, kurs farqi avtomatik |
| Moliyaviy model / stsenariy     | **Yo'q** (foydalanuvchi shikoyati) | Bor: drayverli model, 3 stsenariy  |
| Unit-ekonomika, ABC             | **Yo'q**                           | Bor                                |
| Takrorlanuvchi bitim/operatsiya | **Yo'q** (qo'lda qayta kiritish)   | Shablon + oy nusxalash             |
| 1C integratsiyasi               | O'zi sozlay olmaydi                | Self-service mapper                |
| Oy yopish (close) jarayoni      | Yo'q                               | Checklist + davr qulfi             |
| Audit trail                     | Cheklangan                         | To'liq immutable                   |
| Mintaqa                         | Faqat RF                           | `region_pack` — UZ → global        |
| ОПиУ/kalendar narxi             | O'rta tarifdan                     | Bazaviy tarifda (differensiatsiya) |
| Onboarding                      | Og'ir, konsultant sotiladi         | 20 daqiqada birinchi hisobot       |

---

## 9. Hal qilinishi kerak bo'lgan ochiq savollar

1. **Buxgalteriya bilan munosabat.** UZ da MSB odatda 1C yoki autsors buxgalterga tayanadi. Biz 1C ni almashtirmaymiz — **ustiga qurilamiz**. Lekin agar mijozda 1C bo'lmasa (YaTT), biz yagona tizim bo'lamiz. Ikkala ssenariy ham qo'llab-quvvatlanishi kerak.
2. **Ombor.** Tannarx uchun ombor kerak. O'zimiz quramizmi (scope o'sadi) yoki faqat integratsiya (Billz, MySklad, 1C UT)? **Tavsiya: faza 1 da faqat integratsiya + soddalashtirilgan «o'rtacha tannarx» rejimi.**
3. **On-prem talabi.** Yirik UZ mijozlari on-prem so'rashi mumkin. Docker Compose bilan yetkazib berish imkoniyati arxitekturada saqlanadi.
4. **Til.** UI: o'zbek (lotin) + rus + ingliz. Rus tili UZ biznesida hali ham asosiy — **rus tilini birinchi klass qilib qo'ying**, faqat o'zbek bilan cheklanmang.

---

## 10. Bog'liq hujjatlar

- `prd.md` — mahsulot talablari, modullar, yo'l xaritasi
- `inventory.md` — ombor moduli va tannarx hisobi (I9 invarianti)
- `design-system.md` — vizual til, jadval standarti, ekranlar ro'yxati
- `../adr/` — qaytarish qimmat bo'lgan qarorlar jurnali
