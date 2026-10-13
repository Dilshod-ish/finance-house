# ADR-0004 — Seed alohida paketda, `packages/db` ichida emas

Sana: 2026-09 · Holat: Qabul qilindi

## Kontekst

`CLAUDE.md` §4 `packages/db` ni «Drizzle sxema, migratsiyalar, **seed'lar**, RLS
siyosatlari» deb ta'riflaydi. Lekin §4 shu bilan birga: «faqat `ledger`
`journal_entry` / `journal_line` ga yozadi».

Demo seed ~200 ta yozuv yaratadi, ya'ni `@fincore/ledger` ga muhtoj.
`packages/ledger` esa `@fincore/db` ga bog'liq. Seed'ni `packages/db` ichiga
qo'yish `db → ledger → db` siklini yaratadi — Turborepo buni build grafida
aniqlaydi va yiqiladi (STEP 1 da `eslint-config` ↔ `eslint-plugin` bilan aynan
shu yuz bergan edi).

Seed'ni faqat ma'lumotnoma jadvallariga cheklab, jurnal yozuvlarini
to'g'ridan-to'g'ri SQL bilan yozish ham mumkin edi — lekin bu §4 ning eng muhim
qoidasini buzadi va posting engine'ni chetlab o'tadi, ya'ni I1 ni tekshirmagan
ma'lumot paydo bo'ladi.

## Qaror

Yangi workspace paketi: **`packages/seed`**.

```
packages/seed → ledger → db
              → region-packs/uz → region-packs/_contract → shared
```

Sikl yo'q. `packages/db` sxema, migratsiya va RLS bilan cheklanadi;
`packages/seed` demo ma'lumotni **posting engine orqali** yozadi, ya'ni har bir
yozuv I1, I2 va I4 ni haqiqiy yo'l bilan bosib o'tadi.

Root skriptlari o'zgarmadi: `pnpm db:seed`, `pnpm db:reset`.

## Seed nima qiladi

- Bitta tashkilot, ikkita yuridik shaxs, to'rtta pul hisobi (ikki valyutada).
- Uch oy, ~203 ta yozuv: nachisleniye va to'lov, oylik, valyutadagi tushum,
  hisoblar orasida o'tkazma.
- Bitta `fx_revaluation` (oy oxiri qayta baholash) va bitta storno.
- Ikkinchi tashkilot — RLS ni **haqiqiy ma'lumot ustida** tekshirish uchun.

## Determinizm

Seed sobit urug'li PRNG ishlatadi. Determinizm testi ikkita mustaqil bazaga
seed qilib, moliyaviy mazmun digest'ini solishtiradi (surrogat kalitlarsiz).

Bu test birinchi ishga tushirishda **haqiqiy nuqson topdi**: `reverseEntry`
storno yozuviga `Reversal of <uuid>` matnini yozardi, ya'ni foydalanuvchi
ko'radigan matnga surrogat kalit sizib chiqardi va mazmun har safar boshqacha
bo'lardi. Endi `description` sukut bo'yicha `null`: bog'lanish `reverses_id`
da, sababi `reversal_reason` da — ikkalasi ham matndan ko'ra qat'iyroq
ma'lumot.

## Region-paketga bog'liqlik

Seed **birorta o'zbekcha atamani nomlamaydi**. U «QQS rejimidagi kompaniya» va
«aylanma rejimidagi yakka tadbirkor» deb so'raydi, paket esa ularning nomini
hal qiladi:

```ts
companyProfile(pack, date); // isIndividual === false + vat stavkasi bor rejim
soleTraderProfile(pack, date); // isIndividual === true  + turnover stavkasi bor rejim
glCodeForRole(pack, 'receivable');
glCodeForCash(pack, 'bank');
foreignCurrency(pack); // pack.currency.common[0]
```

Buning uchun kontraktga ikkita qo'shimcha kiritildi:

1. `GlAccountSeed.role` (`cash | receivable | payable | payroll_payable |
revenue | expense | fx_difference | retained_earnings`) va cash hisoblar
   uchun `accountKind`. Bu I5 ga ham kerak: pul oqimi qaysi hisoblardan
   yig'ilishini paket aytadi, kod emas.
2. `currency.common` — mamlakatda odatda ishlatiladigan chet el valyutalari.
   Aks holda seed `'USD'` ni qattiq yozishga majbur bo'lardi, bu esa
   CLAUDE.md §9 ga zid.

Natijada `ru` yoki `kz` paketi qo'shilganda **aynan shu seed** ishlaydi.

## Oqibatlar

Ijobiy: sikl yo'q; seed ma'lumoti posting engine tekshiruvidan o'tadi;
region-neytral.

Salbiy: `CLAUDE.md` §4 dagi paket ro'yxati endi to'liq emas — `packages/seed`
u yerda yozilmagan. Ro'yxatni yangilash kerak.
