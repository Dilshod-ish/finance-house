# FinCore — PRD / Texnik Topshiriq

> Ishlab chiqish jamoasi uchun. Arxitektura qarorlari — `architecture.md` da.
> Versiya: 1.0 · Bozor: O'zbekiston → MDH → global

---

## 1. Mahsulot pozitsiyasi

### 1.1 Muammo

O'zbekiston MSB egasi hozir shu holatda:

- Pul harakati — bank ilovasida, Excel'da va boshida.
- Foyda — «kassadagi pul» bilan chalkashtiriladi. Ombor to'la, kassa bo'sh — nega tushunarsiz.
- Buxgalter soliq hisobotini beradi, lekin **boshqaruv uchun raqam bermaydi** (u boshqa maqsad uchun ishlaydi).
- Bir necha MCHJ/YaTT bor — umumiy manzara yo'q.
- Kassa uzilishi **sodir bo'lgandan keyin** bilinadi.
- Qaysi yo'nalish/loyiha foyda keltirayotgani noma'lum.

### 1.2 Pozitsiya bayonoti

> Egalar uchun **boshqaruv hisobi operatsion tizimi**: bank ko'chirmasi, hisob-faktura va bitimni bir kunlik ishga aylantiradi va ertaga nima bo'lishini bugun ko'rsatadi. Buxgalteriya o'rniga emas — **buxgalteriya bermaydigan javoblarni** beradi.

### 1.3 Farqlanish (3 ta ustun)

1. **Ishonch.** Har bir raqam 3 ta bosishda original hujjatgacha ochiladi. Balans avtomatik teng keladi. Hisobotlar o'zaro sverka qilinadi.
2. **Kelajak, o'tmish emas.** Kassa kalendari, stsenariyli moliyaviy model, «1 mlrd chegarasi radari» — raqobatchilarda yo'q.
3. **O'zbekiston nativligi.** So'm+valyuta, UZ soliq rejimlari, Didox/Payme/Click, bank ko'chirmalarining real formatlari, Telegram, o'zbek+rus til.

### 1.4 Nishon segmentlar (faza 1)

| Segment                            | Xarakteristika                                            | Nega ular                                                           |
| ---------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------- |
| **A. O'sayotgan MSB**              | 5–50 xodim, oborot 300 mln – 5 mlrd so'm/oy, 1–3 yurshaxs | Asosiy bozor. Excel'dan o'sib chiqqan                               |
| **B. Loyihaviy biznes**            | Qurilish, agentlik, ta'mirlash, IT-autsors                | Bitim/loyiha rentabelligi — o'tkir og'riq, to'lashga tayyor         |
| **C. Chakana/onlayn**              | Do'kon tarmog'i, marketplace sotuvchisi                   | Ekvayring + ombor + yo'nalish tahlili                               |
| **D. Autsors moliyachi/buxgalter** | 5–30 mijoz yuritadi                                       | **Kanal.** Ular olib kelsa, CAC tushadi. Multi-client kabinet kerak |

**Faza 1 uchun ustuvor: A va B.** D — 6-oydan boshlab, lekin arxitekturada `advisor_workspace` joyi qoldiriladi.

### 1.5 Personalar

| Persona                   | Nima qiladi                                 | Nima kerak                                             | Muvaffaqiyat mezoni                     |
| ------------------------- | ------------------------------------------- | ------------------------------------------------------ | --------------------------------------- |
| **Egasi / Direktor**      | Kuniga 5 daqiqa qaraydi, qaror qabul qiladi | Bosh ekran, mobil, Telegram dayjest, ogohlantirish     | «Bugun tinchmanmi?» — 30 soniyada javob |
| **Moliyachi / Buxgalter** | Kuniga 30–60 daqiqa yuritadi                | Tez kiritish, ommaviy operatsiyalar, sverka, oy yopish | Oy yopish 3 kundan 4 soatgacha          |
| **Operator / Assistent**  | Operatsiya taqsimlaydi, hujjat yuklaydi     | Sodda navbat interfeysi, klaviatura bilan ishlash      | Kuniga 200 operatsiya, 15 daqiqa        |
| **Yo'nalish rahbari**     | Byudjetini boshqaradi                       | Faqat o'z yo'nalishi, plan/fakt, to'lov arizasi        | Limitdan chiqmaslik                     |

---

## 2. Rollar va ruxsatlar matritsasi

| Imkoniyat                      | owner | cfo | accountant  | operator | head_of_direction | viewer | auditor |
| ------------------------------ | :---: | :-: | :---------: | :------: | :---------------: | :----: | :-----: |
| Barcha hisobotlar              |  ✅   | ✅  |     ✅      |    ➖    |  o'z yo'nalishi   |   ✅   |   ✅    |
| Operatsiya kiritish/tahrirlash |  ✅   | ✅  |     ✅      |    ✅    |        ➖         |   ➖   |   ➖    |
| Oylik moduli                   |  ✅   | ✅  |   opsiya    |    ➖    |        ➖         |   ➖   |   ✅    |
| Davr yopish/ochish             |  ✅   | ✅  |     ➖      |    ➖    |        ➖         |   ➖   |   ➖    |
| Byudjet tasdiqlash             |  ✅   | ✅  |     ➖      |    ➖    |        ➖         |   ➖   |   ➖    |
| To'lov arizasi yaratish        |  ✅   | ✅  |     ✅      |    ✅    |        ✅         |   ➖   |   ➖    |
| To'lov arizasi tasdiqlash      |  ✅   | ✅  | limit bilan |    ➖    |    limit bilan    |   ➖   |   ➖    |
| Sozlamalar, integratsiya, API  |  ✅   | ✅  |     ➖      |    ➖    |        ➖         |   ➖   |   ➖    |
| Foydalanuvchi boshqarish       |  ✅   | ➖  |     ➖      |    ➖    |        ➖         |   ➖   |   ➖    |
| Audit log                      |  ✅   | ✅  |     ➖      |    ➖    |        ➖         |   ➖   |   ✅    |

---

## 3. Funksional talablar modul bo'yicha

Har bir modul: **US** = user story, **AC** = qabul mezoni.

### M1. Onboarding

Ushbu modul mahsulotning eng muhim qismi. Fintablo shu yerda yiqiladi («og'ir, ortiqcha yuklangan»).

**US-1.1** Yangi foydalanuvchi sifatida men ro'yxatdan o'tgandan **20 daqiqa ichida** birinchi haqiqiy hisobotni ko'rishni xohlayman.

**AC:**

- Sehrgar 5 qadam: (1) biznes turi va soha → (2) yuridik shaxs(lar) va soliq rejimi → (3) hisob raqamlar va boshlang'ich qoldiq → (4) bank ko'chirmasini yuklash (drag&drop) → (5) yo'nalishlar.
- Soha bo'yicha **tayyor moddalar shabloni** (qurilish / savdo / xizmat / ishlab chiqarish / onlayn-maktab / HoReCa) — 40–60 modda, tahrirlanadigan.
- Birinchi ko'chirma yuklangach, AI operatsiyalarning ≥70% ini avtomatik kategoriyalaydi; qolgani navbatga tushadi.
- 5-qadam oxirida foydalanuvchi **o'z real raqamlari bilan** ДДС hisobotini ko'radi.
- Har bir qadamni «keyinroq» deb o'tkazib yuborish mumkin; progress bar saqlanadi.

**US-1.2** Excel'dan ko'chayotgan foydalanuvchi sifatida tarixiy ma'lumotimni import qilishni xohlayman.
**AC:** universal CSV/XLSX importyor + ustunlarni **vizual mapping** + oldindan ko'rish + dublikat aniqlash + orqaga qaytarish (`import_batch` bekor qilish).

---

### M2. Hisoblar va operatsiyalar (ДДС yadrosi)

**US-2.1** Bank ko'chirmasini yuklab, operatsiyalarim avtomatik tushishini xohlayman.

**AC:**

- Qo'llab-quvvatlanadigan formatlar (UZ, P0): 1C-exchange `.txt`, `.xlsx`, `.csv`, bank PDF (OCR bilan).
- Kamida 6 ta yirik UZ bankining real ko'chirma formati testda qamrab olinadi.
- Dublikatlar `(account, date, amount, external_id/description-hash)` bo'yicha aniqlanadi va **avtomatik post qilinmaydi** — foydalanuvchiga ko'rsatiladi.
- Import `import_batch` sifatida yoziladi, bir bosishda to'liq bekor qilinadi.

**US-2.2** Operatsiyalarni tez taqsimlashni xohlayman.

**AC:**

- **Navbat rejimi (inbox):** taqsimlanmagan operatsiyalar ro'yxati, klaviatura bilan (↑↓ / Enter / modda qidiruv), 1 operatsiya ≤ 3 soniyada.
- **Qoidalar dvigateli:** `agar tavsif ~ "UZCARD KOMISSIYA" va hisob = X → modda = "Ekvayring komissiyasi", yo'nalish = "Chakana"`. Qoidalar tartiblanadi, retroaktiv qo'llanadi.
- AI taxmini ishonch foizi bilan ko'rsatiladi; qabul qilinsa qoidaga aylantirish taklif qilinadi.
- Ommaviy tahrirlash: tanlangan N operatsiyaga modda/yo'nalish/tag qo'yish.
- **Bo'lish (split):** bitta to'lovni bir necha modda/yo'nalishga bo'lish.

**US-2.3** Naqd pulni telefondan kiritishni xohlayman.
**AC:** Telegram bot: `-350000 taksi` → operatsiya; chek fotosi → OCR → tasdiqlash; `/qoldiq` → hisoblar qoldig'i; `/kun` → kunlik dayjest.

**US-2.4** Bir necha yuridik shaxs o'rtasidagi o'tkazmalar foyda sifatida ko'rinmasligini xohlayman.
**AC:** o'tkazma tipi avtomatik juftlashtiriladi (summa+sana+hisoblar), `flow_type=transfer`, konsolidatsiyada eliminatsiya qilinadi.

---

### M3. Bitimlar / Loyihalar

**US-3.1** Har bir bitim/loyihaning haqiqiy rentabelligini ko'rishni xohlayman.

**AC:**

- Bitim kartochkasi: mijoz, summa, bosqichlar, tushum rejasi, to'g'ridan-to'g'ri xarajatlar (xarid, ishbay ish haqi, subpudrat), marja va marja %.
- **Bosqichli tan olish:** qurilish uchun — bajarilgan ish akti bo'yicha tushum tan olinadi (pul emas).
- Plan/fakt bitim ichida: ДДС bo'yicha va Daromad/Xarajat bo'yicha ikkita tab.
- **Bitim shabloni + oydan-oyga nusxalash** _(Fintablo'dagi aniq shikoyat — biz hal qilamiz)_.
- Bitimning to'lanmagan qismi avtomatik **debitorkaga** tushadi va kassa kalendarida ko'rinadi.

**US-3.2** Uzun loyihalarda pul yetishmasligini oldindan bilishni xohlayman.
**AC:** loyiha bo'yicha kumulyativ pul oqimi grafigi; manfiy zonaga kirish sanasi va chuqurligi ko'rsatiladi.

---

### M4. Majburiyatlar (debitorka/kreditorka)

**US-4.1** Pul o'tmagan bo'lsa ham xarajat sodir bo'lgan oyga tushishini xohlayman.
**AC:** majburiyat (akt/EHF) yaratiladi → xarajat `accrual_date` bo'yicha ОПиУ ga tushadi; to'lov bo'lganda majburiyat yopiladi (qisman to'lov qo'llab-quvvatlanadi).

**US-4.2** Kim menga qancha qarzdorligini va men kimga qarzdorligimni ko'rishni xohlayman.
**AC:** debitorka/kreditorka reyestri, muddati o'tganlar bo'yicha **aging** (0–30 / 31–60 / 61–90 / 90+), kontragent kesimi, avtomatik eslatma (email/Telegram).

---

### M5. Oylik (Zarplata)

**AC:**

- Xodimlar spravochnigi: oklad, kategoriya (sotuv/ishlab chiqarish/ma'muriy → to'g'ridan-to'g'ri yoki bilvosita xarajat), yo'nalish.
- Hisoblash tiplari: oklad, ishbay (bitimga bog'lanadi), foiz/bonus, avans, ushlab qolish.
- **UZ soliqlari avtomatik:** JSHDS 12%, ijtimoiy soliq 12% (rejim bo'yicha) — `region_pack` konfiguratsiyasidan.
- Oylik vedomost → tasdiqlash → to'lov arizalari paketi → ОПиУ da ФОТ satrlari.
- Maosh ma'lumotlari alohida ruxsat bilan himoyalangan.

---

### M6. Soliqlar, Mol-mulk, Kreditlar

**Soliqlar:** rejim bo'yicha avtomatik nachisleniye kalendari; to'lov muddatlari kassa kalendariga tushadi; **«1 mlrd chegarasi radari»** (Hujjat 1, §4.1).

**Mol-mulk:** asosiy vosita kartochkasi, foydali xizmat muddati, amortizatsiya usuli (chiziqli MVP uchun), oylik avtomatik yozuv, yo'nalishga bog'lash.

**Kreditlar/lizing:** to'lov jadvali (annuitet/differensial), asosiy qarz = financing, foiz = xarajat; jadval kassa kalendariga tushadi.

---

### M7. Hisobotlar

#### 7.1 Pul oqimi (ДДС)

- Kesimlar: **Moddalar** / **Yo'nalishlar** / **Yo'nalish×Modda** / **Kontragentlar** / **Hisoblar**.
- Davr: kun/hafta/oy/kvartal/yil, ixtiyoriy diapazon.
- Ustunlar: davrlar; satrlar: iyerarxik moddalar (yig'iladi/yoyiladi).
- Har bir yacheykadan drill-down → operatsiyalar → manba.
- Operatsion/investitsion/moliyaviy oqimlarga bo'linish.
- Eksport: XLSX (formulalar bilan), PDF, CSV.

#### 7.2 Daromad va Xarajatlar (ОПиУ / P&L)

Standart struktura:

```
Tushum
− Sotilgan mahsulot tannarxi (COGS)
= Yalpi foyda                          → Yalpi marja %
− O'zgaruvchan xarajatlar
= Marjinal foyda                       → Marjinal daromadlilik %
− Doimiy xarajatlar
= EBITDA                               → EBITDA marjasi %
− Amortizatsiya
− Foizlar
− Soliqlar
+/− Kurs farqi, boshqa daromad/xarajat
= Sof foyda                            → Sof rentabellik (ROS) %
− Dividendlar / egasining chiqimlari
= Taqsimlanmagan foyda
```

**AC:** har bir satrda manba belgisi; plan ustuni; o'tgan davr bilan taqqoslash (Δ va %); yo'nalish kesimi; **«nega o'zgardi»** tugmasi — eng katta 5 ta drayverni ko'rsatadi.

#### 7.3 Balans

Aktivlar (pul, debitorka, zaxira, asosiy vositalar) / Passivlar (kreditorka, kreditlar, kapital, taqsimlanmagan foyda). Avtomatik teng. Har bir moddadan drill-down.

#### 7.4 Ko'rsatkichlar paneli (KPI)

Egaga mo'ljallangan bosh ekran — **eng ko'p ochiladigan sahifa**, shunga yarasha ishlanadi:

| Blok                   | Nima ko'rsatadi                                                                           |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| Pul                    | Hisoblardagi qoldiq + bugungi harakat + 30 kunlik prognoz chizig'i                        |
| Foyda                  | Joriy oy sof foyda, o'tgan oy bilan, plan bilan                                           |
| Rentabellik            | Yalpi / EBITDA / ROS marjalari, trend                                                     |
| Zaxira ko'rsatkichlari | ТБУ (bezubytochlik nuqtasi), moliyaviy xavfsizlik zaxirasi, «necha oy yashaymiz» (runway) |
| Oborot                 | Debitorka/kreditorka aylanishi, pul konvertatsiya sikli (CCC)                             |
| Ogohlantirishlar       | Kassa uzilishi xavfi, byudjetdan chiqish, muddati o'tgan qarz, anomaliya                  |

Har bir kartochka **bosiladi** va tegishli hisobotga olib boradi.

#### 7.5 Tekshiruv ekrani _(raqobatchilarda yo'q)_

Avtomatik sverkalar: `Sof foyda = ΔKapital − dividendlar`; `ΔPul (Balans) = Sof oqim (ДДС)`; taqsimlanmagan operatsiyalar soni; yopilmagan majburiyatlar; kurs farqi qayta baholanmagan hisoblar. **Yashil/qizil svetofor** — hisobotga ishonch darajasi.

---

### M8. Rejalashtirish

**8.1 To'lov kalendari.** Kunlik gorizontal lenta: kutilayotgan tushumlar (bitimlar + debitorka), rejalashtirilgan to'lovlar (arizalar + oylik + soliq + kredit) → **har kun uchun prognoz qoldiq**. Manfiy kunlar qizil. «Nima qilsam?» — kassa uzilishini yopish ssenariylari (to'lovni surish, debitorkani tezlashtirish, overdraft).

**8.2 BDDS / BDR (byudjet).** Modda×yo'nalish×oy bo'yicha reja; plan/fakt/Δ/%; limitdan chiqishda ogohlantirish; byudjet versiyalari va tasdiqlash.

**8.3 Moliyaviy model / stsenariylar** _(Fintablo'da yo'q — asosiy differensiator)_

- Drayverlar: mijozlar soni, o'rtacha chek, konversiya, narx, xarajat o'sishi, xodimlar soni, valyuta kursi.
- 3 stsenariy: pessimistik / bazaviy / optimistik; yonma-yon taqqoslash.
- 12–36 oylik prognoz ОПиУ + ДДС + Balans.
- **Sezgirlik tahlili:** «kurs 10% oshsa, sof foyda −X%».
- Faktik ma'lumot kelganda model avtomatik qayta kalibrlanadi; **prognoz aniqligi** ko'rsatkichi.

**8.4 To'lovga arizalar.** Yaratish → marshrut bo'yicha tasdiqlash (summa limitlari) → to'lov → operatsiya bilan avtomatik bog'lanish. Telegram orqali tasdiqlash.

---

### M9. Unit-ekonomika va analitika _(Fintablo'da yo'q)_

- Metrik konstruktori: CAC, LTV, LTV/CAC, ROMI, o'rtacha chek, marja/birlik, breakeven hajmi.
- Kanal/kampaniya kesimi (marketing xarajati moddalari + tushum manbayi).
- **ABC/XYZ tahlil:** mahsulot va mijozlar bo'yicha.
- Kohortalar (abonent/ta'lim biznesi uchun).

---

### M10. Oy yopish (Close) _(Fintablo'da yo'q)_

Checklist: barcha operatsiyalar taqsimlangan → ko'chirmalar yuklangan → majburiyatlar kiritilgan → oylik hisoblangan → amortizatsiya → soliqlar → kurs qayta baholash → bilvosita xarajat taqsimoti → sverkalar yashil → **davrni qulflash**. Har bir punktda mas'ul va status. Qulflangandan keyin faqat storno.

---

### M11. Integratsiyalar va API

- Ochiq REST API + OpenAPI spetsifikatsiyasi (kalit sozlamalarda generatsiya qilinadi).
- Webhooklar: operatsiya yaratildi, kassa uzilishi xavfi, byudjetdan chiqish, ariza tasdiqlandi.
- Integratsiyalar ro'yxati va prioriteti — Hujjat 1, §4.1.
- **1C mapper self-service:** foydalanuvchi 1C hujjat tiplarini o'z moddalariga o'zi bog'laydi _(Fintablo'dagi shikoyat)_.

---

## 4. Nofunksional talablar

| Kategoriya       | Talab                                                                                                                |
| ---------------- | -------------------------------------------------------------------------------------------------------------------- |
| Ishlash          | Hisobot sahifasi p95 < 1.5 s (2 yillik ma'lumot, 200k operatsiya). Dashboard < 1 s. Import: 10k qator < 30 s (fonda) |
| Aniqlik          | Barcha pul hisob-kitoblari `numeric`/decimal. Yaxlitlash faqat ko'rsatishda. `float` **taqiqlangan**                 |
| Mavjudlik        | 99.9% uptime; kunlik backup + PITR; RPO ≤ 15 daq, RTO ≤ 2 soat                                                       |
| Xavfsizlik       | RLS, MFA, audit log, at-rest shifrlash, UZ ma'lumot lokalizatsiyasi                                                  |
| i18n             | O'zbek (lotin) + rus + ingliz. **Rus tili birinchi klass.** Kirill o'zbek — keyingi faza                             |
| Mobil            | Responsive web MVP da; native ilova fazа 3 (egasi uchun read-only + tasdiqlash)                                      |
| Brauzer          | Oxirgi 2 versiya Chrome/Safari/Edge/Firefox                                                                          |
| Kirish qulayligi | WCAG 2.1 AA maqsad; klaviatura bilan to'liq navigatsiya (operator ish oqimi uchun majburiy)                          |
| Kuzatuv          | Tuzilgan loglar, tracing, biznes metrikalari (import muvaffaqiyati, AI aniqligi)                                     |

---

## 5. Yo'l xaritasi

| Faza                       | Muddat      | Qamrov                                                                                                                                                | Chiqish mezoni                                              |
| -------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **F0 — Poydevor**          | 0–6 hafta   | Monorepo, DB sxema, ledger dvigateli + invariantlar, auth/RBAC/RLS, `region_pack` skeleti, dizayn tizimi                                              | Ledger 100% test qoplamasi; sintetik ma'lumotda balans teng |
| **F1 — MVP (yopiq beta)**  | 6–16 hafta  | Onboarding, hisoblar, operatsiyalar+navbat+qoidalar, import (6 bank), ДДС, to'lov kalendari, Telegram bot, KPI panelining pul bloki                   | 10 pilot mijoz, 20 daq'da birinchi hisobot                  |
| **F2 — Yadro**             | 16–28 hafta | Majburiyatlar, bitimlar, oylik, mol-mulk, kreditlar, soliqlar, **ОПиУ**, **Balans**, Tekshiruv ekrani, oy yopish                                      | Pilot mijozda oy to'liq yopiladi; sverkalar yashil          |
| **F3 — To'liq**            | 28–40 hafta | BDDS/BDR, to'lov arizalari, moliyaviy model/stsenariylar, unit-ekonomika, ABC, konsolidatsiya+eliminatsiya, EHF/ekvayring integratsiyalari, ochiq API | 100 to'lovchi mijoz                                         |
| **F4 — AI + Multi-region** | 40–56 hafta | AI to'liq qatlami, narrativ hisobotlar, anomaliya, `ru`/`kz` region paketlari, autsors moliyachi kabineti, mobil ilova                                | 2-mamlakatga chiqish                                        |

**Kritik yo'l:** F0 dagi ledger dvigateli. Agar u noto'g'ri qurilsa, F2 da qayta yozish kerak bo'ladi va loyiha o'ladi.

---

## 6. Tariflash (dastlabki gipoteza)

Fintablo'ning xatosi — ОПиУ va to'lov kalendarini o'rta tarifga yashirish. Biz teskarisini qilamiz: **qiymat bazaviy tarifda, hajm va murakkablik uchun pul olinadi.**

| Tarif       | Kim uchun         | Ichida                                                                                          | Narx gipotezasi (UZS/oy) |
| ----------- | ----------------- | ----------------------------------------------------------------------------------------------- | ------------------------ |
| **Start**   | YaTT, mikro       | 1 yurshaxs, 2 foydalanuvchi, ДДС + **ОПиУ** + kalendar + KPI                                    | 290 000                  |
| **Biznes**  | O'sayotgan MSB    | 3 yurshaxs, 7 foydalanuvchi, + bitimlar, majburiyatlar, oylik, Balans, byudjet                  | 690 000                  |
| **Pro**     | O'rta biznes      | cheklanmagan yurshaxs/foydalanuvchi, + moliyaviy model, unit-ekonomika, API, konsolidatsiya, AI | 1 490 000                |
| **Advisor** | Autsors moliyachi | Multi-client kabinet, mijoz boshiga narx                                                        | shartnoma                |

Bepul: 14 kun to'liq (karta talab qilinmaydi). Yillik to'lovda −20%.

> Narxlar gipoteza — pilot bosqichida 20 ta suhbat bilan validatsiya qilinadi (Van Westendorp).

---

## 7. Muvaffaqiyat metrikalari

| Bosqich     | Metrika                         | Maqsad                      |
| ----------- | ------------------------------- | --------------------------- |
| Aktivatsiya | Ro'yxatdan → birinchi hisobot   | ≤ 20 daqiqa, ≥ 60%          |
| Aktivatsiya | 7 kun ichida ko'chirma yuklagan | ≥ 70%                       |
| Odat        | Haftada ≥ 3 kun kirish (egasi)  | ≥ 50%                       |
| Qiymat      | Oy yopish vaqti                 | −70%                        |
| Sifat       | AI avtokategoriyalash aniqligi  | ≥ 85% (2 oydan keyin ≥ 93%) |
| Biznes      | Logo retention 12 oy            | ≥ 85%                       |
| Biznes      | NRR                             | ≥ 110%                      |

---

## 8. Xavflar

| Xavf                                                      | Ta'sir     | Yumshatish                                                                              |
| --------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------- |
| Bank integratsiyalari yo'qligi (UZ da ochiq banking zaif) | Yuqori     | Parser-first: 10+ bank formatiga robust parser + OCR; bank API'lari bonus sifatida      |
| Ledger murakkabligi jamoani sekinlashtiradi               | Yuqori     | F0 da yakka mas'ul senior; ledger paketiga qattiq API chegarasi; property-based testlar |
| Onboarding og'irligi (Fintablo kasalligi)                 | Yuqori     | 20 daqiqa qoidasi — release blokerи; har sprintda foydalanuvchi testi                   |
| Foydalanuvchi buxgalter bilan chalkashtiradi              | O'rta      | Pozitsiyalash: «buxgalteriya emas»; 1C bilan yonma-yon ishlash ssenariysi               |
| Soliq qonuni yiliga o'zgaradi                             | O'rta      | Stavkalar — versiyalangan konfiguratsiya, kodda emas                                    |
| Ma'lumot lokalizatsiyasi talabi                           | O'rta      | Birinchi kundan region bo'yicha ajratilgan deployment                                   |
| AI noto'g'ri raqam ko'rsatadi → ishonch yo'qoladi         | **Kritik** | AI hech qachon raqam hisoblamaydi; faqat tanlaydi va izohlaydi                          |

---

## 9. Qamrovdan tashqarida (v1)

Ochiq aytiladi, keyin bahs bo'lmasligi uchun:

- Rasmiy buxgalteriya va soliq hisobotini topshirish
- Ish haqi kartalarga to'lash (bank bilan)
- CRM funksiyalari (faqat integratsiya)
- IFRS/konsolidatsiya standartlari bo'yicha rasmiy hisobot
- Native mobil ilova (F4 da)

---

## 10. Qamrov o'zgarishi jurnali

**2026-08 · Ombor.** Dastlab ombor qamrovdan tashqarida edi (faqat integratsiya).
Qaror o'zgardi: omborni o'zimiz quramiz. Sabab — tannarx qo'lda kiritilganda
ОПиУ hech qachon Balans bilan to'liq mos kelmaydi va mahsulotning asosiy va'dasi
(«har bir raqamga ishonch») buziladi. Batafsil: `inventory.md`.
Ta'siri: F2 oxiri / F3 boshi, +6–8 hafta.

**2026-08 · Autsors moliyachi kanali.** D-segment (autsors buxgalter/moliyachi)
F4 dan F1–F2 ga ko'chirilishi mumkin, agar shunday tarmoq bo'lsa. Qaror kutilmoqda.
