import { describe, expect, it } from 'vitest';
import {
  NO_VALUE,
  amountTone,
  compactAmount,
  deltaTone,
  formatAmount,
  formatDeltaPercent,
  formatPercent,
  joinCompact,
} from '../../src/format/number.js';
import { UI_MESSAGES } from '../../src/messages.js';
import { createTranslate } from '../../src/format/translate.js';

/** The separator is a narrow no-break space, invisible in a diff. */
const NBSP = ' ';
const spaced = (text: string) => text.replaceAll(NBSP, '_');

describe('formatAmount', () => {
  it('groups thousands and uses a comma for decimals', () => {
    expect(spaced(formatAmount('1709505612.5000'))).toBe('1_709_505_612,50');
  });

  it('does not break the group separator across lines', () => {
    expect(formatAmount('1000000')).toContain(NBSP);
    expect(formatAmount('1000000')).not.toContain(' ');
  });

  it('puts a minus sign on a negative, never parentheses', () => {
    expect(spaced(formatAmount('-11188506.0000'))).toBe('-11_188_506,00');
    expect(formatAmount('-1')).not.toContain('(');
  });

  it('distinguishes zero from no value', () => {
    expect(formatAmount('0')).toBe('0,00');
    expect(NO_VALUE).toBe('—');
  });

  it('rounds at presentation, half away from zero', () => {
    expect(formatAmount('2.005', { decimals: 2 })).toBe('2,01');
    expect(formatAmount('-2.005', { decimals: 2 })).toBe('-2,01');
    expect(formatAmount('1709505612.5000', { decimals: 0 })).toBe(
      `1${NBSP}709${NBSP}505${NBSP}613`,
    );
  });

  it('omits the separator entirely under a thousand', () => {
    expect(formatAmount('999.5')).toBe('999,50');
  });

  it('shows a plus sign only when asked, and never on zero as a loss', () => {
    expect(formatAmount('5', { signed: true, decimals: 0 })).toBe('+5');
    expect(formatAmount('0', { signed: true, decimals: 0 })).toBe('+0');
    expect(formatAmount('-5', { signed: true, decimals: 0 })).toBe('-5');
  });

  it('never loses a digit of a numeric(20,4) figure', () => {
    expect(spaced(formatAmount('99999999999999.9999', { decimals: 4 }))).toBe(
      '99_999_999_999_999,9999',
    );
  });
});

describe('compactAmount', () => {
  const cases: readonly [string, string, string | null][] = [
    ['412400000', '412,4', 'unit.million'],
    ['1840000000', '1,84', 'unit.billion'],
    ['1709505612.5', '1,71', 'unit.billion'],
    ['2500', '2,50', 'unit.thousand'],
    ['999.99', '999,99', null],
    ['-1840000000', '-1,84', 'unit.billion'],
    ['1500000000000', '1,50', 'unit.trillion'],
    ['45000000', '45,0', 'unit.million'],
  ];

  it.each(cases)('scales %s to %s', (input, value, unitKey) => {
    const compact = compactAmount(input);
    expect(compact.value.replaceAll(NBSP, ' ')).toBe(value);
    expect(compact.unitKey).toBe(unitKey);
  });

  it('keeps the exact figure for the hover title the design system requires', () => {
    expect(spaced(compactAmount('1709505612.5').exact)).toBe('1_709_505_612,50');
  });

  it('uses two decimals below ten and one above, so width stays even', () => {
    expect(compactAmount('9500000').value).toBe('9,50');
    expect(compactAmount('95000000').value).toBe('95,0');
  });

  it('is exactly at the threshold, not above it', () => {
    expect(compactAmount('1000000').unitKey).toBe('unit.million');
    expect(compactAmount('999999.99').unitKey).toBe('unit.thousand');
  });
});

describe('joinCompact', () => {
  it('attaches the suffix in the reader language', () => {
    const uz = createTranslate('uz', UI_MESSAGES);
    const ru = createTranslate('ru', UI_MESSAGES);
    const en = createTranslate('en', UI_MESSAGES);
    const compact = compactAmount('412400000');
    expect(spaced(joinCompact(compact, uz))).toBe('412,4_mln');
    expect(spaced(joinCompact(compact, ru))).toBe('412,4_млн');
    expect(spaced(joinCompact(compact, en))).toBe('412,4_M');
  });

  it('leaves a small figure alone', () => {
    expect(joinCompact(compactAmount('12.5'), createTranslate('uz', UI_MESSAGES))).toBe('12,50');
  });
});

describe('percentages', () => {
  it('formats to one decimal by default', () => {
    expect(formatPercent('96.7134')).toBe('96,7%');
    expect(formatPercent('108.7478', 2)).toBe('108,75%');
  });

  it('shows no value rather than a zero percent when there was no base', () => {
    expect(formatPercent(null)).toBe(NO_VALUE);
    expect(formatDeltaPercent(null)).toBe(NO_VALUE);
  });

  it('always signs a delta, because direction is the message', () => {
    expect(formatDeltaPercent('12.44')).toBe('+12,4%');
    expect(formatDeltaPercent('-3.5')).toBe('-3,5%');
  });
});

describe('tone — colour carries meaning or nothing', () => {
  it('paints money lost, and leaves everything else neutral', () => {
    expect(amountTone('-1')).toBe('danger');
    expect(amountTone('0')).toBe('neutral');
    expect(amountTone('1000000')).toBe('neutral');
  });

  it('reads a delta against what good looks like on that line', () => {
    expect(deltaTone('100', true)).toBe('success');
    expect(deltaTone('100', false)).toBe('danger');
    expect(deltaTone('-100', true)).toBe('danger');
    expect(deltaTone('-100', false)).toBe('success');
  });

  it('calls no change neither good nor bad', () => {
    expect(deltaTone('0', true)).toBe('neutral');
    expect(deltaTone('0', false)).toBe('neutral');
  });
});
