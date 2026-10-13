import { Money, currency, isoDate, type IsoDate } from '@fincore/shared';
import type { EntryContext } from '../../src/validate.js';
import type { PostEntryInput, PostEntryLineInput } from '../../src/types.js';

export const UZS = currency('UZS');
export const USD = currency('USD');

export const context = (over: Partial<EntryContext> = {}): EntryContext => ({
  functionalCurrency: UZS,
  lockedThrough: null,
  ...over,
});

export const line = (over: Partial<PostEntryLineInput> = {}): PostEntryLineInput => ({
  glAccountId: '11111111-1111-1111-1111-111111111111',
  side: 'D',
  amount: Money.of('100', UZS),
  ...over,
});

export const entry = (over: Partial<PostEntryInput> = {}): PostEntryInput => ({
  orgId: '00000000-0000-0000-0000-0000000000aa',
  legalEntityId: '00000000-0000-0000-0000-0000000000bb',
  accrualDate: isoDate('2026-05-15'),
  kind: 'manual',
  sourceType: 'manual_entry',
  lines: [
    line({ side: 'D', amount: Money.of('100', UZS) }),
    line({ side: 'C', amount: Money.of('100', UZS) }),
  ],
  ...over,
});

export const date = (value: string): IsoDate => isoDate(value);
