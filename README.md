# FinCore

Boshqaruv hisobi platformasi. O'zbekiston MSB uchun, multi-region arxitektura bilan.

Bu repo hozircha **hujjatlardan iborat**. Kod `docs/prompts/01-bootstrap.md`
sessiyasidan boshlab paydo bo'ladi.

## Nimadan boshlash

1. `CLAUDE.md` — o'qing. Bu yerdagi I1–I9 invariantlari muzokara mavzusi emas.
2. `docs/domain/architecture.md` — nima uchun yagona ikki yozuvli daftar.
3. `docs/domain/prd.md` — nima quriladi va qanday tartibda.
4. `docs/prompts/00-how-to-use.md` — Claude Code sessiyalarini qanday yuritish.

## Struktura

```
CLAUDE.md                      har sessiyada o'qiladigan doimiy kontekst
docs/
  domain/
    architecture.md            arxitektura, data model, ledger, region-pack
    prd.md                     mahsulot talablari, modullar, yo'l xaritasi
    inventory.md               ombor, tannarx, I9 invarianti
    design-system.md           vizual til, jadval standarti, 25 ta ekran
  prompts/
    00-how-to-use.md           sessiyalar tartibi
    01-bootstrap.md            1-sessiya: skelet + ledger yadrosi
    02-slices.md               C1–C6 vertikal sliceler
    03-audits.md               D1–D3 muntazam auditlar
  adr/                         qaytarish qimmat bo'lgan qarorlar
```

## Yadro qoidasi

Har qanday moliyaviy fakt o'zgarmas `journal_entry` ga aylanadi. Barcha hisobotlar
shu yagona daftar ustidan proyeksiya. Ikkinchi haqiqat manbayi yo'q.
