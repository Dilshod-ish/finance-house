# ADR-0005 — `gl_account.role`: hisobot guruhlashi bazada

Sana: 2026-10 · Holat: Qabul qilindi

## Kontekst

Balans hisoboti hisoblarni satrlarga guruhlashi kerak: «Pul», «Debitorka»,
«Zaxira», «Asosiy vositalar», «Kreditorka», «Kreditlar», «Kapital»
(arxitektura §7.3). Buning uchun har bir hisobning **nima ekanligini** bilish
kerak.

`gl_account.type` (asset / liability / equity / income / expense) yetarli emas:
u faqat sinfni aytadi. «Bu aktiv» — balans satrini aniqlamaydi.

Hisob kodlari (`1010`, `2200`) ham yaramaydi: ular region-pack ma'lumoti, va
CLAUDE.md §4 bo'yicha paketdan tashqarida hech kim ularni nomlamasligi kerak.

## Qaror

`GlAccountRole` lug'ati (26 rol) `@fincore/shared` da, va **`gl_account.role`
ustuni bazada** (migratsiya `0003`).

### Nega paketda emas, bazada

Muqobil variant: hisobot `organization.region_pack` → paket → `code → role`
xaritasi orqali rolni o'qiydi. Rad etildi:

- **Foydalanuvchi o'z hisoblarini qo'shadi.** Paket shabloni ular haqida bilmaydi.
  Shablonda yo'q hisob har bir hisobotdan jimgina tushib qolardi.
- **Hisob kodi o'zgarishi mumkin.** Rol — hisobning xususiyati, kodining emas.
- **Hisobot paketga bog'lanib qolardi.** `packages/reports` → `region-packs`
  bog'liqligi keraksiz: hisobot mamlakatni bilmasligi kerak.

### Rol majburiy (`NOT NULL`)

`role` nullable bo'lsa, rolsiz hisob **hech bir hisobot satriga tushmaydi** —
ya'ni pul yo'qoladi, lekin bironta test yiqilmaydi. Shuning uchun:

- `GlAccountSeed.role` — majburiy (ilgari `| null` edi);
- `gl_account.role` — `NOT NULL` + `CHECK`;
- paket testi: har bir hisobda rol bor;
- smoke testi: `select count(*) from gl_account where role is null` = 0.

### `ROLE_ACCOUNT_TYPE` — rol va sinf muvofiqligi

Har bir rol qaysi sinfga tegishli bo'lishi shart (`loan` → `liability`,
`inventory` → `asset`). Rol bo'yicha guruhlaydigan balans `loan` majburiyat
ekanligiga **ishonishi** kerak; noto'g'ri belgilangan hisob pulni balansning
bir tomonidan ikkinchisiga jimgina ko'chiradi. Paket testi buni tekshiradi.

## Migratsiyada topilgan nuqson

Migratsiya `0003` ni ikki yo'lda sinaganda (CLAUDE.md §7.2) jiddiy xato
chiqdi.

`role` ustunini `NOT NULL` qilishdan oldin mavjud qatorlarni tekshiruvchi
qo'riqchi yozilgan edi: `select count(*) from gl_account where role is null`.
Mavjud hisobi bor bazada bu **0 qaytardi** va qo'riqchi o'tib ketdi.

Sabab: `gl_account` da `FORCE ROW LEVEL SECURITY` yoqilgan, ya'ni
`app.org_id` o'rnatilmagan bo'lsa **jadval egasi ham** birorta qatorni
ko'rmaydi. Migratsiya esa `app.org_id` siz ishlaydi — har bir tashkilotning
qatorini ko'rishi kerak.

Natija: qo'riqchi jim o'tib ketardi, keyin `SET NOT NULL` tushunarsiz
Postgres xatosi bilan yiqilardi. **Hech narsa ko'rmaydigan qo'riqchi —
qo'riqchi yo'qligidan yomonroq.**

Tuzatish: qo'riqchidan oldin `NO FORCE ROW LEVEL SECURITY`, keyin qaytarish.
Ikkalasi bitta tranzaksiyada, ya'ni qo'riqchi yiqilsa `NO FORCE` ham
qaytariladi — RLS hech qachon zaiflashib qolmaydi. Test bilan tasdiqlangan.

## Qo'shimcha: `5900` ikkiga bo'lindi

`5900` «Soliqlar va kurs farqi» deb nomlangan edi, ya'ni bitta hisob ikki
narsani saqlardi. ОПиУ da (arxitektura §7.2) «Soliqlar» va «Kurs farqi» —
**alohida satrlar**, ya'ni rol bo'yicha guruhlash imkonsiz edi.

Endi: `5800` → `tax_expense`, `5900` → `fx_difference`.

## Boshlang'ich qoldiqlar

Seed'ga `kind='opening'` yozuvlari qo'shildi (har bir yuridik shaxsga bitta).
Ularsiz seed'da kapital **nol** edi — ya'ni barcha aktivlar faqat tushumdan
kelgan bo'lib chiqardi. Bu faqat noldan boshlagan biznes uchun to'g'ri.

## Hali qabul qilinmagan qaror

**Davr yopish** (`kind='closing'`): oyma-oy yozilsinmi, yillikmi, yoki joriy
davr natijasi hisobot vaqtida hisoblanaversinmi? Bu buxgalteriya traktovkasi
savoli (CLAUDE.md §10) va balansning aniq strukturasiga bog'liq — egasi
balans shablonini berganda hal qilinadi.

Hozirgi holat: joriy davr natijasi hisobot vaqtida hisoblanadi
(`Aktivlar = Majburiyat + Kapital + (Daromad − Xarajat)`), smoke testi shu
tenglamani tekshiradi.

## Oqibatlar

Ijobiy: balans va ОПиУ ni qurish uchun sxema tayyor; rolsiz hisob imkonsiz;
hisobot region-paketga bog'lanmaydi.

Salbiy: yangi hisob qo'shgan foydalanuvchi rol tanlashi shart — onboarding'da
bu UI savolga aylanadi. Migratsiya mavjud bazada qo'lda backfill talab qiladi
(hozircha deployment yo'q, shuning uchun amalda ta'sir qilmaydi).
