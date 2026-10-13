import type { IsoDate } from '@fincore/shared';

/**
 * Expected domain failures. These are returned as `Err`, never thrown:
 * a locked period or an unbalanced entry is an answer, not a crash.
 * Programmer errors and infrastructure faults still throw (CLAUDE.md §9).
 */
export type PostingError =
  | { readonly code: 'MISSING_SOURCE_TYPE'; readonly message: string }
  | { readonly code: 'RESERVED_KIND'; readonly message: string; readonly kind: string }
  | { readonly code: 'INVALID_DATE'; readonly message: string; readonly value: string }
  | { readonly code: 'TOO_FEW_LINES'; readonly message: string; readonly lineCount: number }
  | { readonly code: 'SINGLE_SIDED'; readonly message: string; readonly side: 'D' | 'C' }
  | {
      readonly code: 'NON_POSITIVE_AMOUNT';
      readonly message: string;
      readonly lineIndex: number;
      readonly amount: string;
    }
  | {
      readonly code: 'INVALID_FX_RATE';
      readonly message: string;
      readonly lineIndex: number;
      readonly fxRate: string;
    }
  | {
      readonly code: 'MISSING_FX_RATE';
      readonly message: string;
      readonly lineIndex: number;
      readonly currency: string;
    }
  | {
      readonly code: 'FX_RATE_MISMATCH';
      readonly message: string;
      readonly lineIndex: number;
      readonly currency: string;
      readonly fxRate: string;
    }
  | {
      readonly code: 'UNBALANCED';
      readonly message: string;
      readonly debit: string;
      readonly credit: string;
      readonly difference: string;
      readonly currency: string;
    }
  | {
      readonly code: 'PERIOD_LOCKED';
      readonly message: string;
      readonly lockedThrough: IsoDate;
      readonly attemptedDate: IsoDate;
      readonly legalEntityId: string;
    }
  | {
      readonly code: 'LEGAL_ENTITY_NOT_FOUND';
      readonly message: string;
      readonly legalEntityId: string;
    }
  | { readonly code: 'ENTRY_NOT_FOUND'; readonly message: string; readonly entryId: string }
  | {
      readonly code: 'ALREADY_REVERSED';
      readonly message: string;
      readonly entryId: string;
      readonly reversedById: string;
    };

export type PostingErrorCode = PostingError['code'];
