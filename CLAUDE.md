# FinCore — Engineering Context

You are working on FinCore: a management-accounting (not bookkeeping) SaaS for
SMBs, launching in Uzbekistan and designed from day one to expand to CIS and
global markets. Reference competitor: Fintablo (fintablo.ru). We are rebuilding
its value proposition on a fundamentally sounder core.

Read `docs/domain/architecture.md` and `docs/domain/prd.md` before any
non-trivial change. For stock or cost-of-sales work also read
`docs/domain/inventory.md`; for any UI work read
`docs/domain/design-system.md`. When they conflict with this file, this file
wins; when this file is silent, they win.

## 1. The one thing that matters

Every financial fact in this system becomes an immutable double-entry
`journal_entry`. All reports — cash flow, P&L, balance sheet, payment calendar,
budgets — are **projections over that single ledger**. There is no second source
of truth, no per-report bespoke aggregation, no "plug" figure to make the
balance sheet tie.

If you find yourself writing report logic that reads from `cash_operation`,
`deal`, or `payroll_line` directly instead of from `journal_line`, stop. You are
about to reintroduce the exact structural flaw we are competing against.

## 2. Non-negotiable invariants

These are enforced in the database, not just in application code. A PR that
weakens any of them is rejected regardless of what it enables.

- **I1** For every `journal_entry`: `SUM(debit.amount_functional) =
SUM(credit.amount_functional)`. Enforced by a deferred constraint trigger.
- **I2** No writes into a locked period (`period_lock`). Corrections are made by
  reversing entries, never by mutation.
- **I3** Every `journal_line` carries `source_type` and (where applicable)
  `source_id`. Every number in every report must be traceable to its source
  document in at most three clicks.
- **I4** `journal_entry` rows are never deleted or updated after posting. Use
  `reversed_by_id`.
- **I5** Cash-flow figures derive only from lines touching accounts of kind
  `bank | cash | card | ewallet | acquiring`. Accrual figures never enter cash
  flow and vice versa.
- **I6** `accrual_date` and `cash_date` are distinct fields with distinct
  meanings. Conflating them destroys the product.
- **I7** Money is `numeric(20,4)` in Postgres and `Decimal` (decimal.js) in
  TypeScript. `number` for a monetary value is a lint error. No exceptions,
  including in tests, fixtures, and seed data.
- **I8** Every tenant-scoped table has `org_id` and an active RLS policy. Never
  rely on an application-layer `WHERE org_id = ...` alone.
- **I9** At any point in time, the ledger balance of the inventory account
  equals the sum of `stock_lot` valuations. Cost of sales is derived from stock
  movements and is never entered by hand. Checked on every posting and enforced
  as a blocker on period close.

## 3. Stack

- Monorepo: Turborepo + pnpm. Node 22, TypeScript 5.x, `strict: true`.
- API: NestJS. Web: Next.js 15 App Router + React 19. Worker: BullMQ.
- DB: PostgreSQL 16 + Drizzle ORM + drizzle-kit migrations. Redis for queues.
- UI: Tailwind + shadcn/ui + TanStack Table + Recharts.
- Tests: Vitest (unit/integration), Playwright (e2e), fast-check (property).
- AI: Anthropic SDK, isolated in `packages/ai`.

## 4. Package boundaries

```
packages/ledger        Posting engine. Pure domain. No HTTP, no framework.
                       Only package allowed to INSERT into journal_*.
packages/reports       Read-only projections over journal_*. No writes, ever.
packages/region-packs  Per-country config: tax, banks, CoA, e-invoice, locale.
                       `_contract` defines the interface; `uz` implements it.
packages/inventory     Stock valuation (moving average, FIFO) and period
                       recalculation. Pure functions over movement sequences.
packages/importers     Bank statement parsers. Pure functions: bytes -> DTOs.
packages/ai            Claude wrappers. Never computes a financial figure.
packages/db            Drizzle schema, migrations, seeds, RLS policies.
packages/shared        Money, dates, i18n, result types.
```

Rules:

- `ledger` and `reports` must not import from `apps/*`.
- Only `ledger` writes to `journal_entry` / `journal_line`.
- `reports` is read-only. If a report needs a write, the design is wrong.
- Nothing outside `region-packs/uz` may reference Uzbek tax rates, Uzbek banks,
  or the string `'UZ'`. Region-specific behaviour resolves through the
  `RegionPack` interface. This is what makes global expansion possible later —
  violating it is a silent, expensive mistake.

## 5. Money and currency

Three layers, always:

1. `amount` + `currency` — as transacted.
2. `amount_functional` — the legal entity's functional currency, at the
   transaction-date rate. I1 is checked on this column.
3. Presentation currency — computed at report time under a selectable FX policy
   (`transaction` | `monthly_average` | `closing`).

FX rates come from the region pack's `fxSource` (CBU for `uz`), stored in
`fx_rate`, overridable manually. Month-end revaluation of FX-denominated
balances emits `kind = 'fx_revaluation'` entries.

Rounding happens at presentation only. Never round intermediate values.

## 6. Testing standard

- `packages/ledger` and `packages/reports`: 100% branch coverage, no exceptions.
- Property-based tests for the ledger:
  - any sequence of valid postings leaves I1 intact;
  - trial balance always sums to zero;
  - reversing an entry restores the prior trial balance exactly;
  - report totals are invariant under the order of posting.
- Every bank-statement parser ships with at least one **real anonymised sample
  file** as a fixture. A parser without a fixture is not done.
- Integration tests run against a real Postgres (testcontainers), never a mock,
  because RLS and constraint triggers are the things most likely to break.
- Golden-file tests for reports: a fixed seeded dataset produces a checked-in
  expected output. Any diff must be explained in the PR.

## 7. Definition of done

A change is done when all of these hold:

1. Types check, lint passes, all tests pass.
2. Migration written, reversible, and applied cleanly to a fresh DB **and** to a
   DB seeded with the previous schema.
3. RLS policy exists for any new tenant-scoped table.
4. If it touches the ledger: property tests updated and passing.
5. If it touches reports: golden files regenerated and the diff justified.
6. If it introduces a user-facing string: added to all locale files
   (`uz`, `ru`, `en`) — no hardcoded strings in components.
7. An ADR is written in `docs/adr/` for any decision that is expensive to
   reverse.

## 8. How to work

- **Plan before coding.** For any task beyond a single file, write the plan
  first: files to touch, schema changes, test strategy. Then execute.
- **Vertical slices, not layers.** Ship "import a statement and see it in the
  cash-flow report" end to end before building the next module. Never leave a
  half-wired module behind.
- **Read before writing.** Search the codebase for existing helpers before
  adding new ones. This codebase will have a lot of near-duplicate financial
  logic if you do not.
- **Small, reviewable commits** with conventional-commit messages.
- **Run the tests yourself** before claiming something works. Do not report
  success on unverified code.

## 9. Anti-patterns — do not do these

- Computing a report figure outside `packages/reports`.
- Adding a nullable column to `journal_line` to sneak in a special case. Model
  it properly or write an ADR explaining why not.
- `float`/`number` for money; `parseFloat` on a monetary string.
- Storing localized text in the database instead of a locale key.
- Hardcoding a tax rate, a bank name, a currency, or a legal form anywhere
  outside `packages/region-packs`.
- Generating SQL from LLM output and executing it. The NL-query feature uses a
  fixed catalogue of parameterised queries. No exceptions.
- Letting the AI layer produce a number that a user could mistake for a computed
  financial figure.
- "Temporary" mock data in a code path that can reach production.
- Broad `try/catch` that swallows errors in financial code paths. Fail loudly.

## 10. Escalate instead of guessing

Stop and ask when you hit any of these. Do not invent an answer:

- An accounting-treatment question with more than one defensible answer
  (revenue recognition timing, cost allocation base, VAT treatment on a
  specific transaction type).
- A schema change that would break I1–I8.
- A situation where the architecture doc and the PRD disagree.
- A tax rule you cannot verify from `packages/region-packs/uz/config`.
- A performance trade-off that would denormalise the ledger.

When you ask, ask **one** specific question with the two or three options you
see and your recommendation. Do not send a list of ten questions.

## 11. Communication

Respond in English. Be concise. When you finish a task, report: what changed,
what you verified (with the actual command output), and what you deliberately
did not do. Do not pad with summaries of code I can read myself.
