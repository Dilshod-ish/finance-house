# Claude Code promptlaridan foydalanish

`CLAUDE.md` prompt emas — u repo ildizida turadi va har sessiyada avtomatik
o'qiladi. Uni bu papkadagi fayllar bilan aralashtirmang.

## Tartib

| Sessiya       | Fayl                | Natija                                                 |
| ------------- | ------------------- | ------------------------------------------------------ |
| 1             | `01-bootstrap.md`   | Repo skeleti, sxema, ledger yadrosi, region-pack, seed |
| 2             | `02-slices.md` → C1 | Bank ko'chirmasi importi (uchidan uchiga)              |
| 3             | `02-slices.md` → C2 | Operatsiyalar navbati (UI)                             |
| 4             | `02-slices.md` → C3 | To'lov kalendari                                       |
| 5             | `02-slices.md` → C4 | ОПиУ                                                   |
| 6             | `02-slices.md` → C6 | Ombor va tannarx                                       |
| 7             | `02-slices.md` → C5 | AI qatlami                                             |
| har 2–3 hafta | `03-audits.md`      | D1, D2, D3 auditlari                                   |

## Qoidalar

- Bitta sessiya = bitta prompt. Yarim tugagan vertikalni tashlab keyingisiga o'tmang.
- Har qadamdan keyin test natijasini talab qiling. Promptlarda «paste the real
  output» ataylab yozilgan.
- Agent savol bersa — javob bering, taxmin qilishiga yo'l qo'ymang. Buxgalteriya
  semantikasidagi xato oylardan keyin chiqadi va qimmatga tushadi.
- Auditlarni o'tkazib yubormang: paket chegaralari sekin-asta buziladi.

1. **`CLAUDE.md` ni qisqartirmang.** Agent har sessiyada uni o'qiydi; invariantlar ro'yxati aynan shu yerda turgani uchun ishlaydi.
2. **Bir sessiya = bir vertikal.** «Hamma modulni yoz» degan prompt yarim-yorti kod beradi. C1–C5 alohida sessiyalarda.
3. **Har qadamdan keyin test natijasini talab qiling.** Promptlarda «paste the real output» bejiz emas — bu agentning tekshirmasdan «bajarildi» deyishini oldini oladi.
4. **D-promptlarni har 2–3 haftada qayta yuriting.** Chegaralar sekin-asta buziladi; muntazam audit bu jarayonni to'xtatadi.
5. **Ledger'ni yakka senior odam qabul qilsin.** Agent yaxshi yozadi, lekin buxgalteriya semantikasidagi xato oylardan keyin chiqadi.
