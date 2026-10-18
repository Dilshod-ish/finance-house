import type { CashDirection, CurrencyCode, IsoDate, Money } from '@fincore/shared';
import type { Problem } from '@fincore/importers';

/**
 * One cash movement as the source said it, before anything is resolved. The
 * names are what a person wrote in a spreadsheet; turning them into ids is the
 * service's job, and failing to is not an error — an unknown article leaves
 * the operation unclassified, which is a state the product is built around.
 */
export interface CashOperationDraft {
  readonly rowNumber: number | null;
  readonly cashDate: IsoDate;
  readonly direction: CashDirection;
  readonly amount: Money;
  readonly documentNumber: string | null;
  readonly counterpartyName: string | null;
  readonly counterpartyTaxId: string | null;
  readonly articleName: string | null;
  readonly directionName: string | null;
  readonly purpose: string | null;
  readonly memo: string | null;
}

/** What the `Hisob` sheet said the statement is for. */
export interface StatementHeader {
  readonly accountName: string;
  readonly accountNumber: string | null;
  readonly currency: CurrencyCode;
  readonly periodFrom: IsoDate | null;
  readonly periodTo: IsoDate | null;
  readonly openingBalance: Money | null;
  readonly closingBalance: Money | null;
}

export interface ImportedOperation {
  readonly id: string;
  readonly rowNumber: number | null;
  readonly entryId: string;
  readonly cashDate: IsoDate;
  readonly direction: CashDirection;
  readonly amount: Money;
  /** Null when no article matched: it posted against the suspense account. */
  readonly articleId: string | null;
}

/**
 * A row that matches one already in the account. It is reported, never posted:
 * the same file loaded twice would otherwise double the bank balance, and only
 * the person can say whether two identical payments really happened (PRD
 * US-2.1).
 */
export interface DuplicateRow {
  readonly rowNumber: number | null;
  readonly cashDate: IsoDate;
  readonly amount: Money;
  readonly documentNumber: string | null;
  /** The operation it matches. */
  readonly existingOperationId: string;
}

export interface ImportResult {
  readonly batchId: string;
  readonly accountId: string;
  readonly rowCount: number;
  readonly posted: readonly ImportedOperation[];
  readonly duplicates: readonly DuplicateRow[];
  /** Rows that posted against the suspense account, awaiting an article. */
  readonly unassignedCount: number;
  /**
   * Article names the file used that this organization does not have. The row
   * still posts, unclassified: refusing the file over one typo would be worse
   * than loading it and saying so.
   */
  readonly unknownArticles: readonly string[];
}

export interface RevertResult {
  readonly batchId: string;
  readonly reversedEntryIds: readonly string[];
}

export interface AssignResult {
  readonly operationId: string;
  /** The entry that was reversed, and the one that replaced it. */
  readonly reversedEntryId: string;
  readonly entryId: string;
}

export interface InboxRow {
  readonly id: string;
  readonly accountId: string;
  readonly accountName: string;
  readonly cashDate: IsoDate;
  readonly direction: CashDirection;
  readonly amount: Money;
  readonly counterpartyName: string | null;
  readonly documentNumber: string | null;
  readonly purpose: string | null;
}

export type OperationsErrorCode =
  /** The file is not one of the known templates. */
  | 'unknown_template'
  /** The file failed validation; `problems` says where. */
  | 'invalid_file'
  /** These exact bytes are already imported and that import still stands. */
  | 'already_imported'
  /** The `Hisob` sheet names an account this organization does not have. */
  | 'unknown_account'
  /** The statement's currency is not the account's. */
  | 'currency_mismatch'
  /** The organization has no account carrying the role a posting needs. */
  | 'missing_gl_account'
  /** No FX rate for the pair; a made-up rate is worse than a refusal. */
  | 'missing_fx_rate'
  | 'unknown_batch'
  | 'batch_already_reverted'
  | 'unknown_operation'
  | 'unknown_article'
  /** The operation's entry was reversed; there is nothing live to reassign. */
  | 'operation_not_live'
  /** The ledger refused. `detail` carries its message. */
  | 'posting_refused';

export interface OperationsError {
  readonly code: OperationsErrorCode;
  readonly message: string;
  readonly problems?: readonly Problem[];
}
