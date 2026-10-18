export { createLedger, type Ledger } from './ledger.js';
export { prepareEntry, type EntryContext } from './validate.js';
export type { PostingError, PostingErrorCode } from './errors.js';
export type {
  JournalEntryRecord,
  LineDimensions,
  PostEntryInput,
  PostEntryLineInput,
  PreparedEntry,
  PreparedLine,
  ReplaceEntryResult,
  ReverseEntryOptions,
  TrialBalanceQuery,
  TrialBalanceRow,
} from './types.js';
