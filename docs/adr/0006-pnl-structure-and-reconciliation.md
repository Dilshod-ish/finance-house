# ADR-0006 — P&L structure: `article.flow_type` drives it, and equity proves it

Date: 2026-10 · Status: Accepted

## Context

The P&L (ОПиУ) of architecture §7.2 is not a statutory income statement. It is a
management report whose point is the margin chain:

```
Revenue − Cost of sales          = Gross profit
        − Variable costs         = Marginal profit
        − Fixed costs            = EBITDA
        ± below-EBITDA block     = Net profit
        − dividends / draws      = Retained for the period
```

Two things had to be decided to build it.

**1. Where the variable/fixed split comes from.** `gl_account.role` says what an
account *is* (`expense`), not how it *behaves* with volume. Rent and raw
material packaging are both `expense`; one is fixed, one is variable. The split
is a management judgement about the cost, and the same GL account can carry both
kinds of cost in different businesses.

**2. How we know the report is right.** A P&L that is merely "a sum of the
expense accounts" cannot be checked. Fintablo's structural flaw is exactly this:
reports are bespoke aggregations with nothing to tie them to.

## Decision

### The split lives on `article.flow_type`, not on the account

`flow_type` (`revenue | cogs | opex_variable | opex_fixed | below_ebitda |
below_net_profit | financing | investing | transfer`) is an attribute of the
**article** — the management-accounting classifier the user assigns per line.
`PNL` in `packages/reports/src/pnl/structure.ts` declares, as data, which roles
and which flow types each line claims.

Consequences accepted:

- The user can reclassify a cost from variable to fixed by editing the article,
  with no migration and no change to the ledger. The ledger records the fact;
  the article records the management view of it.
- Reclassifying restates prior periods. That is correct for a management report
  and wrong for a statutory one — which this is not.

### An unclassified line, never a silent drop

`opexUnclassified` is a catch-all: any `expense` line whose article flow type is
not claimed by the variable or fixed lines (including lines with no article at
all) lands there. It is a visible row with a label in all three locales.

The alternative — matching only known flow types — means an expense silently
missing from EBITDA. A report that quietly loses money is worse than one that
shows an ugly row, so the catch-all is a line, not a filter. `matches()` is
property-tested to partition every flow type across the three expense lines
exactly once.

### Net profit is proven against the movement in equity

`reconcilePnl` checks, per functional currency:

```
ΔEquity = net profit + contributions + broughtForward − draws
```

Any non-zero residual is a bug upstream and is reported as such. There is no
plug line and no rounding-adjustment row anywhere in the P&L; margins are
derived on every read and never stored.

The brief for this report stated the identity as "net profit = change in equity
minus dividends". That is only true when nothing else touched equity in the
period. The first run returned a residual of exactly the seed's opening retained
earnings, because an opening balance credits equity without being profit of the
period. Hence two further terms:

- `contributions` — movement on `share_capital` (paid-in capital is not profit);
- `broughtForward` — movement on `retained_earnings`, which is prior-period
  profit, whether it arrives as an opening balance or as a period close.

Keeping these as separate named terms rather than folding them into one
"other equity movement" is deliberate: when the residual is non-zero, the four
terms say where to look.

### The comparison period is calendar-aware

`priorPeriod` returns the previous calendar month, quarter or year for a span
that is whole months, and an equally long window otherwise. A pure day-count
rule puts March's comparison at 29 January — arithmetically defensible and
useless on a report. Callers who want a specific window pass `compareTo`
explicitly.

## Alternatives rejected

- **`is_variable` flag on `gl_account`.** Forces the chart of accounts to
  duplicate every cost account into a fixed and a variable twin, and makes the
  classification a region-pack concern when it is a per-business judgement.
- **Flow type on `journal_line`.** Would mean a nullable report-shaping column
  on the ledger, which CLAUDE.md §9 rules out, and would freeze the management
  view at posting time.
- **A stored `net_profit` figure per period.** A second source of truth. The P&L
  is a projection; it is recomputed, and the reconciliation is what makes that
  safe.

## Deliberately not decided here

Budget columns (plan vs actual), the `kind = 'allocation'` posting generator for
overhead allocation, and whether period close posts monthly or annually. The
close decision affects `broughtForward` and is deferred to the period-close ADR.
