import type { CurrencyCode, IsoDate, Money } from '@fincore/shared';
import type { EntryKind, Side } from '@fincore/db';

/** Dimensions a line may carry (§2.2). All optional except the GL account. */
export interface LineDimensions {
  readonly accountId?: string | null;
  readonly articleId?: string | null;
  readonly directionId?: string | null;
  readonly counterpartyId?: string | null;
  readonly dealId?: string | null;
  readonly projectId?: string | null;
  readonly employeeId?: string | null;
  readonly costCenterId?: string | null;
  readonly tags?: readonly string[];
  readonly memo?: string | null;
}

export interface PostEntryLineInput extends LineDimensions {
  readonly glAccountId: string;
  readonly side: Side;
  /** As transacted, carrying its own currency. */
  readonly amount: Money;
  /**
   * Units of functional currency per one unit of `amount.currency`. Omit when
   * the line is already in the functional currency; supplying anything but 1
   * there is rejected.
   */
  readonly fxRate?: string;
  /** Defaults to the entry's `sourceType` (I3). */
  readonly sourceType?: string;
  readonly sourceId?: string | null;
}

export interface PostEntryInput {
  readonly orgId: string;
  readonly legalEntityId: string;
  /** I6: when the economic event belongs. Drives P&L and the period lock. */
  readonly accrualDate: IsoDate;
  /** I6: when money actually moved. Null for a pure accrual. */
  readonly cashDate?: IsoDate | null;
  readonly kind: EntryKind;
  /** I3: mandatory. */
  readonly sourceType: string;
  readonly sourceId?: string | null;
  readonly description?: string | null;
  /** Makes the call idempotent; unique per organization. */
  readonly idempotencyKey?: string | null;
  readonly postedBy?: string | null;
  readonly lines: readonly PostEntryLineInput[];
}

/** Dimensions after normalisation: every field present, `null` when absent. */
export interface NormalizedDimensions {
  readonly accountId: string | null;
  readonly articleId: string | null;
  readonly directionId: string | null;
  readonly counterpartyId: string | null;
  readonly dealId: string | null;
  readonly projectId: string | null;
  readonly employeeId: string | null;
  readonly costCenterId: string | null;
  readonly tags: readonly string[];
  readonly memo: string | null;
}

/** A line as it will be stored: functional amount computed and rounded once. */
export interface PreparedLine {
  readonly glAccountId: string;
  readonly side: Side;
  readonly amount: Money;
  readonly fxRate: string;
  readonly amountFunctional: Money;
  readonly sourceType: string;
  readonly sourceId: string | null;
  readonly dimensions: NormalizedDimensions;
}

/** Output of the pure validator: everything the writer needs, nothing more. */
export interface PreparedEntry {
  readonly functionalCurrency: CurrencyCode;
  readonly lines: readonly PreparedLine[];
  readonly totalDebit: Money;
  readonly totalCredit: Money;
}

export interface JournalEntryRecord {
  readonly id: string;
  readonly orgId: string;
  readonly legalEntityId: string;
  readonly accrualDate: IsoDate;
  readonly cashDate: IsoDate | null;
  readonly kind: EntryKind;
  readonly sourceType: string;
  readonly sourceId: string | null;
  readonly description: string | null;
  readonly reversedById: string | null;
  readonly reversesId: string | null;
  readonly reversalReason: string | null;
  readonly idempotencyKey: string | null;
  readonly postedBy: string | null;
  /** True when this call found an existing entry with the same key. */
  readonly deduplicated: boolean;
}

export interface TrialBalanceQuery {
  readonly orgId: string;
  readonly legalEntityIds?: readonly string[];
  /** Inclusive bounds on `accrual_date`. */
  readonly from?: IsoDate;
  readonly to?: IsoDate;
}

export interface TrialBalanceRow {
  readonly glAccountId: string;
  readonly code: string;
  readonly name: string;
  /** Functional currency of the legal entities the row aggregates. */
  readonly currency: CurrencyCode;
  readonly debit: Money;
  readonly credit: Money;
  /** debit − credit. Positive is a debit balance. */
  readonly balance: Money;
}

export interface ReverseEntryOptions {
  /**
   * Free text for the reversal entry. Defaults to null: the link to the
   * original lives in `reverses_id` and the justification in
   * `reversal_reason`, so there is no reason to bake a surrogate key into
   * prose a user reads.
   */
  readonly description?: string | null;
  /**
   * Where the reversal lands. Defaults to the original `accrual_date` so that
   * the trial balance as of any date returns to its prior state; pass an open
   * date when the original period has since been locked (I2).
   */
  readonly accrualDate?: IsoDate;
  readonly idempotencyKey?: string | null;
}
