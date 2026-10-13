import {
  Decimal,
  Money,
  compareIsoDate,
  err,
  isIsoDate,
  ok,
  type CurrencyCode,
  type IsoDate,
  type Result,
} from '@fincore/shared';
import type { PostingError } from './errors.js';
import type {
  NormalizedDimensions,
  PostEntryInput,
  PostEntryLineInput,
  PreparedEntry,
  PreparedLine,
} from './types.js';

/** Everything the validator needs from the database, and nothing else. */
export interface EntryContext {
  readonly functionalCurrency: CurrencyCode;
  /** Latest locked date for the legal entity, or null when nothing is locked. */
  readonly lockedThrough: IsoDate | null;
}

const ONE = new Decimal(1);

function dimensionsOf(line: PostEntryLineInput): NormalizedDimensions {
  return {
    accountId: line.accountId ?? null,
    articleId: line.articleId ?? null,
    directionId: line.directionId ?? null,
    counterpartyId: line.counterpartyId ?? null,
    dealId: line.dealId ?? null,
    projectId: line.projectId ?? null,
    employeeId: line.employeeId ?? null,
    costCenterId: line.costCenterId ?? null,
    tags: line.tags ?? [],
    memo: line.memo ?? null,
  };
}

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

/** Validates one line and computes its functional amount at storage scale. */
function prepareLine(
  line: PostEntryLineInput,
  lineIndex: number,
  entrySourceType: string,
  functionalCurrency: CurrencyCode,
): Result<PreparedLine, PostingError> {
  if (!line.amount.isPositive()) {
    return err({
      code: 'NON_POSITIVE_AMOUNT',
      message: `Line ${String(lineIndex)}: amount must be greater than zero; direction belongs in \`side\``,
      lineIndex,
      amount: line.amount.toStorage(),
    });
  }

  const sameCurrency = line.amount.currency === functionalCurrency;

  if (line.fxRate === undefined) {
    if (!sameCurrency) {
      return err({
        code: 'MISSING_FX_RATE',
        message: `Line ${String(lineIndex)}: ${line.amount.currency} needs an explicit rate to ${functionalCurrency}; defaulting to 1 would silently corrupt the ledger`,
        lineIndex,
        currency: line.amount.currency,
      });
    }
  }

  const rawRate = line.fxRate ?? '1';
  let rate: Decimal;
  try {
    rate = new Decimal(rawRate);
  } catch {
    return err({
      code: 'INVALID_FX_RATE',
      message: `Line ${String(lineIndex)}: fxRate ${rawRate} is not a number`,
      lineIndex,
      fxRate: rawRate,
    });
  }
  if (!rate.isFinite() || !rate.greaterThan(0)) {
    return err({
      code: 'INVALID_FX_RATE',
      message: `Line ${String(lineIndex)}: fxRate must be a finite positive number, got ${rawRate}`,
      lineIndex,
      fxRate: rawRate,
    });
  }
  if (sameCurrency && !rate.equals(ONE)) {
    return err({
      code: 'FX_RATE_MISMATCH',
      message: `Line ${String(lineIndex)}: ${functionalCurrency} is the functional currency, so fxRate must be 1, got ${rawRate}`,
      lineIndex,
      currency: line.amount.currency,
      fxRate: rawRate,
    });
  }

  const sourceType = line.sourceType ?? entrySourceType;
  if (isBlank(sourceType)) {
    return err({
      code: 'MISSING_SOURCE_TYPE',
      message: `Line ${String(lineIndex)}: source_type is mandatory (I3)`,
    });
  }

  return ok({
    glAccountId: line.glAccountId,
    side: line.side,
    amount: line.amount,
    fxRate: rate.toFixed(10),
    // Rounded here, once, to the storage scale — so the balance we check is
    // exactly the balance the database will check (I1).
    amountFunctional: line.amount.convert(rate, functionalCurrency).round(),
    sourceType,
    sourceId: line.sourceId ?? null,
    dimensions: dimensionsOf(line),
  });
}

/**
 * The whole of the posting engine's judgement, as a pure function. Runs before
 * anything touches the database, so an invalid entry never opens a transaction.
 */
export function prepareEntry(
  input: PostEntryInput,
  context: EntryContext,
): Result<PreparedEntry, PostingError> {
  if (isBlank(input.sourceType)) {
    return err({
      code: 'MISSING_SOURCE_TYPE',
      message: 'source_type is mandatory: every figure must trace to its source document (I3)',
    });
  }

  if (input.kind === 'reversal') {
    return err({
      code: 'RESERVED_KIND',
      message: "kind 'reversal' is reserved for reverseEntry(), which links reverses_id (I4)",
      kind: input.kind,
    });
  }

  // Widened to string first: the branded type would narrow to `never` here,
  // and these values reach us from JSON as often as from typed code.
  const accrualDate: string = input.accrualDate;
  if (!isIsoDate(accrualDate)) {
    return err({
      code: 'INVALID_DATE',
      message: `accrual_date must be a real calendar date, got ${accrualDate}`,
      value: accrualDate,
    });
  }

  const cashDate: string | null = input.cashDate ?? null;
  if (cashDate !== null && !isIsoDate(cashDate)) {
    return err({
      code: 'INVALID_DATE',
      message: `cash_date must be a real calendar date, got ${cashDate}`,
      value: cashDate,
    });
  }

  if (context.lockedThrough !== null && compareIsoDate(accrualDate, context.lockedThrough) <= 0) {
    return err({
      code: 'PERIOD_LOCKED',
      message: `Period is locked through ${context.lockedThrough}; post a reversal in an open period instead of writing to ${accrualDate} (I2)`,
      lockedThrough: context.lockedThrough,
      attemptedDate: accrualDate,
      legalEntityId: input.legalEntityId,
    });
  }

  if (input.lines.length < 2) {
    return err({
      code: 'TOO_FEW_LINES',
      message: `A double entry needs at least two lines, got ${String(input.lines.length)}`,
      lineCount: input.lines.length,
    });
  }

  const prepared: PreparedLine[] = [];
  for (const [lineIndex, line] of input.lines.entries()) {
    const result = prepareLine(line, lineIndex, input.sourceType, context.functionalCurrency);
    if (!result.ok) {
      return result;
    }
    prepared.push(result.value);
  }

  let totalDebit = Money.zero(context.functionalCurrency);
  let totalCredit = Money.zero(context.functionalCurrency);
  for (const line of prepared) {
    if (line.side === 'D') {
      totalDebit = totalDebit.plus(line.amountFunctional);
    } else {
      totalCredit = totalCredit.plus(line.amountFunctional);
    }
  }

  if (totalDebit.isZero()) {
    return err({
      code: 'SINGLE_SIDED',
      message: 'Entry has no debit line',
      side: 'D',
    });
  }
  if (totalCredit.isZero()) {
    return err({
      code: 'SINGLE_SIDED',
      message: 'Entry has no credit line',
      side: 'C',
    });
  }

  if (!totalDebit.equals(totalCredit)) {
    const difference = totalDebit.minus(totalCredit);
    return err({
      code: 'UNBALANCED',
      message: `Entry is out of balance by ${difference.toStorage()} ${context.functionalCurrency} (I1)`,
      debit: totalDebit.toStorage(),
      credit: totalCredit.toStorage(),
      difference: difference.toStorage(),
      currency: context.functionalCurrency,
    });
  }

  return ok({
    functionalCurrency: context.functionalCurrency,
    lines: prepared,
    totalDebit,
    totalCredit,
  });
}
