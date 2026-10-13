# ADR-0002 — Sxema: `architecture.md` §2.4 eskizidan farqlar

Sana: 2026-08 · Holat: Qabul qilindi

## Kontekst

`architecture.md` §2.4 dagi DDL **eskiz** sifatida yozilgan. Uni bajarishga
urinilganda I1–I8 invariantlarini buzadigan yoki keyinchalik qimmatga tushadigan
bir nechta joy topildi. Quyida har bir farq va sababi.

## Qarorlar

### 1. `gl_account.org_id` — NOT NULL (eskizda nullable, `null = tizim shabloni`)

Nullable `org_id` I8 ga teshik ochadi: RLS siyosati `org_id is null` ni ham
o'tkazishi kerak bo'ladi, ya'ni umumiy qatorlar paydo bo'ladi. Bir ijarachi
umumiy qatorni o'zgartirsa — barchasiga ta'sir qiladi.

Hisoblar rejasi shabloni **kodda** (`region-packs`) turadi va onboarding paytida
har bir tashkilotga **nusxalanadi**. Natijada RLS siyosati bitta shaklga ega:
`org_id = current_org_id()`, istisnosiz.

### 2. `entry_date` → `accrual_date` + `cash_date`

I6 ikki sanani talab qiladi. Eskizda bitta `entry_date` bor edi.

- `accrual_date` — NOT NULL. Iqtisodiy hodisa qaysi davrga tegishli. ОПиУ shu
  sana bo'yicha, davr qulfi ham shu sanani tekshiradi.
- `cash_date` — nullable. Pul haqiqatan harakat qilgan sana. Sof nachisleniyeda
  NULL.

Sanalar **yozuv (entry)** darajasida, liniya darajasida emas: bitta biznes fakti
= bitta yozuv. Ekvayring kabi «pul keyinroq tushadi» ssenariysi ikkita alohida
yozuv (debitorka, keyin kesh), bitta yozuvning ikki sanasi emas.

### 3. `source_type` / `source_id` — yozuvda ham, liniyada ham

`CLAUDE.md` I3 «har bir `journal_line` da» deydi, `architecture.md` §2.4 esa
`journal_entry` da ko'rsatadi. CLAUDE.md ustun turadi, lekin ikkalasi ham
saqlanadi: liniyadagi nusxa drill-down indeksini `join`siz ishlatishga imkon
beradi (`journal_line_org_source_idx`), yozuvdagisi «bitta yozuv = bitta manba
hujjat» ma'nosini saqlaydi. Nusxani `packages/ledger` yozadi — qo'lda emas.

### 4. `idempotency_key` qo'shildi

Eskizda yo'q edi, lekin posting engine idempotent bo'lishi shart (bank
ko'chirmasi qayta yuklanganda dublikat yozuv paydo bo'lmasligi kerak).
`unique (org_id, idempotency_key)` — NULL lar Postgres'da o'zaro farqli, ya'ni
kalitsiz yozuvlar cheklanmaydi.

### 5. Postgres `enum` emas, `text` + `CHECK`

`ALTER TYPE ... ADD VALUE` drizzle-kit migratsiyani o'rab turgan tranzaksiya
ichida ishlamaydi. Bu lug'at har bir modul qo'shilganda o'sadi (ombor yangi
`entry kind` lar keltiradi). `CHECK` cheklovi tranzaksiya ichida erkin
o'zgaradi. TS tomonda tiplar `$type<...>()` orqali baribir qattiq.

### 6. `FORCE ROW LEVEL SECURITY`

Faqat `ENABLE` yetarli emas: jadval **egasi** siyosatni chetlab o'tadi. Migratsiya
va ilova ko'pincha aynan shu rol ostida ulanadi, ya'ni RLS jimgina ishlamay
turadi. `FORCE` buni yopadi. Superuser baribir chetlab o'tadi — shu sababli
testlar `SET ROLE fincore_app` bilan ishlaydi.

### 7. Kompozit tashqi kalitlar `(id, org_id)`

Har bir o'lcham ustuni `(dimension_id, org_id)` bo'yicha bog'lanadi. Natijada
bir ijarachining liniyasi boshqa ijarachining moddasiga/hisobiga ko'rsata
olmaydi — ilova qatlamidagi xatolik ham buni buza olmaydi.

### 8. `fx_rate` — ijarachiga bog'langan

Eskizda `(date, from, to, rate, source)`. Global jadval qilib qoldirilsa, qo'lda
override bir ijarachidan boshqasiga oqib o'tadi va I8 ga istisno kerak bo'ladi.
`org_id` NOT NULL. `from`/`to` — SQL kalit so'zlari, shuning uchun
`base_currency`/`quote_currency`.

### 9. I4 va `reversed_by_id` — bitta aniq istisno

I4 «yozuv o'zgartirilmaydi» deydi, lekin `reversed_by_id` ni to'ldirish —
UPDATE. Ziddiyat aniq nomlangan istisno bilan hal qilindi:

- `journal_entry` ustidagi trigger **faqat** `reversed_by_id` ning
  `NULL → qiymat` o'tishiga ruxsat beradi; qolgan har bir ustun o'zgarsa —
  `FI004`. Ikkinchi marta storno — `FI004`.
- Storno yozuvining o'zi `reverses_id` ni **insert paytida** oladi, ya'ni u
  butunlay o'zgarmas.
- `journal_line` va `audit_log` — hech qanday UPDATE/DELETE yo'q.

Muqobil: `reversed_by_id` ni umuman olib tashlab, faqat `reverses_id` qoldirish
(daftar 100% append-only bo'lardi). Rad etildi, chunki CLAUDE.md I4 aynan shu
ustunni nomlaydi va «bu yozuv stornolanganmi?» so'rovi eng ko'p ishlatiladigan
so'rov — uni har safar teskari qidiruv bilan hisoblash qimmat.

### 10. Rol yaratish migratsiyadan chiqarildi

`CREATE ROLE` uchun `CREATEROLE` kerak; sxema egasi rolida odatda u yo'q.
`fincore_app` roli `docker/initdb/01-roles.sql` da yaratiladi (klaster
initsializatsiyasida, superuser ostida). Migratsiya faqat `GRANT` qiladi va rol
yo'q bo'lsa **baland ovozda yiqiladi** — jim o'tib ketmaydi, aks holda RLS
testlanmay qoladi.

### 11. `app_user` — ijarachiga bog'lanmagan

Bitta odam bir nechta tashkilotga a'zo bo'lishi mumkin, shuning uchun `app_user`
da `org_id` yo'q va RLS yoqilmagan. I8 «har bir **tenant-scoped** jadval» deydi —
`app_user` unday emas. Kirish huquqi `membership` orqali ifodalanadi.

## Oqibatlar

Ijobiy: RLS siyosati bitta shaklda, istisnosiz. Ijarachilararo havola
strukturaviy jihatdan imkonsiz. Storno yo'li yagona va tekshiriladigan.

Salbiy: hisoblar rejasi har bir tashkilotga nusxalanadi (ko'proq qator, lekin
onboarding baribir shablon nusxalaydi). `source_type` ikki joyda — ledger uni
sinxron yozishi shart.

## Ko'rib chiqilgan alternativalar

Eskizni o'zgarishsiz bajarish — I8 ga ikkita teshik (`gl_account.org_id`,
global `fx_rate`) va I6 ni qo'llab-quvvatlamaydigan bitta sana qoldirardi.
Ledger'ni faqat ilova qatlamida himoyalash — CLAUDE.md §2 buni to'g'ridan-to'g'ri
rad etadi.
