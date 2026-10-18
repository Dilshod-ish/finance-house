import { createHash } from 'node:crypto';
import type { CashDirection, IsoDate } from '@fincore/shared';

/**
 * What makes two statement rows the same movement.
 *
 * PRD US-2.1 names the key: account, date, amount, and the bank's own
 * reference — its document number when there is one, otherwise the payment
 * purpose, which is the only other thing the bank repeats verbatim. Without
 * that last part a business paying the same supplier the same amount twice in
 * a month would lose a payment; with the document number in it, two genuinely
 * distinct payments differ.
 *
 * The purpose is folded down before hashing — case, repeated spaces and
 * surrounding punctuation differ between a bank's export and its web statement
 * for what is certainly one row.
 */
export interface DedupInput {
  readonly accountId: string;
  readonly cashDate: IsoDate;
  readonly direction: CashDirection;
  /** Exactly as stored: a fixed-scale decimal string, never a number. */
  readonly amount: string;
  readonly currency: string;
  readonly documentNumber: string | null;
  readonly purpose: string | null;
}

/**
 * Case, spacing and edge punctuation carry no meaning in a payment purpose.
 * `\s` with the unicode flag covers the no-break and narrow no-break spaces a
 * bank's thousands separator leaves behind.
 */
export function foldText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/gu, ' ')
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
    .trim();
}

export function dedupHash(input: DedupInput): string {
  const reference =
    input.documentNumber !== null && foldText(input.documentNumber) !== ''
      ? `doc:${foldText(input.documentNumber)}`
      : `purpose:${foldText(input.purpose ?? '')}`;

  // Unit separator: a field value cannot contain it, so no two different
  // inputs can be joined into the same string.
  const parts = [
    input.accountId,
    input.cashDate,
    input.direction,
    input.amount,
    input.currency,
    reference,
  ];
  return createHash('sha256').update(parts.join('\u001f'), 'utf8').digest('hex');
}

/** sha-256 of the uploaded bytes: the same file cannot land twice. */
export function fileHash(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
