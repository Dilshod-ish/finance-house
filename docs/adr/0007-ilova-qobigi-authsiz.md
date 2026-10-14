# ADR-0007 — Ilova qobig‘i: auth hali yo‘q, lekin u production‘ga sizib o‘tmaydi

Sana: 2026-10 · Holat: Qabul qilindi

## Kontekst

Balans va ОПиУ tayyor edi, lekin ularni faqat testlar chaqira olardi. Birinchi
vertikal kesim `apps/api` + `packages/ui` + `apps/web` ni qo‘shadi.

Autentifikatsiya bu kesimga kiritilmadi (qaror egasiniki, keyin qo‘shiladi).
Ammo har bir RLS siyosati `app.org_id` ni o‘qiydi, ya’ni **har bir so‘rov qaysi
tenant nomidan kelayotganini aytishi shart**. Auth yo‘q bo‘lsa, buni nimadir
aytishi kerak — va aynan shu joy xavfli: «vaqtincha» yechim production‘ga
sizib o‘tsa, kimdir org id ni topsa, butun daftarni o‘qiydi.

CLAUDE.md §9 buni taqiqlaydi: «"Temporary" mock data in a code path that can
reach production.»

## Qaror

### `OrgContext` interfeysi, va uni **yarata olmaydigan** qo‘rg‘on

`OrgContext` — bitta metodli interfeys: so‘rov sarlavhalaridan tenant id ni
chiqaradi yoki `null` qaytaradi. Bugungi yagona implementatsiya
`headerOrgContext()` — `x-fincore-org` sarlavhasini o‘qiydi va chaqiruvchiga
to‘liq ishonadi.

Muhimi — uni kim yaratishi:

```ts
export function resolveOrgContext(env: Env): OrgContext {
  if (env.nodeEnv === 'production') throw new Error('… refused in production …');
  if (!env.insecureOrgHeader) throw new Error('… set FINCORE_INSECURE_ORG_HEADER=1 …');
  return headerOrgContext();
}
```

Ikki shart: `NODE_ENV !== 'production'` **va** aniq `FINCORE_INSECURE_ORG_HEADER=1`.
Shartlar bajarilmasa — qaytarilmaydi, **tashlanadi**, va NestJS ishga
tushmaydi. Ya’ni production‘ga haqiqiy resolver‘siz deploy qilish mumkin emas:
ilova jim ishlamaydi, balandovoz xato bilan to‘xtaydi.

Auth qo‘shilganda u o‘z `OrgContext` ini ro‘yxatdan o‘tkazadi va API‘ning
qolgan kodi tegilmaydi. Bu — kengaytirish nuqtasi, yamoq emas.

### `OrgGuard` da zaxira tenant yo‘q

Tenant aniqlanmasa — 401. Standart org, «birinchisini olamiz», `?? demoOrg`
kabi hech narsa yo‘q. Zaxira tenant — bu jimgina boshqa birovning daftarini
ko‘rsatish yo‘li.

## JSON‘da pul — string

```json
{ "amount": "1709505612.5000", "currency": "UZS" }
```

`JSON.parse` JSON raqamini `double` ga aylantiradi. `numeric(20,4)` qiymat shu
yerda jimgina yaxlitlanadi — va bu **mijozda** sodir bo‘ladi, ya’ni hech bir
server testi uni ushlamaydi. I7 shuning uchun sim ustida ham amal qiladi.

Test buni **xom payload** ustidan tekshiradi (`/"amount":-?\d/` topilmasligi
kerak), chunki `JSON.parse` dan keyin kech bo‘ladi.

## Drill-down rollarini mijoz tanlamaydi

Mijoz satr kodini beradi (`netProfit`), rollar serverda strukturadan olinadi.
Aks holda mijoz hisobot unga hech qachon ko‘rsatmagan rollarni so‘rab,
o‘qiydigan ma’lumot doirasini kengaytira olardi.

Noma’lum kod **tekshiriladi**, `try/catch` bilan ushlanmaydi: ushlangan
bo‘lsa, resolver ichidagi haqiqiy xato mijozning xatosi bo‘lib ko‘rinardi
(§9 — moliyaviy yo‘lda xatoni yutmaslik).

## `@fincore/reports` ikkiga bo‘lindi

Veb ilova faqat satr nomlarini kerak qiladi, lekin paketning asosiy kirish
nuqtasi so‘rov qatlamini ham eksport qilardi — u esa `@fincore/db` va
`postgres` ni brauzer to‘plamiga tortadi. Endi:

- `@fincore/reports` — hamma narsa (server uchun);
- `@fincore/reports/structure` — strukturalar, builderlar, nomlar. Sof, hech
  qanday ma’lumotlar bazasi yo‘q.

Bu shunchaki bundle hajmi masalasi emas: ma’lumotlar bazasi mijozi brauzer
kodiga umuman tushmasligi kerak.

## Server/client chegarasi: funksiya o‘tmaydi

Birinchi urinishda server komponenti client komponentiga `translate`
funksiyasini uzatdi va ilova ishlamadi. To‘g‘ri yechim — **tilni** uzatish,
tarjimonni client o‘zi yasaydi. Xabarlar jadvali — oddiy satrlar, ikkala
tomonda ham mavjud.

## Rad etilgan muqobillar

- **`?org=` so‘rov parametri.** Sarlavhadan ham yomon: brauzer tarixida,
  loglarda va referrer‘da qoladi.
- **`.env` dagi bitta qattiq tenant, API‘da.** Ikki tenantni bir vaqtda
  sinab bo‘lmaydi, ya’ni RLS‘ni haqiqiy HTTP orqali tekshirib bo‘lmaydi.
- **Darhol to‘liq auth.** Egasi buni keyinga qoldirdi; qo‘rg‘on esa buni
  xavfsiz qilib turadi.

## Bu yerda hal qilinmagan

Rollar va ruxsatlar (arxitektura §6 dagi 7 rol), obyekt darajasidagi cheklov,
audit log yozuvi, API kalitlari. Hammasi `OrgContext` haqiqiy bo‘lgandan keyin.
