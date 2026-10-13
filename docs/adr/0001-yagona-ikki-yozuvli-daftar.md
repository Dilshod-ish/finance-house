# ADR-0001 — Yagona ikki yozuvli daftar

Sana: 2026-08 · Holat: Qabul qilindi

## Kontekst

Referens raqobatchi (Fintablo) hisobotlarni modullardan yig'ma qilib tikadi:
pul oqimi operatsiyalardan, ОПиУ bitim + oylik + amortizatsiya + qo'lda
kiritishdan, Balans alohida mantiqdan. Oqibatlari: Balansni ishga tushirish
uchun sun'iy tenglashtirish kerak; hisobotlar orasidagi nomuvofiqlikni topib
bo'lmaydi; har bir yangi modul uchta hisobotga alohida ulanadi.

## Qaror

Har qanday moliyaviy fakt o'zgarmas `journal_entry` (ikki yozuv) ga aylanadi.
Pul oqimi, ОПиУ, Balans, to'lov kalendari, byudjet — hammasi shu yagona daftar
ustidan proyeksiya. `packages/ledger` — `journal_*` ga yozadigan yagona paket;
`packages/reports` faqat o'qiydi.

## Oqibatlar

Ijobiy: Balans avtomatik teng keladi, plug kerak emas. Hisobotlararo sverka
avtomatik. Yangi modul faqat journal generatori yozadi. To'liq audit trail.
Retroaktiv `as_of` so'rovlar mumkin.

Salbiy: boshlang'ich murakkablik yuqori — F0 da 6 haftalik ish, mahsulot
funksiyasi ko'rinmaydi. Buxgalteriya semantikasini biladigan senior kerak.
Har bir modul uchun hisoblar rejasiga to'g'ri joylashtirish talab qilinadi.

## Ko'rib chiqilgan alternativalar

Modul-bo'yicha agregatsiya (raqobatchi yondashuvi) — tezroq boshlanadi, lekin
F2 da qayta yozishga olib keladi. Faqat pul oqimi (single-entry) — MVP uchun
yetarli, ammo ОПиУ va Balans qo'shilganda butun yadro almashtiriladi.
