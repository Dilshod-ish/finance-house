import { sql } from 'drizzle-orm';
import { setOrgId, type Database } from '@fincore/db';
import {
  CASH_ACCOUNT_KINDS,
  Money,
  addDays,
  currency as toCurrency,
  type GlAccountRole,
  type IsoDate,
  type MonthKey,
} from '@fincore/shared';
import type { CashFlowFact, CashPosition } from './build.js';
import { SECTION_BY_CONTRA_ROLE } from './structure.js';

export interface CashFlowScope {
  readonly orgId: string;
  readonly from: IsoDate;
  readonly to: IsoDate;
  readonly legalEntityIds?: readonly string[];
  readonly accountIds?: readonly string[];
}

export interface CashFlowFactSet {
  readonly currency: string;
  readonly facts: readonly CashFlowFact[];
}

/** `in (...)` over a list, or a literal false when the list is empty. */
const anyOf = (values: readonly string[]) =>
  sql`(${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )})`;

/**
 * Cash movements for one period, classified by the account on the other side
 * of each entry and grouped by month and by every dimension §7.1 asks for.
 *
 * The two filters that make this a cash-flow report rather than a P&L:
 *
 * - **I5** — the line must carry an `account_id` whose account kind is one of
 *   `bank | cash | card | ewallet | acquiring`. A virtual account is not cash.
 * - **I6** — the entry must have a `cash_date`, and it is dated by that, not
 *   by `accrual_date`. An FX revaluation touches a bank account but moves no
 *   money, and this is what keeps it out.
 *
 * Where an entry has several lines on the other side, the cash amount is
 * split across them in proportion to their own amounts: one payment settling
 * three invoices is three movements. For the ordinary two-line entry this is
 * the whole amount against the single contra, exactly.
 */
export async function queryCashFlowFacts(
  db: Database,
  scope: CashFlowScope,
): Promise<readonly CashFlowFactSet[]> {
  return db.transaction(async (tx) => {
    await tx.execute(setOrgId(scope.orgId));

    const entityFilter =
      scope.legalEntityIds === undefined
        ? sql``
        : sql` and e.legal_entity_id in ${anyOf(scope.legalEntityIds)}`;
    const accountFilter =
      scope.accountIds === undefined ? sql`` : sql` and l.account_id in ${anyOf(scope.accountIds)}`;

    const rows = await tx.execute<{
      currency: string;
      period: string;
      contra_role: GlAccountRole;
      direction: 'in' | 'out';
      article_id: string | null;
      article_name: string | null;
      direction_id: string | null;
      direction_name: string | null;
      counterparty_id: string | null;
      counterparty_name: string | null;
      account_id: string;
      account_name: string;
      amount: string;
    }>(sql`
      with cash_line as (
        select
          l.id,
          l.entry_id,
          l.side,
          l.amount_functional,
          l.account_id,
          l.article_id,
          l.direction_id,
          l.counterparty_id,
          e.cash_date,
          le.functional_currency as currency,
          a.name as account_name
        from journal_line l
          join journal_entry e on e.id = l.entry_id and e.org_id = l.org_id
          join account a on a.id = l.account_id and a.org_id = l.org_id
          join legal_entity le on le.id = e.legal_entity_id
        where l.org_id = ${scope.orgId}
          -- I6: dated by when the money moved, never by the accrual.
          and e.cash_date is not null
          and e.cash_date between ${scope.from} and ${scope.to}
          -- I5: only accounts that actually hold money.
          and a.kind in ${anyOf([...CASH_ACCOUNT_KINDS])}
          ${entityFilter}
          ${accountFilter}
      ),
      contra as (
        select
          c.id as cash_line_id,
          c.currency,
          c.cash_date,
          c.side,
          c.account_id,
          c.account_name,
          g.role as contra_role,
          -- The cash line's own dimension wins; the contra's is the fallback,
          -- which is where a direct sale or a paid expense carries it.
          coalesce(c.article_id, o.article_id) as article_id,
          coalesce(c.direction_id, o.direction_id) as direction_id,
          coalesce(c.counterparty_id, o.counterparty_id) as counterparty_id,
          c.amount_functional
            * (o.amount_functional / sum(o.amount_functional) over (partition by c.id))
            as amount
        from cash_line c
          join journal_line o
            on o.entry_id = c.entry_id and o.org_id = ${scope.orgId} and o.side <> c.side
          join gl_account g on g.id = o.gl_account_id and g.org_id = ${scope.orgId}
      )
      select
        contra.currency,
        to_char(contra.cash_date, 'YYYY-MM') as period,
        contra.contra_role,
        case when contra.side = 'D' then 'in' else 'out' end as direction,
        contra.article_id,
        art.name as article_name,
        contra.direction_id,
        dir.name as direction_name,
        contra.counterparty_id,
        cp.name as counterparty_name,
        contra.account_id,
        contra.account_name,
        sum(contra.amount) as amount
      from contra
        left join article art on art.id = contra.article_id and art.org_id = ${scope.orgId}
        left join direction dir on dir.id = contra.direction_id and dir.org_id = ${scope.orgId}
        left join counterparty cp on cp.id = contra.counterparty_id and cp.org_id = ${scope.orgId}
      group by
        contra.currency, period, contra.contra_role, direction,
        contra.article_id, art.name, contra.direction_id, dir.name,
        contra.counterparty_id, cp.name, contra.account_id, contra.account_name
      order by
        contra.currency, period, contra.contra_role, direction,
        art.name, dir.name, cp.name, contra.account_name
    `);

    const byCurrency = new Map<string, CashFlowFact[]>();
    for (const row of rows) {
      const code = row.currency.trim();
      const bucket = byCurrency.get(code) ?? [];
      bucket.push({
        period: row.period as MonthKey,
        section: SECTION_BY_CONTRA_ROLE[row.contra_role],
        direction: row.direction,
        articleId: row.article_id,
        articleName: row.article_name,
        directionId: row.direction_id,
        directionName: row.direction_name,
        counterpartyId: row.counterparty_id,
        counterpartyName: row.counterparty_name,
        accountId: row.account_id,
        accountName: row.account_name,
        amount: Money.of(row.amount, toCurrency(code)),
      });
      byCurrency.set(code, bucket);
    }

    return [...byCurrency.entries()].map(([code, facts]) => ({ currency: code, facts }));
  });
}

export interface CashPositionSet {
  readonly currency: string;
  readonly position: CashPosition;
}

/**
 * The opening cash balance, and the movement on cash accounts that was not a
 * cash movement.
 *
 * That second figure is what lets the statement tie without a plug. An FX
 * revaluation, or an opening balance posted inside the period, changes the
 * balance of a bank account with no money moving — `cash_date` is null, so it
 * is correctly absent from the flows and would otherwise appear as an
 * unexplained gap between opening and closing.
 */
export async function queryCashPosition(
  db: Database,
  scope: CashFlowScope,
): Promise<readonly CashPositionSet[]> {
  return db.transaction(async (tx) => {
    await tx.execute(setOrgId(scope.orgId));

    const entityFilter =
      scope.legalEntityIds === undefined
        ? sql``
        : sql` and e.legal_entity_id in ${anyOf(scope.legalEntityIds)}`;
    const accountFilter =
      scope.accountIds === undefined ? sql`` : sql` and l.account_id in ${anyOf(scope.accountIds)}`;

    /** Debit-normal: money in is positive, as a cash balance reads. */
    const signed = sql`sum(case when l.side = 'D' then l.amount_functional
                               else -l.amount_functional end)`;

    const cashLines = (dateFilter: ReturnType<typeof sql>) => sql`
      from journal_line l
        join journal_entry e on e.id = l.entry_id and e.org_id = l.org_id
        join account a on a.id = l.account_id and a.org_id = l.org_id
        join legal_entity le on le.id = e.legal_entity_id
      where l.org_id = ${scope.orgId}
        and a.kind in ${anyOf([...CASH_ACCOUNT_KINDS])}
        ${entityFilter}
        ${accountFilter}
        and ${dateFilter}
    `;

    const openingCutoff = addDays(scope.from, -1);
    const [opening, nonCash] = await Promise.all([
      /*
       * Everything on the ledger up to the day before the range, whatever
       * dated it: a balance is a balance. `coalesce` on the date keeps an
       * accrual-only movement from being skipped.
       */
      tx.execute<{ currency: string; value: string }>(sql`
        select le.functional_currency as currency, coalesce(${signed}, 0) as value
        ${cashLines(sql`coalesce(e.cash_date, e.accrual_date) <= ${openingCutoff}`)}
        group by le.functional_currency
        order by le.functional_currency
      `),
      tx.execute<{ currency: string; period: string; value: string }>(sql`
        select
          le.functional_currency as currency,
          to_char(e.accrual_date, 'YYYY-MM') as period,
          coalesce(${signed}, 0) as value
        ${cashLines(
          sql`e.cash_date is null and e.accrual_date between ${scope.from} and ${scope.to}`,
        )}
        group by le.functional_currency, period
        order by le.functional_currency, period
      `),
    ]);

    /*
     * Built from both result sets rather than looked up with a zero fallback:
     * a currency can have an opening balance and no non-cash movement, or the
     * reverse, and neither is a missing value to default.
     */
    const byCurrency = new Map<string, { opening: Money; nonCash: Map<MonthKey, Money> }>();
    const slotFor = (raw: string) => {
      const code = raw.trim();
      const existing = byCurrency.get(code);
      if (existing !== undefined) {
        return existing;
      }
      const slot = { opening: Money.zero(toCurrency(code)), nonCash: new Map<MonthKey, Money>() };
      byCurrency.set(code, slot);
      return slot;
    };

    for (const row of opening) {
      slotFor(row.currency).opening = Money.of(row.value, toCurrency(row.currency.trim()));
    }
    for (const row of nonCash) {
      slotFor(row.currency).nonCash.set(
        row.period as MonthKey,
        Money.of(row.value, toCurrency(row.currency.trim())),
      );
    }

    // Ordered by the SQL, and ordered again by the caller, which has to
    // merge these with the movement sets before it can build anything.
    return [...byCurrency.entries()].map(([code, slot]) => ({
      currency: code,
      position: {
        openingCash: slot.opening,
        // Walked forward by the builder, which knows the period order.
        closingCash: slot.opening,
        nonCashByPeriod: slot.nonCash,
      },
    }));
  });
}

/** The cash balance on one date, straight from the ledger — the tie-out. */
export async function queryCashBalance(
  db: Database,
  scope: Omit<CashFlowScope, 'from'>,
): Promise<readonly { readonly currency: string; readonly balance: Money }[]> {
  return db.transaction(async (tx) => {
    await tx.execute(setOrgId(scope.orgId));

    const entityFilter =
      scope.legalEntityIds === undefined
        ? sql``
        : sql` and e.legal_entity_id in ${anyOf(scope.legalEntityIds)}`;
    const accountFilter =
      scope.accountIds === undefined ? sql`` : sql` and l.account_id in ${anyOf(scope.accountIds)}`;

    const rows = await tx.execute<{ currency: string; value: string }>(sql`
      select
        le.functional_currency as currency,
        coalesce(sum(case when l.side = 'D' then l.amount_functional
                          else -l.amount_functional end), 0) as value
      from journal_line l
        join journal_entry e on e.id = l.entry_id and e.org_id = l.org_id
        join account a on a.id = l.account_id and a.org_id = l.org_id
        join legal_entity le on le.id = e.legal_entity_id
      where l.org_id = ${scope.orgId}
        and a.kind in ${anyOf([...CASH_ACCOUNT_KINDS])}
        and coalesce(e.cash_date, e.accrual_date) <= ${scope.to}
        ${entityFilter}
        ${accountFilter}
      group by le.functional_currency
      order by le.functional_currency
    `);

    return rows.map((row) => ({
      currency: row.currency.trim(),
      balance: Money.of(row.value, toCurrency(row.currency.trim())),
    }));
  });
}
