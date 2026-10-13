# FinCore

Boshqaruv hisobi platformasi. O'zbekiston MSB uchun, multi-region arxitektura bilan.

Turborepo + pnpm monorepo. Yadro — `packages/ledger` (posting engine) va
`packages/db` (sxema, RLS, invariantlar). Qolgan paketlar chegara sifatida
mavjud, lekin hali bo'sh — stub yozilmagan.

## Nimadan boshlash

1. `CLAUDE.md` — o'qing. Bu yerdagi I1–I9 invariantlari muzokara mavzusi emas.
2. `docs/domain/architecture.md` — nima uchun yagona ikki yozuvli daftar.
3. `docs/domain/prd.md` — nima quriladi va qanday tartibda.
4. `docs/prompts/00-how-to-use.md` — Claude Code sessiyalarini qanday yuritish.

## Ishga tushirish

```bash
pnpm install
make up            # Postgres 16 + Redis (docker/docker-compose.yml)
make db-migrate    # migratsiyalar
make db-seed       # deterministik seed
make test          # barcha testlar
make ci            # typecheck + lint + test
```

`make help` — barcha buyruqlar. Har bir `make` maqsadi aynan shu pnpm skriptini
chaqiradi, ya'ni CI va odam bir xil buyruqni ishlatadi.

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
packages/
  shared/                      Money (Decimal), Result, IsoDate
  db/                          Drizzle sxema, migratsiyalar, RLS, seed
  ledger/                      posting engine — journal_* ga yozadigan yagona joy
  reports/ inventory/ importers/ ai/   chegara sifatida band, hozircha bo'sh
  region-packs/_contract, uz/  RegionPack interfeysi va O'zbekiston paketi
tooling/
  tsconfig/                    umumiy strict tsconfig
  eslint-config/               umumiy flat config
  eslint-plugin/               @fincore/no-number-money (I7 ni majburlaydi)
docker/docker-compose.yml      Postgres 16 + Redis
    02-slices.md               C1–C6 vertikal sliceler
    03-audits.md               D1–D3 muntazam auditlar
  adr/                         qaytarish qimmat bo'lgan qarorlar
```

## Yadro qoidasi

Har qanday moliyaviy fakt o'zgarmas `journal_entry` ga aylanadi. Barcha hisobotlar
shu yagona daftar ustidan proyeksiya. Ikkinchi haqiqat manbayi yo'q.
