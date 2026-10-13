# Sifat nazorati promptlari

Har 2–3 haftada takrorlanadi.

### D1 — Ledger auditi

````
Audit the ledger implementation against invariants I1–I8 in CLAUDE.md. For each
one, show me the specific mechanism enforcing it (constraint, trigger, policy,
or test) and, if the only enforcement is application-level, say so plainly and
propose a database-level fix.

Then try to break it. Write adversarial tests for at least:
  - concurrent postings racing on the same entry
  - a posting that balances in the original currency but not in the functional
    currency
  - reversal of an entry that has already been reversed
  - a posting dated exactly on the period-lock boundary
  - an FX rate that changes between validation and commit
  - an entry whose lines reference accounts of two different legal entities

Report which of these currently pass, which fail, and fix the failures. Do not
soften a test to make it pass.
````

### D2 — Region boundary auditi

````
Verify the multi-region boundary is actually intact. Scan the whole repo for
anything region-specific outside packages/region-packs: tax rates, 'UZS', 'UZ',
Uzbek bank names, Uzbek legal forms, so'm formatting, CBU URLs, Cyrillic or
Uzbek-language strings in non-locale files, date/number formats assuming one
locale.

Produce a table: file, line, what leaked, and the fix. Then fix them.

Finally, prove the abstraction works: implement a minimal `kz` region pack —
config only, no integrations — and add a test that creates an organization on
it, posts entries in KZT, and produces a correct trial balance. If adding `kz`
requires touching any package other than region-packs, the abstraction has
failed and I want to know exactly where.
````

### D3 — Ishlash auditi

````
Profile the reporting layer against a generated dataset of 500k journal lines
across 3 legal entities and 24 months.

For each of getCashFlow, getPnl, getBalanceSheet, getPaymentCalendar: report p50
and p95 latency, the actual query plan, and where the time goes.

Then optimise, in this order of preference:
  1. indexes and query rewrites
  2. materialised monthly snapshots with incremental refresh
  3. a read model in a separate store

Do not jump to step 3. Do not denormalise the ledger itself under any
circumstances — that is I1's foundation.

Show me before/after numbers from the same benchmark, not estimates.
````

---
