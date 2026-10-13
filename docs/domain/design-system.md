# Dizayn tizimi

> Har qanday UI ishidan oldin o'qiladi. Ekranlar ro'yxati §10 da.

## 7. Tamoyillar

1. **Raqam — qahramon, chrome — sokin.** Interfeys diqqatni raqamdan tortmaydi. Rang, ikonka va chegara faqat ma'no tashiganda ishlatiladi.
2. **Har bir raqam bosiladi.** Agar biror son ko'rinib turib, uni ochib bo'lmasa — bu dizayn xatosi.
3. **Zichlik moliyachi uchun, bo'shliq egasi uchun.** Ikkita zichlik rejimi: `comfortable` (bosh ekran, egasi) va `compact` (jadvallar, operator).
4. **Rang gapiradi, bezamaydi.** Qizil — pul yo'qotish yoki xavf. Sariq — e'tibor. Yashil — reja bajarildi. Boshqa hamma joyda neytral.
5. **Klaviatura — birinchi darajali.** Kuniga 200 operatsiya kiritadigan odam sichqonchaga tegmasligi kerak.

## 8. Tokenlar

**Rang (semantik):**

| Rol | Ishlatilishi |
|---|---|
| `text-primary` / `secondary` / `muted` | Matn iyerarxiyasi. Uch daraja, ko'p emas |
| `danger` | Manfiy qoldiq, kassa uzilishi, kamomad, muddati o'tgan qarz |
| `warning` | Chegaraga yaqinlashish, kechikish, tasdiq kutilmoqda |
| `success` | Reja bajarildi, davr yopildi, sverka o'tdi |
| `accent` | Havola, tanlangan holat, birlamchi harakat |

Kategorial ranglar (yo'nalishlar, moddalar diagrammalarida) alohida palitradan olinadi va semantik ranglar bilan aralashtirilmaydi.

**Tipografika:** bitta oila (Inter yoki shunga o'xshash, kirill va lotin to'liq). O'lchamlar: 24 (asosiy raqam) / 18 (sarlavha) / 16 (asosiy matn) / 14 (jadval) / 13 (yordamchi) / 12 (izoh). Faqat ikkita qalinlik: 400 va 500.

**Raqamlar uchun majburiy qoidalar** — moliyaviy interfeysning yarmi shu:

- `font-variant-numeric: tabular-nums` — hamma joyda. Aks holda ustundagi raqamlar sakraydi.
- Uchlik ajratgich: bo'shliq (`412 380 000`), o'nlik: vergul.
- Jadvalda raqamlar **o'ngga** tekislanadi, matn chapga.
- Manfiy son: minus belgisi va `danger` rangi. Qavs ishlatilmaydi — MDH foydalanuvchisi buni o'qimaydi.
- Katta sonlar qisqartiriladi: `412,4 mln`, `1,84 mlrd`. To'liq son hover'da ko'rsatiladi.
- Valyuta belgisi ustun sarlavhasida, har bir yacheykada emas.
- Nol va bo'sh farqlanadi: `0` — nol, `—` — ma'lumot yo'q.

**Bo'shliq va shakl:** 4px setka. Radius: 8px boshqaruvlar, 12px kartochkalar. Chegara 0,5px. Soya yo'q, gradient yo'q.

## 9. Jadval standarti

Jadval — bu mahsulotning asosiy komponenti, shuning uchun alohida qoidalar:

- Sarlavha qatori yopishqoq (sticky), birinchi ustun ham gorizontal skrollda yopishqoq.
- Iyerarxik satrlar: yig'ish/yoyish holati saqlanadi.
- Yig'indi qatorlari vizual ajratiladi (fon, 500 qalinlik), lekin bo'yalmaydi.
- Har bir yacheyka bosiladi → drill-down paneli o'ngdan ochiladi (modal emas, chunki kontekst yo'qolmasligi kerak).
- Virtualizatsiya 200+ qatordan boshlab.
- Ustunlarni sozlash, tartiblash, filtr — saqlanadigan ko'rinishlar (saved views).
- Eksport: XLSX (formulalar va formatlash bilan), CSV, PDF.

## 10. Ekranlar ro'yxati

Dizayn qilinishi kerak bo'lgan to'liq inventar. Ikkitasini yuqorida ko'rsatdim, qolganini bosqichma-bosqich beraman.

| # | Ekran | Faza | Murakkablik |
|---|---|---|---|
| 1 | Bosh ekran (egasi) | F1 | ✅ tayyor |
| 2 | Bitim kartochkasi | F2 | ✅ tayyor |
| 3 | Onboarding sehrgari (5 qadam) | F1 | Yuqori — mahsulot taqdiri shunga bog'liq |
| 4 | Operatsiyalar navbati (klaviatura rejimi) | F1 | Yuqori |
| 5 | Hisoblar va qoldiqlar | F1 | Past |
| 6 | Import: fayl → mapping → oldindan ko'rish | F1 | O'rta |
| 7 | ДДС hisoboti (jadval + drill-down paneli) | F1 | Yuqori |
| 8 | To'lov kalendari (kunlik lenta) | F1 | Yuqori |
| 9 | ОПиУ (manba belgilari bilan) | F2 | Yuqori |
| 10 | Balans | F2 | O'rta |
| 11 | Tekshiruv ekrani (svetofor) | F2 | O'rta |
| 12 | Oy yopish checklist'i | F2 | O'rta |
| 13 | Debitorka/kreditorka reyestri (aging) | F2 | O'rta |
| 14 | Oylik vedomosti | F2 | O'rta |
| 15 | Ombor: qoldiqlar va harakat | F3 | O'rta |
| 16 | Ombor: kirim hujjati (EHF dan) | F3 | O'rta |
| 17 | Inventarizatsiya varaqasi | F3 | Past |
| 18 | Byudjet (plan/fakt setkasi) | F3 | Yuqori |
| 19 | Moliyaviy model (drayverlar + 3 stsenariy) | F3 | Yuqori |
| 20 | Unit-ekonomika va ABC | F3 | O'rta |
| 21 | To'lov arizalari va tasdiqlash | F3 | O'rta |
| 22 | Sozlamalar: moddalar, yo'nalishlar, qoidalar | F1–F2 | O'rta |
| 23 | Foydalanuvchilar va ruxsatlar | F2 | Past |
| 24 | Mobil: egasi ko'rinishi | F4 | O'rta |
| 25 | Telegram bot dialoglari | F1 | Past |

## 11. Holatlar (states) — dizaynda unutiladigan joy

Har bir ekran uchun to'rtta holat majburiy:

- **Bo'sh:** «Hali ma'lumot yo'q» emas, balki nima qilish kerakligini aytadigan taklif va tugma.
- **Yuklanmoqda:** skelet, spinner emas. Raqam joyi oldindan band qilinadi — layout sakramasligi kerak.
- **Xato:** nima bo'ldi va nima qilish kerak. Texnik xabar ko'rsatilmaydi.
- **To'liq emas:** eng muhimi. Agar 62 ta operatsiya taqsimlanmagan bo'lsa, hisobot **ko'rsatiladi, lekin ogohlantirish bilan**. Yashirilmaydi va jim ham qolinmaydi.