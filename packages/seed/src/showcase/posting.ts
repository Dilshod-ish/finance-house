import { createLedger, type PostEntryInput, type PostEntryLineInput } from '@fincore/ledger';
import { Decimal, Money, toUtcDate, type IsoDate } from '@fincore/shared';
import type { Database } from '@fincore/db';
import { usdPerUnit } from './fx.js';
import type { ShowcaseReference } from './reference.js';

/** One side of an entry, before the functional amount is worked out. */
export interface Leg {
  readonly glCode: string;
  readonly side: 'D' | 'C';
  readonly amount: Money;
  /**
   * Units of USD per one unit of `amount.currency`. Omit for the day's rate.
   * A settlement passes the *original* rate on the receivable or payable leg,
   * which is what makes the exchange difference appear where it belongs.
   */
  readonly rate?: Decimal;
  readonly accountId?: string;
  readonly articleId?: string;
  readonly directionId?: string;
  readonly counterpartyId?: string;
}

export interface EntryDraft {
  readonly on: IsoDate;
  readonly cashOn?: IsoDate | null;
  readonly kind: PostEntryInput['kind'];
  readonly sourceType: string;
  readonly description: string;
  readonly legs: readonly Leg[];
}

/** A literal whole-unit amount, written in the profile or the generator. */
export function units(whole: number, currency: string): Money {
  if (!Number.isInteger(whole)) {
    throw new Error(`units() takes whole units; got ${String(whole)}`);
  }
  return Money.of(new Decimal(whole).toFixed(4), currency);
}

/**
 * A computed amount. Takes a Decimal rather than a number because a figure
 * that has been through arithmetic must never round-trip through a float
 * (I7) — and every amount worth computing has been through arithmetic.
 */
export function exact(value: Decimal, currency: string): Money {
  return Money.of(value.toFixed(4), currency);
}

export function isWeekend(day: IsoDate): boolean {
  const weekday = toUtcDate(day).getUTCDay();
  return weekday === 0 || weekday === 6;
}

/**
 * Anything left over once every leg is stated in USD is an exchange
 * difference, and it gets its own line.
 *
 * Two things end up here. The real one: a receivable raised at one rate and
 * settled at another — the gap is a genuine gain or loss and belongs in the
 * P&L. The small one: a non-USD entry whose legs each round to four decimals
 * independently, leaving a cent. Both are the same kind of thing, and both
 * must be posted rather than absorbed, because I1 is checked on the functional
 * column and a ledger that silently absorbs a cent is not one.
 */
export function withExchangeDifference(
  reference: ShowcaseReference,
  draft: EntryDraft,
  fxGlCode: string,
): PostEntryInput {
  const rateFor = (leg: Leg): Decimal => leg.rate ?? usdPerUnit(leg.amount.currency, draft.on);

  let debit = new Decimal(0);
  let credit = new Decimal(0);
  for (const leg of draft.legs) {
    const functional = new Decimal(
      leg.amount.convert(rateFor(leg).toFixed(10), 'USD').round().toStorage(),
    );
    if (leg.side === 'D') {
      debit = debit.plus(functional);
    } else {
      credit = credit.plus(functional);
    }
  }

  const gap = debit.minus(credit);
  const scale = Decimal.max(debit, credit);
  if (!gap.isZero() && scale.greaterThan(0) && gap.abs().dividedBy(scale).greaterThan('0.12')) {
    // Not rounding and not a plausible rate move: the generator is wrong.
    throw new Error(
      `showcase entry "${draft.description}" is out by ${gap.toFixed(4)} USD on ${scale.toFixed(2)}`,
    );
  }

  const legs: Leg[] = [...draft.legs];
  if (!gap.isZero()) {
    legs.push({
      glCode: fxGlCode,
      // Debits exceed credits, so the balancing line is a credit: a gain.
      side: gap.greaterThan(0) ? 'C' : 'D',
      amount: Money.of(gap.abs().toFixed(4), 'USD'),
    });
  }

  const glId = (code: string): string => {
    const id = reference.glIdByCode.get(code);
    if (id === undefined) {
      throw new Error(`showcase references unknown GL code ${code}`);
    }
    return id;
  };

  const lines: PostEntryLineInput[] = legs.map((leg) => ({
    glAccountId: glId(leg.glCode),
    side: leg.side,
    amount: leg.amount,
    ...(leg.amount.currency === 'USD' ? {} : { fxRate: rateFor(leg).toFixed(10) }),
    ...(leg.accountId === undefined ? {} : { accountId: leg.accountId }),
    ...(leg.articleId === undefined ? {} : { articleId: leg.articleId }),
    ...(leg.directionId === undefined ? {} : { directionId: leg.directionId }),
    ...(leg.counterpartyId === undefined ? {} : { counterpartyId: leg.counterpartyId }),
  }));

  return {
    orgId: reference.orgId,
    legalEntityId: reference.legalEntityId,
    accrualDate: draft.on,
    cashDate: draft.cashOn ?? null,
    kind: draft.kind,
    sourceType: draft.sourceType,
    description: draft.description,
    lines,
    postedBy: null,
  };
}

/** Posts through the ledger, which is the only package allowed to write. */
export function createPoster(
  db: Database,
  reference: ShowcaseReference,
  fxGlCode: string,
): { post: (draft: EntryDraft) => Promise<string>; count: () => number } {
  const ledger = createLedger(db);
  let count = 0;

  return {
    async post(draft) {
      const input = withExchangeDifference(reference, draft, fxGlCode);
      const result = await ledger.postEntry(input);
      if (!result.ok) {
        throw new Error(
          `showcase posting rejected (${result.error.code}): ${result.error.message} — ${draft.description}`,
        );
      }
      count += 1;
      return result.value.id;
    },
    count: () => count,
  };
}
