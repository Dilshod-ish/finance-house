import { describe, expect, it } from 'vitest';
import { LANGUAGES, auditMessages, declaredKeys } from '@fincore/shared';
import { UI_MESSAGES, UI_MESSAGE_KEYS } from '../../src/messages.js';
import { createTranslate } from '../../src/format/translate.js';

describe('UI_MESSAGES', () => {
  it('translates every key into all three languages, with none left over', () => {
    const { missing, unused } = auditMessages(UI_MESSAGES, declaredKeys([...UI_MESSAGE_KEYS]));
    expect(missing).toEqual([]);
    expect(unused).toEqual([]);
  });

  it('holds no report line labels — those belong to @fincore/reports', () => {
    expect(
      UI_MESSAGE_KEYS.filter((key) => key.startsWith('bs.') || key.startsWith('pnl.')),
    ).toEqual([]);
  });

  it('has a distinct translation per language wherever the script differs', () => {
    // Guards against a row filled in by copying the Uzbek across.
    expect(UI_MESSAGES.ru['nav.balanceSheet']).not.toBe(UI_MESSAGES.en['nav.balanceSheet']);
    expect(UI_MESSAGES.uz['check.netProfit']).not.toBe(UI_MESSAGES.ru['check.netProfit']);
  });
});

describe('createTranslate', () => {
  it('reads the asked-for language', () => {
    for (const language of LANGUAGES) {
      expect(createTranslate(language, UI_MESSAGES)('nav.pnl')).toBe(
        UI_MESSAGES[language]['nav.pnl'],
      );
    }
  });

  it('falls through the tables in order', () => {
    const extra = { uz: { 'x.y': 'birinchi' }, ru: {}, en: {} };
    expect(createTranslate('uz', extra, UI_MESSAGES)('x.y')).toBe('birinchi');
    expect(createTranslate('uz', extra, UI_MESSAGES)('nav.pnl')).toBe(UI_MESSAGES.uz['nav.pnl']);
  });

  it('shows a missing key as the key, so the gap is visible not blank', () => {
    expect(createTranslate('uz', UI_MESSAGES)('nope.missing')).toBe('[nope.missing]');
  });

  it('interpolates named values, and leaves an unknown placeholder alone', () => {
    const translate = createTranslate('en', UI_MESSAGES);
    expect(translate('drilldown.capped', { limit: '500' })).toBe(
      'Showing the first 500 entries only',
    );
    expect(translate('drilldown.capped', {})).toBe('Showing the first {limit} entries only');
  });
});
