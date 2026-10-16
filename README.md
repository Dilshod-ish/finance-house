# FinCore

Boshqaruv hisobi platformasi. O'zbekiston MSB uchun, multi-region arxitektura bilan.

Turborepo + pnpm monorepo. Yadro — `packages/ledger` (posting engine) va
`packages/db` (sxema, RLS, invariantlar). Ustida `packages/reports` (ДДС,
ОПиУ, Balans), `apps/api` (NestJS) va `apps/web` (Next.js). `inventory`, `importers`,
`ai` hali bo'sh — chegara sifatida band, stub yozilmagan.

**Autentifikatsiya hali yo'q.** API tenant'ni `x-fincore-org` sarlavhasidan
o'qiydi va u production'da ishlashdan **bosh tortadi** — ADR-0007 ga qarang.

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
make db-seed       # deterministik seed — org id larini chop etadi
make test          # barcha testlar
make ci            # typecheck + lint + test
```

### Dasturni ko'rish

`.env.example` ni `.env.local` ga nusxalang, so'ng ikki terminalda:

```bash
# 1-terminal — API (:3001)
DATABASE_URL=postgres://fincore:fincore@127.0.0.1:5432/fincore \
FINCORE_INSECURE_ORG_HEADER=1 \
CORS_ORIGINS=http://localhost:3000 \
pnpm api:dev

# 2-terminal — veb (:3000)
FINCORE_API_URL=http://127.0.0.1:3001 \
FINCORE_ORG_ID=2f6a1e10-0000-4000-8000-000000000001 \
pnpm web:dev
```

`http://localhost:3000` → ДДС. Chap menyuda ОПиУ, Balans va Tekshiruv.
Har qanday raqamni bosing — ortidagi provodkalar o'ngdan ochiladi.

E2E (API va veb ishlab turishi shart):

```bash
pnpm test:e2e
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
apps/
  api/                         NestJS. Hech narsa hisoblamaydi — tekshiradi va
                               domen paketlarini chaqiradi
  web/                         Next.js 15. To'rtta ekran + drill-down paneli
packages/
  shared/                      Money (Decimal), Result, IsoDate
  db/                          Drizzle sxema, migratsiyalar, RLS, seed
  ledger/                      posting engine — journal_* ga yozadigan yagona joy
  reports/                     ДДС, ОПиУ, Balans. `/structure` — sof kirish
                               nuqtasi (brauzer uchun, ma'lumotlar bazasisiz)
  ui/                          dizayn tizimi: tokenlar, raqam formati, jadval
  inventory/ importers/ ai/    chegara sifatida band, hozircha bo'sh
  region-packs/_contract, uz/  RegionPack interfeysi va O'zbekiston paketi
  seed/                        deterministik demo ma'lumot + smoke testlar
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
