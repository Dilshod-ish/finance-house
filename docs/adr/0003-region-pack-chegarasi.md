# ADR-0003 — Region-pack chegarasi: konfiguratsiya, xulq-atvor emas

Sana: 2026-08 · Holat: Qabul qilindi

## Kontekst

`architecture.md` §4 dagi `RegionPack` interfeysida `bankConnectors`,
`statementParsers`, `eInvoiceProvider`, `taxAuthorityConnector` maydonlari bor.
Ular nomiga qaraganda **xulq-atvor** (funksiyalar) kutiladi. Lekin
`packages/importers` va integratsiya paketlari hali yozilmagan, ya'ni ularning
API sini hozir o'ylab topish — keyin qayta yoziladigan stub yaratish demak.

Ayni paytda CLAUDE.md §4 aniq talab qo'yadi: region-packs'dan tashqarida
hech kim soliq stavkasini, bank nomini yoki huquqiy shaklni nomlamasligi kerak.

## Qarorlar

### 1. Deskriptorlar, implementatsiyalar emas

Paket **nima mavjudligini** e'lon qiladi (`id`, `nameKey`, `bankCode`,
`format`, `priority`), bajariladigan kod esa o'z paketida yashaydi va shu `id`
bo'yicha topiladi. Ya'ni `statementParsers` — parser funksiyalari emas, parser
**tavsiflari**. Bu chegarani buzmaydi va soxta API yaratmaydi.

### 2. Domen lug'atlari `@fincore/shared` ga ko'chirildi

`FlowType`, `GlAccountType`, `Side`, `AccountKind` va boshqalar avval
`@fincore/db` da edi. Region-pack CoA shablonini tavsiflash uchun ularga
muhtoj — lekin `region-packs → db` bog'liqligi teskari yo'nalish: paket
konfiguratsiya, db esa saqlash. Lug'atlar biznesni tavsiflaydi, saqlashni emas,
shuning uchun `shared` ga ko'chdi. `db` ularni qayta eksport qiladi, ya'ni
mavjud import joylari o'zgarmadi.

### 3. `it_park` rejimi qo'shilmadi

`architecture.md` uni «imtiyozli rejim (konfiguratsiyalanadi)» deb ataydi va
hech qanday stavka bermaydi. CLAUDE.md §10: tasdiqlab bo'lmaydigan soliq
qoidasini **o'ylab topish mumkin emas**. Rejim yo'q — stavkalar ma'lum
bo'lganda qo'shiladi. Bo'sh stavkali rejim taklif qilish undan ham yomon:
foydalanuvchi uni tanlaydi va noto'g'ri hisob oladi.

### 4. Barcha stavkalar sana bo'yicha versiyalangan

Har bir `TaxRateVersion` da `effectiveFrom`/`effectiveTo`. `ratesEffectiveOn`
sof funksiya, sanani chaqiruvchi beradi. Ya'ni 2026 hisobotini 2027 stavkalari
bilan qayta hisoblash imkonsiz.

Aylanma chegarasi (`turnoverCeiling`) ham shu yerda — «1 mlrd radar» funksiyasi
uchun. U pul summasi, shuning uchun aniq decimal string, `number` emas (I7).

### 5. Chegara manba skani bilan majburlanadi

`packages/region-packs/_contract/test/boundary.test.ts` butun repo bo'ylab
`.ts/.js/.sql` fayllarni o'qiydi va taqiqlangan atamalarni qidiradi: soliq
rejimi kodlari, soliq atamalari, huquqiy shakllar, bank nomlari, mamlakat
provayderlari. `packages/region-packs/**` bundan mustasno.

Ikkita nuqta:

- Moslashtirish **butun token** bo'yicha (lookaround), `includes` emas — aks
  holda `payme` provayderi `payment_terms_days` ustunini bayroqlaydi. Buni
  birinchi ishga tushirishda topdim.
- Ikkinchi test skanning **o'zi ishlashini** tekshiradi: paket ichida kamida 10
  ta atama topilishi shart. Aks holda yashil natija «kod toza» emas, «matcher
  buzuq» degani bo'lardi.

Skan birinchi ishga tushirishda haqiqiy buzilish topdi:
`packages/db/src/testing-fixtures.ts` fixture'da `'MCHJ'` va `'qqs_foyda'`
qattiq yozilgan edi. Fixture'dan olib tashlandi — ikkala ustun ham nullable.

### 6. Nima **taqiqlanmadi**

Mamlakat kodi (`'UZ'`) va valyuta kodi (`'UZS'`) skanga kiritilmadi. Ular
ijarachi **ma'lumoti** (`organization.country_code`, `base_currency`), paket
xulq-atvori emas: har bir tashkilot o'z qiymatini onboarding'da tanlaydi.
Soliq stavkasi va bank nomi esa — paketning ishi.

Agar bu chiziq juda yumshoq deb topilsa, `boundary.test.ts` dagi `FORBIDDEN`
ro'yxatiga qo'shish bir qatorlik o'zgarish.

## Oqibatlar

Ijobiy: `ru`/`kz` paketi qo'shish uchun yangi katalog va yangi konfiguratsiya
kifoya. Chegara CI da har PR da tekshiriladi.

Salbiy: skan matnli — atama ro'yxati qo'lda yuritiladi. Yangi bank yoki
provayder qo'shilganda ro'yxatga ham qo'shilishi kerak.
