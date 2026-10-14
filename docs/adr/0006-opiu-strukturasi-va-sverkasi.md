# ADR-0006 — ОПиУ strukturasi: `article.flow_type` boshqaradi, kapital isbotlaydi

Sana: 2026-10 · Holat: Qabul qilindi

## Kontekst

Arxitektura §7.2 dagi ОПиУ — bu majburiy buxgalteriya hisoboti emas. Bu
boshqaruv hisoboti, va uning butun ma'nosi marja zanjirida:

```
Tushum − Sotish tannarxi      = Yalpi foyda
       − O'zgaruvchan xarajat  = Marjinal foyda
       − Doimiy xarajat        = EBITDA
       ± EBITDA'dan keyingi blok = Sof foyda
       − dividend / egasi olgani = Davr uchun taqsimlanmagan
```

Buni qurish uchun ikkita qaror kerak bo'ldi.

**1. O'zgaruvchan/doimiy bo'linish qaydan keladi.** `gl_account.role` hisobning
**nima ekanligini** aytadi (`expense`), lekin hajm bilan **qanday
tutishini** aytmaydi. Ijara ham, xomashyo qadoqlashi ham `expense`; biri doimiy,
biri o'zgaruvchan. Bu bo'linish — xarajat haqidagi **boshqaruv qarori**, va
ayni bir GL hisobi turli bizneslarda ikki xil xarajatni ko'tarishi mumkin.

**2. Hisobot to'g'riligini qanday bilamiz.** «Xarajat hisoblarining yig'indisi»
bo'lgan ОПиУ'ni tekshirish mumkin emas. Fintablo'ning struktur nuqsoni aynan
shu: har hisobot o'z alohida agregatsiyasi, va uni hech narsaga bog'lab
tekshirib bo'lmaydi.

## Qaror

### Bo'linish hisobda emas, `article.flow_type` da yashaydi

`flow_type` (`revenue | cogs | opex_variable | opex_fixed | below_ebitda |
below_net_profit | financing | investing | transfer`) — bu **moddaning**
xususiyati, ya'ni foydalanuvchi har satrga o'zi beradigan boshqaruv
klassifikatori. `packages/reports/src/pnl/structure.ts` dagi `PNL` har bir satr
qaysi rollarni va qaysi flow type'larni egallashini **ma'lumot sifatida**
e'lon qiladi.

Qabul qilingan natijalar:

- Foydalanuvchi xarajatni o'zgaruvchandan doimiyga **moddani tahrirlab**
  o'tkazadi — migratsiya ham, daftarga tegish ham kerak emas. Daftar faktni
  yozadi; modda esa o'sha fakt haqidagi boshqaruv qarashini yozadi.
- Qayta klassifikatsiya o'tgan davrlarni ham qayta hisoblaydi. Boshqaruv
  hisoboti uchun bu **to'g'ri**, majburiy hisobot uchun esa noto'g'ri — bu esa
  majburiy hisobot emas.

### Klassifikatsiyalanmagan satr bor, jimgina tushib qolish yo'q

`opexUnclassified` — bu «hammasini ushlab qoluvchi» satr: moddasining flow
type'i o'zgaruvchan yoki doimiy satrlar tomonidan egallanmagan har qanday
`expense` satri (moddasi butunlay yo'q satrlar ham) shu yerga tushadi. Bu uch
tilda nomi bo'lgan ko'rinadigan satr.

Muqobil variant — faqat ma'lum flow type'larni mos ko'rish — xarajatning
EBITDA'dan jimgina tushib qolishini bildiradi. Pulni ovozsiz yo'qotadigan
hisobot xunuk satr ko'rsatadiganidan yomonroq, shuning uchun bu filtr emas,
satr. `matches()` property-test bilan tekshirilgan: har bir flow type uchta
xarajat satri orasida **aynan bir marta** taqsimlanadi.

### Sof foyda kapital harakatiga qarshi isbotlanadi

`reconcilePnl` har bir funksional valyuta uchun tekshiradi:

```
ΔKapital = sof foyda + ustav kapitali + o'tgan davr foydasi − olingan mablag'
```

Noldan farqli har qanday qoldiq — bu yuqoridagi xato, va shu sifatda xabar
qilinadi. ОПиУ'da hech qanday «plug» satri ham, yaxlitlashni to'g'rilovchi satri
ham yo'q; marjalar har o'qishda hisoblanadi va hech qachon saqlanmaydi.

Bu hisobot topshirig'ida ayniyat «sof foyda = ΔKapital − dividendlar» deb
berilgan edi. Bu faqat davrda kapitalga boshqa hech narsa tegmaganda to'g'ri.
Birinchi ishga tushirish qoldiq sifatida **aynan seed'ning kirish
`retained_earnings` summasini** qaytardi: kirish qoldig'i kapitalni kreditlaydi,
lekin u davr foydasi emas. Shu sababli yana ikki had:

- `contributions` — `share_capital` harakati (kiritilgan kapital foyda emas);
- `broughtForward` — `retained_earnings` harakati, ya'ni o'tgan davr foydasi,
  u kirish qoldig'i sifatida kelsa ham, davr yopilishi sifatida kelsa ham.

Bularni bitta «kapitalning boshqa harakati» ga qo'shib yubormasdan **alohida
nomlangan hadlar** sifatida saqlash — ataylab: qoldiq noldan farq qilganda, shu
to'rt had qaysi tomonga qarash kerakligini aytadi.

### Taqqoslash davri kalendarni biladi

`priorPeriod` to'liq oylardan iborat oraliq uchun oldingi kalendar oy, chorak
yoki yilni qaytaradi, boshqa holatda esa teng uzunlikdagi oynani. Sof kun
sanog'i qoidasi martning taqqoslamasini 29 yanvarga qo'yadi — arifmetik
jihatdan himoyalanadigan, hisobotda esa foydasiz. Aniq oyna kerak bo'lsa,
chaqiruvchi `compareTo` ni o'zi beradi.

## Rad etilgan muqobillar

- **`gl_account` da `is_variable` bayrog'i.** Hisoblar rejasini har bir xarajat
  hisobini doimiy va o'zgaruvchan egizaklarga ko'paytirishga majbur qiladi, va
  klassifikatsiyani region-pack masalasiga aylantiradi — holbuki u har bir
  biznesning o'z qarori.
- **`journal_line` da flow type.** Daftarda hisobot shaklini belgilovchi
  nullable ustun degani, buni CLAUDE.md §9 taqiqlaydi; bundan tashqari boshqaruv
  qarashini provodka vaqtida muzlatib qo'yardi.
- **Davr uchun saqlangan `net_profit` raqami.** Ikkinchi haqiqat manbai. ОПиУ —
  proyeksiya; u qayta hisoblanadi, va sverka aynan shuni xavfsiz qiladi.

## Bu yerda ataylab hal qilinmagan

Budjet ustunlari (plan/fakt), umumxarajatni taqsimlash uchun
`kind = 'allocation'` provodka generatori, va davr yopilishi oylik yoki yillik
bo'lishi. Yopilish qarori `broughtForward` ga ta'sir qiladi va davr yopilishi
ADR'iga qoldirildi.
