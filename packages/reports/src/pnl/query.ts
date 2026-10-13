import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import {
  article,
  direction,
  glAccount,
  journalEntry,
  journalLine,
  legalEntity,
  type Database,
} from '@fincore/db';
import {
  Money,
  addDays,
  currency as toCurrency,
  type GlAccountRole,
  type IsoDate,
} from '@fincore/shared';
import type { PnlFact } from './build.js';
import { PNL_ROLES } from './structure.js';

export interface PnlPeriod {
  readonly from: IsoDate;
  readonly to: IsoDate;
}

export interface PnlScope extends PnlPeriod {
  readonly orgId: string;
  readonly legalEntityIds?: readonly string[];
}

export interface PnlFactSet {
  readonly currency: string;
  readonly facts: readonly PnlFact[];
}

/**
 * Income and expense lines for one period, grouped by role, article flow type,
 * article and direction. One query serves every grouping mode: §5.3 puts direct
 * aggregation over `journal_line` at up to 100k lines, and the grouped result
 * is small enough that narrowing it per mode would buy nothing.
 *
 * Amounts come back in each line's natural direction — revenue positive as
 * income, expenses positive as cost — so the P&L subtracts rather than negates.
 */
export async function queryPnlFacts(db: Database, scope: PnlScope): Promise<readonly PnlFactSet[]> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.org_id', ${scope.orgId}, true)`);

    const conditions = [
      eq(journalLine.orgId, scope.orgId),
      gte(journalEntry.accrualDate, scope.from),
      lte(journalEntry.accrualDate, scope.to),
      inArray(glAccount.role, [...PNL_ROLES]),
    ];
    if (scope.legalEntityIds !== undefined) {
      conditions.push(inArray(journalEntry.legalEntityId, [...scope.legalEntityIds]));
    }

    const rows = await tx
      .select({
        currency: legalEntity.functionalCurrency,
        role: glAccount.role,
        flowType: article.flowType,
        articleId: journalLine.articleId,
        articleName: article.name,
        directionId: journalLine.directionId,
        directionName: direction.name,
        amount: sql<string>`sum(
          case when ${glAccount.type} = 'income'
               then case when ${journalLine.side} = 'C'
                         then ${journalLine.amountFunctional}
                         else -${journalLine.amountFunctional} end
               else case when ${journalLine.side} = 'D'
                         then ${journalLine.amountFunctional}
                         else -${journalLine.amountFunctional} end
          end)`,
      })
      .from(journalLine)
      .innerJoin(journalEntry, eq(journalEntry.id, journalLine.entryId))
      .innerJoin(glAccount, eq(glAccount.id, journalLine.glAccountId))
      .innerJoin(legalEntity, eq(legalEntity.id, journalEntry.legalEntityId))
      .leftJoin(article, eq(article.id, journalLine.articleId))
      .leftJoin(direction, eq(direction.id, journalLine.directionId))
      .where(and(...conditions))
      .groupBy(
        legalEntity.functionalCurrency,
        glAccount.role,
        article.flowType,
        journalLine.articleId,
        article.name,
        journalLine.directionId,
        direction.name,
      )
      .orderBy(
        legalEntity.functionalCurrency,
        glAccount.role,
        article.flowType,
        article.name,
        direction.name,
      );

    const byCurrency = new Map<string, PnlFact[]>();
    for (const row of rows) {
      const code = row.currency.trim();
      const bucket = byCurrency.get(code) ?? [];
      bucket.push({
        role: row.role,
        flowType: row.flowType,
        articleId: row.articleId,
        articleName: row.articleName,
        directionId: row.directionId,
        directionName: row.directionName,
        amount: Money.of(row.amount, toCurrency(code)),
      });
      byCurrency.set(code, bucket);
    }

    return [...byCurrency.entries()].map(([code, facts]) => ({ currency: code, facts }));
  });
}

export interface EquityMovement {
  readonly currency: string;
  /** Total equity at `to`, including the undistributed period result. */
  readonly closingEquity: Money;
  /** Total equity the day before `from`, on the same basis. */
  readonly openingEquity: Money;
  /** Share capital paid in during the period. */
  readonly contributions: Money;
  /**
   * Movement on retained earnings during the period — an opening balance or a
   * period close. Prior-period profit, so the current P&L must not explain it.
   */
  readonly broughtForward: Money;
  /** Dividends and owner withdrawals taken during the period. */
  readonly draws: Money;
}

/**
 * The movement the P&L has to explain:
 *
 *   ΔEquity = net profit + contributions + broughtForward − draws
 *
 * The C4 brief states it as "net profit = change in equity minus dividends",
 * which holds only when nothing else touched equity in the period. The other
 * two terms are not optional: the first run of this check returned a residual
 * of exactly the seed's opening retained earnings, because an opening balance
 * credits equity without being profit of the period.
 */
export async function queryEquityMovement(
  db: Database,
  scope: PnlScope,
): Promise<readonly EquityMovement[]> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.org_id', ${scope.orgId}, true)`);

    const entityFilter =
      scope.legalEntityIds === undefined
        ? undefined
        : inArray(journalEntry.legalEntityId, [...scope.legalEntityIds]);

    /** Credit-normal net over all equity, income and expense accounts. */
    const creditNormal = sql<string>`coalesce(sum(
      case when ${journalLine.side} = 'C'
           then ${journalLine.amountFunctional}
           else -${journalLine.amountFunctional} end), 0)`;

    const equityAt = async (upTo: IsoDate) =>
      tx
        .select({ currency: legalEntity.functionalCurrency, value: creditNormal })
        .from(journalLine)
        .innerJoin(journalEntry, eq(journalEntry.id, journalLine.entryId))
        .innerJoin(glAccount, eq(glAccount.id, journalLine.glAccountId))
        .innerJoin(legalEntity, eq(legalEntity.id, journalEntry.legalEntityId))
        .where(
          and(
            eq(journalLine.orgId, scope.orgId),
            lte(journalEntry.accrualDate, upTo),
            inArray(glAccount.type, ['equity', 'income', 'expense']),
            ...(entityFilter === undefined ? [] : [entityFilter]),
          ),
        )
        .groupBy(legalEntity.functionalCurrency);

    const movementOf = async (role: GlAccountRole) =>
      tx
        .select({ currency: legalEntity.functionalCurrency, value: creditNormal })
        .from(journalLine)
        .innerJoin(journalEntry, eq(journalEntry.id, journalLine.entryId))
        .innerJoin(glAccount, eq(glAccount.id, journalLine.glAccountId))
        .innerJoin(legalEntity, eq(legalEntity.id, journalEntry.legalEntityId))
        .where(
          and(
            eq(journalLine.orgId, scope.orgId),
            gte(journalEntry.accrualDate, scope.from),
            lte(journalEntry.accrualDate, scope.to),
            eq(glAccount.role, role),
            ...(entityFilter === undefined ? [] : [entityFilter]),
          ),
        )
        .groupBy(legalEntity.functionalCurrency);

    const [closing, opening, contributions, broughtForward, draws] = await Promise.all([
      equityAt(scope.to),
      equityAt(addDays(scope.from, -1)),
      movementOf('share_capital'),
      movementOf('retained_earnings'),
      movementOf('owner_draw'),
    ]);

    const currencies = new Set<string>(
      [...closing, ...opening, ...contributions, ...broughtForward, ...draws].map((r) =>
        r.currency.trim(),
      ),
    );
    const pick = (rows: { currency: string; value: string }[], code: string): string =>
      rows.find((r) => r.currency.trim() === code)?.value ?? '0';

    return [...currencies].sort().map((code) => {
      const c = toCurrency(code);
      return {
        currency: code,
        closingEquity: Money.of(pick(closing, code), c),
        openingEquity: Money.of(pick(opening, code), c),
        contributions: Money.of(pick(contributions, code), c),
        broughtForward: Money.of(pick(broughtForward, code), c),
        // Credit-normal on a debit-balance account, so a withdrawal reads
        // negative; negated here so `draws` is the amount taken out.
        draws: Money.of(pick(draws, code), c).negated(),
      };
    });
  });
}

export interface PnlDrilldownQuery extends PnlScope {
  /** The roles the clicked line sums — from the structure, not from the UI. */
  readonly roles: readonly GlAccountRole[];
  readonly articleId?: string | null;
  readonly directionId?: string | null;
  readonly limit?: number;
}

export interface PnlDrilldownLine {
  readonly entryId: string;
  readonly accrualDate: IsoDate;
  readonly cashDate: IsoDate | null;
  readonly kind: string;
  /** I3: what produced this line, and the id to open it by. */
  readonly sourceType: string;
  readonly sourceId: string | null;
  readonly description: string | null;
  readonly glCode: string;
  readonly articleName: string | null;
  readonly directionName: string | null;
  readonly side: 'D' | 'C';
  readonly amountFunctional: Money;
  readonly memo: string | null;
}

/**
 * The lines behind one P&L figure. I3 requires every number to reach its source
 * document in at most three clicks; this is the first of those clicks, so
 * `source_type` and `source_id` come back on every row.
 */
export async function queryPnlDrilldown(
  db: Database,
  query: PnlDrilldownQuery,
): Promise<readonly PnlDrilldownLine[]> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.org_id', ${query.orgId}, true)`);

    const conditions = [
      eq(journalLine.orgId, query.orgId),
      gte(journalEntry.accrualDate, query.from),
      lte(journalEntry.accrualDate, query.to),
      inArray(glAccount.role, [...query.roles]),
    ];
    if (query.legalEntityIds !== undefined) {
      conditions.push(inArray(journalEntry.legalEntityId, [...query.legalEntityIds]));
    }
    if (query.articleId !== undefined && query.articleId !== null) {
      conditions.push(eq(journalLine.articleId, query.articleId));
    }
    if (query.directionId !== undefined && query.directionId !== null) {
      conditions.push(eq(journalLine.directionId, query.directionId));
    }

    const rows = await tx
      .select({
        entryId: journalEntry.id,
        accrualDate: journalEntry.accrualDate,
        cashDate: journalEntry.cashDate,
        kind: journalEntry.kind,
        sourceType: journalLine.sourceType,
        sourceId: journalLine.sourceId,
        description: journalEntry.description,
        glCode: glAccount.code,
        currency: legalEntity.functionalCurrency,
        articleName: article.name,
        directionName: direction.name,
        side: journalLine.side,
        amountFunctional: journalLine.amountFunctional,
        memo: journalLine.memo,
      })
      .from(journalLine)
      .innerJoin(journalEntry, eq(journalEntry.id, journalLine.entryId))
      .innerJoin(glAccount, eq(glAccount.id, journalLine.glAccountId))
      .innerJoin(legalEntity, eq(legalEntity.id, journalEntry.legalEntityId))
      .leftJoin(article, eq(article.id, journalLine.articleId))
      .leftJoin(direction, eq(direction.id, journalLine.directionId))
      .where(and(...conditions))
      .orderBy(journalEntry.accrualDate, journalEntry.id, glAccount.code)
      .limit(query.limit ?? 500);

    return rows.map((row) => ({
      entryId: row.entryId,
      accrualDate: row.accrualDate as IsoDate,
      cashDate: row.cashDate as IsoDate | null,
      kind: row.kind,
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      description: row.description,
      glCode: row.glCode,
      articleName: row.articleName,
      directionName: row.directionName,
      side: row.side,
      amountFunctional: Money.of(row.amountFunctional, toCurrency(row.currency.trim())),
      memo: row.memo,
    }));
  });
}
