# Vertikal slice promptlari

Har biri alohida sessiya. Tartib: C1 → C2 → C3 → C4 → C6 → C5.

### C1 — Bank ko'chirmasi importi

````
Implement the statement-import vertical slice end to end: file in, journal
entries out, visible in a cash-flow query. Nothing else.

Scope:
1. packages/importers
   - A `StatementParser` interface: `detect(file) -> confidence`,
     `parse(file) -> Result<ParsedStatement, ParseError>`.
   - Parsers for: 1C-exchange .txt, generic .xlsx, generic .csv.
   - Parsers are pure: bytes in, DTOs out. No DB, no I/O, no side effects.
   - Each parser ships with at least one anonymised fixture file and a golden
     test. If I have not given you a real sample for a format, build the parser
     against the published spec and tell me explicitly which formats are
     unverified — do not silently invent a format.
2. Ingestion pipeline (apps/worker)
   - `import_batch` row; parse; normalise; duplicate detection on
     (account_id, value_date, amount, external_id ?? hash(description)).
   - Duplicates are flagged for review, never auto-posted.
   - Non-duplicates become `cash_operation` rows in `unclassified` state.
   - Whole batch is reversible in one call, including any posted entries.
3. Classification
   - `rule` table: ordered conditions (description regex, counterparty, account,
     amount range) -> article + direction + tags.
   - Rules apply on ingest and can be replayed retroactively over a date range.
   - Classified operations post to the ledger via packages/ledger. Unclassified
     ones do not post — they sit in a queue. That distinction matters: an
     unclassified operation must still show in the account balance but must not
     land in a P&L line. Solve this properly (suspense account) rather than by
     special-casing the reports.
4. packages/reports
   - `getCashFlow(query)` grouped by article / direction / counterparty /
     account, with period bucketing and drill-down to journal lines.
   - Golden-file test against the seed dataset.

Definition of done is CLAUDE.md §7 plus: importing the fixture set twice in a
row produces zero duplicate journal entries. Write that test.

Plan first. Show me the plan before you write code.
````

### C2 — Operatsiya navbati (UI)

````
Build the classification queue UI in apps/web. This is the screen an operator
uses for 30 minutes a day, so it is a keyboard-first tool, not a CRUD form.

Requirements:
- List of unclassified operations, virtualised (TanStack Virtual). Assume 5,000
  rows and keep it at 60fps.
- Keyboard: ↑/↓ move, `/` focuses article search, Enter accepts, Tab moves to
  direction, `s` splits, `d` marks duplicate, ⌘Z undoes the last action.
  Median time per operation must be under 3 seconds. Instrument it and tell me
  the number you measure.
- Inline AI suggestion with a confidence indicator; accepting one offers
  "create a rule from this" without leaving the keyboard.
- Split: one payment across N article/direction pairs, with a live remainder
  that must reach zero before the split can be saved.
- Bulk edit on multi-select.
- Optimistic updates with rollback on failure. Never lose an operator's work on
  a network error — queue and retry.

Follow the design system in packages/ui. All strings via i18n keys in uz/ru/en.
Playwright test covering the full keyboard path.
````

### C3 — To'lov kalendari

````
Implement the payment calendar: the daily projected cash position.

Sources of future flows:
  - planned cash operations
  - approved payment requests
  - open receivables (from obligations and deals), scheduled by due date
  - payroll schedule, tax accrual due dates, loan repayment schedule

Deliver:
1. packages/reports: `getPaymentCalendar({ from, to, entityIds, scenario })`
   returning, per day: opening balance, inflows, outflows, closing balance, and
   the contributing items grouped by source. Multi-currency: convert to the
   presentation currency under the selected FX policy.
2. Cash-gap detection: contiguous ranges where projected closing balance is
   negative, with depth and the earliest date. Expose as a first-class result,
   not something the UI has to derive.
3. What-if: given a list of proposed adjustments (defer payment X by N days,
   accelerate receivable Y), recompute without persisting anything. Pure
   function over the base projection.
4. UI: horizontal day lane with a balance line, negative days in red, click a
   day to see its items, drag a payment to a different date to see the
   recalculated line before committing.

Performance target: 90-day projection for an org with 200k journal lines in
under 400ms server-side. Show me the benchmark.
````

### C4 — ОПиУ (P&L)

````
Implement the P&L report over the ledger.

Structure is fixed (architecture.md §7.2 in the PRD): Revenue, COGS, Gross
profit, Variable costs, Marginal profit, Fixed costs, EBITDA, Depreciation,
Interest, Taxes, FX difference, Net profit, Dividends, Retained.

Requirements:
- Grouping modes: articles / directions / directions×articles.
- Period columns with comparison to prior period and to budget (Δ and %).
- Every cell drills down to journal lines, and each line shows its `source_type`
  badge and links to the source document. This is the trust feature — it is not
  optional and it is not a later iteration.
- Indirect cost allocation runs as an explicit `kind = 'allocation'` posting at
  period close, using the configured base (revenue share / headcount / direct
  cost share / manual coefficients). Allocations are visible in the ledger and
  individually reversible.
- Computed margins as derived rows, not stored values.
- Golden-file test plus a reconciliation test: net profit for a period must
  equal the change in equity minus dividends for that period, exactly, to the
  cent. If it does not, the test fails loudly — that check is the whole point.

Do not add a "rounding adjustment" line. If the numbers do not tie, the bug is
upstream and I want to know about it.
````

### C5 — AI qatlami

````
Implement packages/ai. Read CLAUDE.md §9 first — the constraint that the AI
never produces a financial figure is absolute and shapes the whole design.

Capabilities, in priority order:
1. Transaction classification: given a statement line plus this org's article
   list and its historical classifications, return
   `{ articleId, directionId, confidence, reasoning }`. Below 0.85 confidence,
   the operation stays in the queue. Batch requests. Cache aggressively on
   normalised description.
2. Receipt/invoice OCR: image -> draft operation. Always requires human
   confirmation before posting. Never auto-post.
3. Anomaly detection: deterministic statistical detection (z-score against the
   article's trailing 12-month distribution, duplicate-payment heuristics) with
   the LLM used only to phrase the explanation. The detection itself must not
   depend on the model.
4. Natural-language query: map a question to one of a fixed catalogue of
   parameterised report queries and fill its parameters. If no query in the
   catalogue fits, say so. Do not generate SQL. Do not fall back to free-form
   generation. This is a hard boundary, not a v1 simplification.

Cross-cutting:
- All prompts live in versioned files, not inline string literals.
- Every AI call is logged with prompt version, latency, token count, and
  outcome, so we can measure accuracy over time.
- A hard per-org monthly token budget with graceful degradation to the
  deterministic path.
- Evaluation harness: a labelled set of at least 200 real classified operations,
  reporting precision/recall per article. Wire it into CI as a non-blocking
  report so we can see regressions.
````

---

### C6 — Ombor va tannarx

```
Implement the inventory module. Read docs/domain/inventory.md first.

Non-negotiable: inventory is not a separate ledger. Every stock document posts
journal entries through packages/ledger. COGS on the P&L is derived from stock
movements, never entered by hand.

New invariant I9: the ledger balance of the inventory account must equal the sum
of stock_lot valuations at any point in time. Write that as a test that runs
against the seed dataset and as a check that blocks period close.

Order of work:
  1. Schema + migrations (warehouse, product, stock_lot, stock_document,
     stock_movement, landed_cost_allocation, stock_reservation).
  2. Valuation engine in packages/inventory: moving weighted average and FIFO,
     as two implementations of one interface. Pure functions over movement
     sequences — no DB access inside the calculation.
  3. Period recalculation: re-sequence a month's movements by date, recompute
     costs, emit reversal + corrected entries. Never mutate posted entries.
  4. Journal generators for each document kind.
  5. Landed cost allocation by value / weight / quantity / volume.
  6. Reports: stock balance, turnover days, slow-moving, margin by SKU.

Property tests I expect:
  - any permutation of the ORDER in which movements are entered, for the same
    set of movements with the same dates, produces the same closing valuation;
  - I9 holds after every posting and after every recalculation;
  - a reversed receipt restores the prior valuation exactly;
  - issuing more than available quantity fails with a typed error, never a
    negative lot.

Do not implement manufacturing BOM beyond simple assembly. Ask me before
touching the P&L cost-of-sales line.
```
