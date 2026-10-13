# Bootstrap — birinchi sessiya

````
Bootstrap the FinCore repository. Read CLAUDE.md, docs/domain/architecture.md,
and docs/domain/prd.md first — everything below assumes them.

Goal of this session: a running skeleton with a correct, well-tested ledger
core. No product features yet. I would rather have 400 lines of bulletproof
posting engine than 4000 lines of half-wired CRUD.

Deliver, in this order, pausing after each step for me to review:

STEP 1 — Repo skeleton
  Turborepo + pnpm workspace with the exact package layout in CLAUDE.md §4.
  TypeScript strict everywhere, shared tsconfig/eslint/prettier base configs.
  An ESLint rule that flags `number`-typed identifiers matching
  /amount|price|balance|total|sum|cost|revenue/ outside of tests.
  Docker Compose: Postgres 16, Redis. Makefile or package scripts for
  `dev`, `test`, `db:migrate`, `db:seed`, `db:reset`.
  CI workflow: typecheck, lint, unit, integration (testcontainers).

STEP 2 — Schema (packages/db)
  Drizzle schema for: organization, legal_entity, account, gl_account, article,
  direction, counterparty, journal_entry, journal_line, fx_rate, period_lock,
  audit_log, app_user, membership.
  Follow the DDL sketch in architecture.md §2.4 but treat it as a sketch, not
  gospel — fix anything that is wrong and tell me what you changed and why.
  Requirements:
    - org_id on every tenant-scoped table, with an RLS policy keyed off
      `current_setting('app.org_id')`.
    - A DEFERRED constraint trigger enforcing I1 at transaction commit.
    - A trigger blocking any INSERT/UPDATE into a locked period (I2).
    - A rule preventing UPDATE/DELETE on journal_entry and journal_line after
      posting (I4) — reversal only.
    - Indexes for the access patterns in architecture.md §5.3.
  Write the migration and prove it applies cleanly to a fresh database.

STEP 3 — packages/ledger
  A pure posting engine. Public API, roughly:
    postEntry(input: PostEntryInput): Promise<Result<JournalEntry, PostingError>>
    reverseEntry(entryId, reason, actor): Promise<Result<JournalEntry, ...>>
    getTrialBalance(query: TrialBalanceQuery): Promise<TrialBalanceRow[]>
  It must:
    - validate balance in functional currency before touching the DB;
    - reject postings into locked periods with a typed error, not a throw;
    - require source_type;
    - be transactional and idempotent given an `idempotency_key`.
  Use a Result type, not exceptions, for expected domain failures.
  Tests: unit + fast-check property tests covering the four properties in
  CLAUDE.md §6. I expect 100% branch coverage here and I will check.

STEP 4 — packages/region-packs
  The `RegionPack` interface in `_contract` (see architecture.md §4) and a `uz`
  implementation containing ONLY configuration for now:
    - tax regimes with `effective_from`/`effective_to` versioning
      (aylanma_1: 1% turnover; aylanma_4: 4%; qqs_foyda: VAT 12% + profit 15%;
       social tax 12%, personal income tax 12% — 2026 rates, treated as data);
    - legal forms (MCHJ, YaTT, XK);
    - UZS as default currency, CBU as fx source;
    - a chart-of-accounts template and a starter article template for the
      "services" industry.
  Add a test that asserts no package outside region-packs references a tax rate
  or a bank name. A simple source-scan test is fine; I want the boundary to fail
  loudly the first time someone crosses it.

STEP 5 — Seed + smoke
  A deterministic seed: one organization, two legal entities (one MCHJ on
  qqs_foyda, one YaTT on aylanma_1), four accounts across UZS and USD, ~200
  journal entries spanning three months including one FX revaluation and one
  reversal. Then a smoke test proving:
    - the trial balance sums to zero;
    - cash per the ledger equals the sum of account balances;
    - RLS blocks cross-org reads (assert on a second org).

Constraints:
  - No frontend, no HTTP layer, no auth in this session. Resist the urge.
  - Do not stub anything you would have to rewrite. If something needs a
    decision I have not made, ask me — one question, with options.
  - After each step: run the tests and paste the real output. Then stop.
````

---
