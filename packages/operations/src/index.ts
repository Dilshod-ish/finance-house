/**
 * @fincore/operations — cash movements, from an uploaded file to the ledger.
 *
 * It owns no ledger writes of its own: every entry goes through
 * `@fincore/ledger` (CLAUDE.md §4), and `cash_operation` is the source
 * document behind them, never a second place a report could read from.
 */
export { createOperations } from './operations.js';
export type {
  AssignArticleInput,
  BatchSummary,
  ImportStatementInput,
  Operations,
  RevertBatchInput,
} from './operations.js';
export { dedupHash, fileHash, foldText, type DedupInput } from './dedup.js';
export { rateOn } from './fx.js';
export { readStatement, type StatementContents } from './read-statement.js';
export type {
  AssignResult,
  CashOperationDraft,
  DuplicateRow,
  ImportResult,
  ImportedOperation,
  InboxRow,
  OperationsError,
  OperationsErrorCode,
  RevertResult,
  StatementHeader,
} from './types.js';
