import { describe, expect, it } from 'vitest';
import { isoDate } from '@fincore/shared';
import { dedupHash, fileHash, foldText, type DedupInput } from '../../src/dedup.js';

const base: DedupInput = {
  accountId: '7c1d3a90-0000-4000-8000-000000000001',
  cashDate: isoDate('2026-04-07'),
  direction: 'in',
  amount: '300000.0000',
  currency: 'UZS',
  documentNumber: '000142',
  purpose: 'Shartnoma 12/26 bo‘yicha',
};

const hashOf = (over: Partial<DedupInput> = {}): string => dedupHash({ ...base, ...over });

describe('foldText', () => {
  it('ignores case, repeated spaces and surrounding punctuation', () => {
    expect(foldText('  TO‘LOV   uchun. ')).toBe('to‘lov uchun');
  });

  it('treats the spaces a bank uses as separators as ordinary ones', () => {
    // No-break and narrow no-break space: what a thousands separator leaves.
    expect(foldText('12 500 00')).toBe('12 500 00');
    expect(foldText('12 500')).toBe('12 500');
  });

  it('keeps letters and digits inside the text', () => {
    expect(foldText('Invoice #12/26')).toBe('invoice #12/26');
  });
});

describe('dedupHash', () => {
  it('is stable for the same movement', () => {
    expect(hashOf()).toBe(hashOf());
  });

  it('ignores how the bank wrote the purpose', () => {
    expect(hashOf({ purpose: 'SHARTNOMA  12/26  BO‘YICHA' })).toBe(hashOf());
  });

  const variants: readonly [string, Partial<DedupInput>][] = [
    ['account', { accountId: '7c1d3a90-0000-4000-8000-000000000002' }],
    ['date', { cashDate: isoDate('2026-04-08') }],
    ['direction', { direction: 'out' }],
    ['amount', { amount: '300000.0001' }],
    ['currency', { currency: 'USD' }],
    ['document number', { documentNumber: '000143' }],
  ];

  it.each(variants)('separates two movements that differ by %s', (_what, over) => {
    expect(hashOf(over)).not.toBe(hashOf());
  });

  it('keeps two same-day, same-amount payments apart by document number', () => {
    // The case that costs a business a payment if the reference is left out.
    expect(hashOf({ documentNumber: '000142' })).not.toBe(hashOf({ documentNumber: '000199' }));
  });

  it('falls back to the purpose when there is no document number', () => {
    const withoutDoc = hashOf({ documentNumber: null });
    expect(withoutDoc).not.toBe(hashOf());
    expect(withoutDoc).toBe(hashOf({ documentNumber: '   ' }));
    expect(withoutDoc).not.toBe(hashOf({ documentNumber: null, purpose: 'something else' }));
  });

  it('still hashes a row with neither a reference nor a purpose', () => {
    expect(hashOf({ documentNumber: null, purpose: null })).toMatch(/^[0-9a-f]{64}$/);
  });

  it('cannot be confused by a value that looks like two fields joined', () => {
    // The separator is a unit separator, which no cell value can contain.
    expect(hashOf({ documentNumber: `000142\u001fUZS` })).not.toBe(hashOf());
  });
});

describe('fileHash', () => {
  it('is the sha-256 of the bytes', () => {
    expect(fileHash(new Uint8Array([1, 2, 3]))).toBe(fileHash(new Uint8Array([1, 2, 3])));
    expect(fileHash(new Uint8Array([1, 2, 3]))).not.toBe(fileHash(new Uint8Array([1, 2, 4])));
    expect(fileHash(new Uint8Array())).toMatch(/^[0-9a-f]{64}$/);
  });
});
