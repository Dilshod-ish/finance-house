# ADR-0008 — ДДС: tasnif kontr-hisobdan keladi, modda esa kesim

Sana: 2026-10 · Holat: Qabul qilindi

## Kontekst

ДДС (pul oqimi, arxitektura §7.1) — ОПиУ bilan bir xil daftar ustidagi
boshqa proyeksiya. Farqni ikki invariant qiladi:

- **I5** — pul oqimi faqat `bank | cash | card | ewallet | acquiring` turidagi
  hisobga tegadigan satrlardan hisoblanadi;
- **I6** — pul harakati `cash_date` bilan sanaladi, `accrual_date` bilan emas.

Hisob-faktura yanvarda yoziladi, pul fevralda keladi. ОПиУ uni yanvarda,
ДДС fevralda ko'rsatadi, va **ikkalasi ham to'g'ri**. Mahsulotning butun
ma'nosi shunda.

## Hal qilinishi kerak bo'lgan savol

Har bir pul harakati qaysi bo'limga (operatsion / investitsion / moliyaviy)
tushishini nima belgilaydi?

Seed'dagi holat buni aniq ko'rsatdi. Pul yozuvlarining bir qismida modda bor
(to'g'ridan-to'g'ri sotuv: `D pul / C tushum`, modda tushum satrida), bir
qismida **umuman yo'q** (hisob-faktura to'lovi: `D pul / C debitorka` —
modda o'sha paytdagi boshqa yozuvda qolgan).

Ya'ni moddaga tayanadigan tasnif pul harakatlarining bir qismini
«taqsimlanmagan» deb qoldirardi.

## Qaror

### Bo'limni **kontr-hisobning roli** belgilaydi

Ikki yozuvli daftarda «pul nima uchun harakat qildi» degan savolning javobi —
yozuvning **ikkinchi tomonidagi hisob**. `D pul / C tushum` — tushumdan.
`D pul / C debitorka` — mijoz qarzini yopdi. `D pul / C kredit` — qarz olindi.

`SECTION_BY_CONTRA_ROLE` — 26 ta rolning har biri uchun bitta satr. Test har
bir rol xaritada borligini tekshiradi, ya'ni **tasniflanmagan pul harakati
bo'lishi mumkin emas**. Hisobot har doim to'liq.

### Modda — bo'lim ichidagi kesim, uning asosi emas

PRD §7.1 kesimlarni talab qiladi: moddalar / yo'nalishlar / kontragentlar /
hisoblar. Bular **ixtiyoriy o'lchamlar**: bor bo'lsa, satrni yoyadi; yo'q
bo'lsa, harakat `—` bucket'iga tushadi, lekin **hisobotdan tushib
qolmaydi**.

Modda avval pul satridan, keyin kontr-satrdan o'qiladi. To'g'ridan-to'g'ri
sotuvda modda kontr-satrda turadi va qo'shimcha ma'lumot kiritish kerak emas;
hisob-faktura to'lovida esa foydalanuvchi keyinchalik pul operatsiyasiga o'z
moddasini qo'ya oladi va u ustun bo'ladi.

### Bir to'lov bir nechta satrni yopsa — proporsional taqsimlash

Yozuvning qarama-qarshi tomonida bir nechta satr bo'lsa, pul summasi ular
o'rtasida **o'z summalariga mutanosib** bo'linadi. Oddiy ikki satrli yozuvda
bu to'liq summani yagona kontr-satrga beradi — ya'ni aniq. Uch hisob-fakturani
yopadigan bitta to'lov uchta harakatga bo'linadi, bu esa standart o'qish.

### O'tkazmalar: ko'rsatiladi, lekin sof oqimga kirmaydi

O'z hisoblari o'rtasidagi o'tkazma (bankdan kassaga) — ikkala satri ham pul
satri. Tashkilot darajasida bu **bir pulning ikki marta sanalishi**, shuning
uchun `netFlow` dan chiqarib tashlanadi va alohida bo'limda ko'rsatiladi,
nolga teng bo'lib.

Lekin **yakuniy pulga qo'shiladi**. Qarama-qarshilik emas: bitta hisob
kesimida bankdan chiqqan pul haqiqatan chiqqan, va o'sha hisobning hisoboti
uning qoldig'i bilan tugashi shart. Buni test topdi — bitta hisob bo'yicha
sverka 11 063 979 ga og'di.

### «Pulsiz o'zgarishlar» satri — plug emas, bevosita hisoblanadi

Valyuta qayta baholash bank hisobining qoldig'ini o'zgartiradi, lekin pul
harakat qilmaydi (`cash_date` — null). Kirish qoldig'i ham shunday.

Bunday o'zgarishlar bo'lmasa, «boshiga + oqim = oxiriga» ayniyati bajarilmas
va farqni **plug bilan yopishga** to'g'ri kelardi — buni CLAUDE.md §1 to'g'ridan
to'g'ri taqiqlaydi. Shuning uchun alohida satr bor va u **daftardan bevosita
o'qiladi**: `cash_date is null` bo'lgan, pul hisobiga tegadigan satrlar
yig'indisi. Ikki raqam orasidagi farq sifatida emas.

Natijada:

```
Davr boshiga pul + sof oqim + o'tkazmalar + pulsiz o'zgarishlar = Davr oxiriga pul
```

va yakuniy pul **daftarning pul hisoblari qoldig'iga aynan teng** —
`reconcileCashFlow` buni har safar tekshiradi (PRD §7.5 ning ikkinchi
sverkasi).

## Bitta munozarali treatment

**To'langan foizlar** `operating` ga qo'yildi, `financing` ga emas. IAS 7
ikkalasiga ham ruxsat beradi. Sabab: egasi «operatsion pul» ni «biznes o'zini
tutgandan keyin nima qoldirdi» deb o'qiydi, qarzga xizmat ko'rsatish esa
tutishning bir qismi.

Bu **bitta satrlik o'zgarish** (`SECTION_BY_CONTRA_ROLE.interest_expense`), va
hozirgi ma'lumotda bironta raqamni o'zgartirmaydi — seed'da foiz to'lovi yo'q.
Boshqacha qaror qilinsa, shu satr almashtiriladi.

## Rad etilgan muqobillar

- **Faqat moddaga tayanish (Fintablo modeli).** Har bir bank operatsiyasiga
  modda qo'yilishini talab qiladi; qo'yilmagani «taqsimlanmagan» bo'lib
  qoladi va hisobot to'liq bo'lmaydi. Modda kesim sifatida saqlandi, lekin
  hisobotning to'liqligi unga bog'liq emas.
- **Pul satriga `article_id` ni majburiy qilish.** Sxema o'zgarishi va
  to'g'ridan-to'g'ri sotuvda ma'lumot takrorlanishi. Kerak emas: kontr-satr
  allaqachon aytadi.
- **Valyuta farqini oqimga kiritish.** I5/I6 ni buzadi: pul harakat qilmagan.

## Bu yerda hal qilinmagan

Kun/hafta ustunlari (hozir oy/chorak/yil), iyerarxik moddalar daraxti
(yig'ish/yoyish), eksport (XLSX/PDF/CSV), to'lov kalendari (PRD §8.1).
