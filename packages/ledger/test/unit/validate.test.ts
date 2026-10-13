import { describe, expect, it } from 'vitest';
import { Money } from '@fincore/shared';
import { prepareEntry } from '../../src/validate.js';
import { UZS, USD, context, date, entry, line } from './helpers.js';

/** Reads the error code out of a Result, failing loudly if it succeeded. */
function errorOf(result: ReturnType<typeof prepareEntry>): string {
  if (result.ok) {
    throw new Error('expected the entry to be rejected, but it validated');
  }
  return result.error.code;
}

describe('prepareEntry — provenance and shape', () => {
  it('requires source_type (I3)', () => {
    expect(errorOf(prepareEntry(entry({ sourceType: '' }), context()))).toBe('MISSING_SOURCE_TYPE');
    expect(errorOf(prepareEntry(entry({ sourceType: '   ' }), context()))).toBe(
      'MISSING_SOURCE_TYPE',
    );
  });

  it("refuses kind 'reversal', which only reverseEntry may write (I4)", () => {
    const result = prepareEntry(entry({ kind: 'reversal' }), context());
    expect(errorOf(result)).toBe('RESERVED_KIND');
  });

  it('rejects impossible calendar dates', () => {
    expect(errorOf(prepareEntry(entry({ accrualDate: '2026-02-30' as never }), context()))).toBe(
      'INVALID_DATE',
    );
    expect(errorOf(prepareEntry(entry({ cashDate: '2026-13-01' as never }), context()))).toBe(
      'INVALID_DATE',
    );
  });

  it('accepts a null cash date — a pure accrual has none (I6)', () => {
    const result = prepareEntry(entry({ cashDate: null }), context());
    expect(result.ok).toBe(true);
  });

  it('accepts a valid cash date', () => {
    const result = prepareEntry(entry({ cashDate: date('2026-05-20') }), context());
    expect(result.ok).toBe(true);
  });

  it('needs at least two lines', () => {
    expect(errorOf(prepareEntry(entry({ lines: [] }), context()))).toBe('TOO_FEW_LINES');
    expect(errorOf(prepareEntry(entry({ lines: [line()] }), context()))).toBe('TOO_FEW_LINES');
  });
});

describe('prepareEntry — period lock (I2)', () => {
  it('refuses a date inside the locked period', () => {
    const result = prepareEntry(
      entry({ accrualDate: date('2026-02-10') }),
      context({ lockedThrough: date('2026-02-28') }),
    );
    expect(errorOf(result)).toBe('PERIOD_LOCKED');
  });

  it('refuses the lock boundary itself', () => {
    const result = prepareEntry(
      entry({ accrualDate: date('2026-02-28') }),
      context({ lockedThrough: date('2026-02-28') }),
    );
    expect(errorOf(result)).toBe('PERIOD_LOCKED');
    if (!result.ok && result.error.code === 'PERIOD_LOCKED') {
      expect(result.error.lockedThrough).toBe('2026-02-28');
      expect(result.error.attemptedDate).toBe('2026-02-28');
    }
  });

  it('allows the day after the lock', () => {
    const result = prepareEntry(
      entry({ accrualDate: date('2026-03-01') }),
      context({ lockedThrough: date('2026-02-28') }),
    );
    expect(result.ok).toBe(true);
  });

  it('returns a typed error rather than throwing', () => {
    const result = prepareEntry(
      entry({ accrualDate: date('2026-01-01') }),
      context({ lockedThrough: date('2026-02-28') }),
    );
    expect(result.ok).toBe(false);
    expect(() => prepareEntry(entry(), context())).not.toThrow();
  });
});

describe('prepareEntry — amounts and FX', () => {
  it('rejects a non-positive amount; direction belongs in `side`', () => {
    const zero = entry({
      lines: [line({ amount: Money.of('0', UZS) }), line({ side: 'C' })],
    });
    const negative = entry({
      lines: [line({ amount: Money.of('-5', UZS) }), line({ side: 'C' })],
    });
    expect(errorOf(prepareEntry(zero, context()))).toBe('NON_POSITIVE_AMOUNT');
    expect(errorOf(prepareEntry(negative, context()))).toBe('NON_POSITIVE_AMOUNT');
  });

  it('refuses to guess an FX rate for a foreign-currency line', () => {
    const result = prepareEntry(
      entry({
        lines: [line({ amount: Money.of('10', USD) }), line({ side: 'C' })],
      }),
      context(),
    );
    expect(errorOf(result)).toBe('MISSING_FX_RATE');
  });

  it('rejects an unparseable, infinite or non-positive rate', () => {
    const withRate = (fxRate: string) =>
      entry({
        lines: [line({ amount: Money.of('10', USD), fxRate }), line({ side: 'C' })],
      });
    expect(errorOf(prepareEntry(withRate('not-a-number'), context()))).toBe('INVALID_FX_RATE');
    expect(errorOf(prepareEntry(withRate('Infinity'), context()))).toBe('INVALID_FX_RATE');
    expect(errorOf(prepareEntry(withRate('0'), context()))).toBe('INVALID_FX_RATE');
    expect(errorOf(prepareEntry(withRate('-1'), context()))).toBe('INVALID_FX_RATE');
  });

  it('rejects a rate other than 1 on a functional-currency line', () => {
    const result = prepareEntry(
      entry({
        lines: [line({ amount: Money.of('10', UZS), fxRate: '1.5' }), line({ side: 'C' })],
      }),
      context(),
    );
    expect(errorOf(result)).toBe('FX_RATE_MISMATCH');
  });

  it('accepts an explicit rate of exactly 1 on a functional-currency line', () => {
    const result = prepareEntry(
      entry({
        lines: [
          line({ amount: Money.of('10', UZS), fxRate: '1' }),
          line({ side: 'C', amount: Money.of('10', UZS) }),
        ],
      }),
      context(),
    );
    expect(result.ok).toBe(true);
  });

  it('converts and rounds to storage scale exactly once', () => {
    const result = prepareEntry(
      entry({
        lines: [
          line({ amount: Money.of('10', USD), fxRate: '12650.1234567891' }),
          line({ side: 'C', amount: Money.of('126501.2346', UZS) }),
        ],
      }),
      context(),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.lines[0]?.amountFunctional.toStorage()).toBe('126501.2346');
      expect(result.value.lines[0]?.fxRate).toBe('12650.1234567891');
      expect(result.value.totalDebit.toStorage()).toBe('126501.2346');
    }
  });

  it('requires a source_type on every line, blank is refused (I3)', () => {
    const result = prepareEntry(
      entry({
        lines: [line({ sourceType: '  ' }), line({ side: 'C' })],
      }),
      context(),
    );
    expect(errorOf(result)).toBe('MISSING_SOURCE_TYPE');
  });

  it('inherits the entry source_type when a line does not override it', () => {
    const result = prepareEntry(entry({ sourceType: 'bank_statement' }), context());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.lines.map((l) => l.sourceType)).toEqual([
        'bank_statement',
        'bank_statement',
      ]);
    }
  });

  it('keeps a line-level source_type override', () => {
    const result = prepareEntry(
      entry({
        lines: [line({ sourceType: 'allocation', sourceId: null }), line({ side: 'C' })],
      }),
      context(),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.lines[0]?.sourceType).toBe('allocation');
    }
  });
});

describe('prepareEntry — balance (I1)', () => {
  it('rejects an entry with no credit line', () => {
    const result = prepareEntry(
      entry({ lines: [line({ side: 'D' }), line({ side: 'D' })] }),
      context(),
    );
    expect(errorOf(result)).toBe('SINGLE_SIDED');
    if (!result.ok && result.error.code === 'SINGLE_SIDED') {
      expect(result.error.side).toBe('C');
    }
  });

  it('rejects an entry with no debit line', () => {
    const result = prepareEntry(
      entry({ lines: [line({ side: 'C' }), line({ side: 'C' })] }),
      context(),
    );
    expect(errorOf(result)).toBe('SINGLE_SIDED');
    if (!result.ok && result.error.code === 'SINGLE_SIDED') {
      expect(result.error.side).toBe('D');
    }
  });

  it('rejects a mismatch of one storage unit', () => {
    const result = prepareEntry(
      entry({
        lines: [
          line({ side: 'D', amount: Money.of('100.0001', UZS) }),
          line({ side: 'C', amount: Money.of('100.0000', UZS) }),
        ],
      }),
      context(),
    );
    expect(errorOf(result)).toBe('UNBALANCED');
    if (!result.ok && result.error.code === 'UNBALANCED') {
      expect(result.error.difference).toBe('0.0001');
      expect(result.error.debit).toBe('100.0001');
      expect(result.error.credit).toBe('100.0000');
      expect(result.error.currency).toBe('UZS');
    }
  });

  it('checks balance on the ROUNDED functional amounts, as the database does', () => {
    // Two USD debits of 0.005 each round to 0.0050 apiece; the credit is 0.01.
    const result = prepareEntry(
      entry({
        lines: [
          line({ side: 'D', amount: Money.of('1', USD), fxRate: '0.005' }),
          line({ side: 'D', amount: Money.of('1', USD), fxRate: '0.005' }),
          line({ side: 'C', amount: Money.of('0.01', UZS) }),
        ],
      }),
      context(),
    );
    expect(result.ok).toBe(true);
  });

  it('accepts a balanced multi-line entry and reports both totals', () => {
    const result = prepareEntry(
      entry({
        lines: [
          line({ side: 'D', amount: Money.of('60', UZS) }),
          line({ side: 'D', amount: Money.of('40', UZS) }),
          line({ side: 'C', amount: Money.of('100', UZS) }),
        ],
      }),
      context(),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.totalDebit.toStorage()).toBe('100.0000');
      expect(result.value.totalCredit.toStorage()).toBe('100.0000');
      expect(result.value.functionalCurrency).toBe('UZS');
    }
  });
});

describe('prepareEntry — dimensions', () => {
  it('normalises every absent dimension to null', () => {
    const result = prepareEntry(entry(), context());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.lines[0]?.dimensions).toEqual({
        accountId: null,
        articleId: null,
        directionId: null,
        counterpartyId: null,
        dealId: null,
        projectId: null,
        employeeId: null,
        costCenterId: null,
        tags: [],
        memo: null,
      });
      expect(result.value.lines[0]?.sourceId).toBeNull();
    }
  });

  it('carries every supplied dimension through unchanged', () => {
    const dims = {
      accountId: 'a',
      articleId: 'b',
      directionId: 'c',
      counterpartyId: 'd',
      dealId: 'e',
      projectId: 'f',
      employeeId: 'g',
      costCenterId: 'h',
      tags: ['tender'],
      memo: 'note',
    };
    const result = prepareEntry(
      entry({ lines: [line({ ...dims, sourceId: 'i' }), line({ side: 'C' })] }),
      context(),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.lines[0]?.dimensions).toEqual(dims);
      expect(result.value.lines[0]?.sourceId).toBe('i');
    }
  });
});
