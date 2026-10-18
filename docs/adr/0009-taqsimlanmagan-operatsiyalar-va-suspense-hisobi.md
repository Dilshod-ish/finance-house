# ADR-0009 — Taqsimlanmagan operatsiya: `suspense` hisobi, daftardan tashqarida saqlash emas

Sana: 2026-10 · Holat: Qabul qilindi

## Kontekst

M2 (operatsiyalar moduli) bank ko'chirmasini yuklab, qatorlarni daftarga
o'tkazadi. Lekin yuklash paytida qatorlarning katta qismida **modda yo'q**:
PRD US-2.2 shuni «navbat rejimi» (inbox) deb ataydi va odam keyin tayinlaydi.
AI taxmini ham, qoidalar dvigateli ham keyinroq keladi.

Shu bilan birga PRD M1 AC aniq va'da beradi: **5-qadam oxirida foydalanuvchi
o'z real raqamlari bilan ДДС hisobotini ko'radi** — ya'ni ko'chirma yuklangan
zahoti, inbox bo'shatilishini kutmasdan.

Ikkisi birga bitta savolni tug'diradi: modda tayinlanmagan pul harakati
daftarga **qachon** tushadi va **nimaga qarshi** tushadi?

## Hal qilinishi kerak bo'lgan savol

Har bir provodkaning ikki tomoni bo'ladi (I1). Pul tomoni ma'lum — bank
hisobi. Ikkinchi tomon nima bo'ladi, modda hali yo'q bo'lsa?

### Variant A — modda tayinlanmaguncha daftarga tushmaydi

`cash_operation` yoziladi, provodka esa kutadi.

Rad etildi. Birinchidan, M1 va'dasini buzadi: yuklashdan keyingi ДДС
**chala** bo'ladi, bank qoldig'i hisobotga to'g'ri kelmaydi. Ikkinchidan,
hisobot to'liq bo'lishi uchun kimdir `cash_operation` dan ham o'qishi kerak
bo'ladi — bu CLAUDE.md §1 taqiqlagan ikkinchi haqiqat manbayi.

### Variant B — «boshqa daromad / boshqa xarajat» moddasiga tushadi

Kirim → `other_income`, chiqim → `expense` (umumiy satr).

Rad etildi. ДДС to'g'ri bo'ladi, lekin **ОПиУ yolg'on gapiradi**: tasniflanmagan
tushum darhol daromadga, demak foydaga aylanadi. Boshqaruv hisobida marjani
shishirish — eng qimmat xato turi. Keyinchalik modda tayinlanganda raqam
daromaddan chiqib ketadi va o'tgan oyning foydasi «o'zgaradi».

### Variant C (qabul qilindi) — `suspense` roli: kliring hisobi

Yangi GL roli `suspense`, `uz` paketida **1900-hisob**
(«Taqsimlanmagan operatsiyalar»). Yuklangan qator **darhol** post qiladi:

```
Kirim:  D 1010 (bank)  / C 1900 (suspense)
Chiqim: D 1900 (suspense) / C 1010 (bank)
```

Modda tayinlanganda — I4 bo'yicha **mutatsiya yo'q**: asl yozuv
`reverseEntry` bilan qaytariladi va modda GL hisobi bilan yangi yozuv
post qiladi. `cash_operation.article_id` yangilanadi; `cash_operation`
operatsion jadval, daftar emas, shuning uchun uni yangilash I4 ga tegmaydi.

## Natijalar

**Nega bu to'g'ri:**

- **ДДС birinchi daqiqadan to'liq.** Pul haqiqatan harakat qilgan — bank
  qoldig'i inbox bo'shatilishini kutmaydi. Hisobot `openingCash + netFlow`
  bo'yicha yopiladi.
- **ОПиУ tegilmaydi.** `suspense` — aktiv roli, `ROLE_ACCOUNT_TYPE` da
  `asset`. ОПиУ faqat income/expense rollarini tanlaydi, demak tasniflanmagan
  pul foydaga **hech qachon** tushmaydi. Marja halol qoladi.
- **Hajmi ko'rinadi va o'lchanadi.** ДДС da alohida `unassigned` bo'limi
  bor (`cf.unassigned.in` / `.out`), balansda aylanma aktivlar ichida
  alohida satr (`assets.current.unclassified`). Ya'ni egasi «hisobotimning
  qancha qismi hali tushunarsiz» degan savolga raqam bilan javob oladi —
  bu inbox'ni bo'shatishga undaydigan yagona halol signal.
- **Oy yopishda to'siq.** `suspense` qoldig'i nolga teng bo'lmasa, davr
  yopilmaydi — I9 (ombor) qanday to'siq bo'lsa, shunday. (To'siqning o'zi
  M10 da ulanadi; rol va satr shu yerda tayyorlandi.)

**Nega `unassigned` ДДС da alohida bo'lim, operatsion emas:**

`SECTION_BY_CONTRA_ROLE` da `suspense: 'unassigned'`. Uni `operating` ga
qo'yish — taxmin qilish, va u uchta haqiqiy bo'limni xato qiladi. Alohida
bo'lim sof pul oqimiga **kiradi** (`netFlow` komponenti), chunki pul
haqiqatan o'tgan; lekin o'z satrida turadi, chunki u hali tasnif emas.

**Bahosi:**

- `GlAccountRole` ga rol qo'shildi → `gl_account_role_ck` migratsiyada
  (0004) qayta yozildi. Teskari migratsiya rolni **yo'qotishdan bosh
  tortadi** (`FI006`), agar biror hisob uni tashib turgan bo'lsa.
- Golden fayllar: balansga 1, ДДС ga 3 nol satr qo'shildi. Birorta mavjud
  raqam o'zgarmadi — `cf.netFlow` ham o'sha-o'sha.
- `cf.unassigned*`, `bs.assets.unclassified`, `gl.1900` — uchta tilga
  qo'shildi (§7.6).

**Nimadan qaytish qiyin:** rolni olib tashlash uchun uni tashiydigan barcha
hisoblarni va ularga tushgan provodkalarni qayta tasniflash kerak. Shuning
uchun bu ADR.

## Alternativa sifatida ko'rilgan va rad etilgan

**`money_in_transit` ni ishlatish.** U boshqa narsa: hisoblar orasida
yo'ldagi pul, va ДДС da `transfer` bo'limiga tushadi. Tasniflanmagan tushumni
o'tkazma deb ko'rsatish — sof pul oqimidan chiqarib tashlash, ya'ni bank
qoldig'i yana to'g'ri kelmaydi.

**`suspense` ni passiv (liability) qilish.** Kirim uni kreditlaydi, demak
tabiiy qoldig'i kredit — passiv ko'rinishi mantiqiyroqdek. Lekin chiqim uni
debetlaydi, va qoldiq ikki tomonga ham yuradi. Kliring hisobini bir tomonga
mahkamlash o'rniga aktivlar ichida ko'rsatib, manfiy qoldiqqa yo'l qo'yildi —
`accumulated_depreciation` bilan bir xil yondashuv.
