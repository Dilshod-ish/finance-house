import { describe, expect, it } from 'vitest';
import {
  LANGUAGES,
  articleTemplateFor,
  auditMessages,
  cashGlAccountFor,
  glAccountsByRole,
  GL_ACCOUNT_ROLES,
  ROLE_ACCOUNT_TYPE,
  declaredKeys,
  legalFormByCode,
  rateEffectiveOn,
  ratesEffectiveOn,
  taxRegimeByCode,
  turnoverCeilingEffectiveOn,
} from '@fincore/region-pack-contract';
import { Decimal, isoDate } from '@fincore/shared';
import { uzRegionPack as pack } from '../src/index.js';

const IN_2026 = isoDate('2026-06-15');
const BEFORE_2026 = isoDate('2025-12-31');

describe('uz pack — shape', () => {
  it('declares Uzbekistan, UZS and the CBU as its FX source', () => {
    expect(pack.code).toBe('uz');
    expect(pack.countryCode).toBe('UZ');
    expect(pack.currency.default).toBe('UZS');
    expect(pack.fxSource.id).toBe('fx.cbu');
    expect(pack.fxSource.quoteCurrency).toBe('UZS');
    expect(pack.currency.common).toContain('USD');
    expect(pack.currency.common).not.toContain(pack.currency.default);
  });

  it('ships the three legal forms, with YaTT marked as an individual', () => {
    expect(pack.legalForms.map((f) => f.code)).toEqual(['MCHJ', 'YaTT', 'XK']);
    expect(legalFormByCode(pack, 'YaTT')?.isIndividual).toBe(true);
    expect(legalFormByCode(pack, 'MCHJ')?.isIndividual).toBe(false);
    expect(legalFormByCode(pack, 'LLC')).toBeUndefined();
  });

  it('offers Russian first, with all three languages available', () => {
    expect(pack.locale.defaultLanguage).toBe('ru');
    expect([...pack.locale.languages].sort()).toEqual([...LANGUAGES].sort());
  });
});

describe('uz pack — tax regimes as versioned data', () => {
  it('carries the 2026 rates', () => {
    const cases: readonly [string, 'turnover' | 'vat' | 'profit', string][] = [
      ['aylanma_1', 'turnover', '1'],
      ['aylanma_4', 'turnover', '4'],
      ['qqs_foyda', 'vat', '12'],
      ['qqs_foyda', 'profit', '15'],
    ];
    for (const [code, kind, expected] of cases) {
      const regime = taxRegimeByCode(pack, code);
      expect(regime, code).toBeDefined();
      if (regime === undefined) continue;
      expect([code, kind, rateEffectiveOn(regime, kind, IN_2026)?.ratePercent]).toEqual([
        code,
        kind,
        expected,
      ]);
    }
  });

  it('applies payroll taxes under every regime', () => {
    for (const regime of pack.taxRegimes) {
      expect([regime.code, rateEffectiveOn(regime, 'social', IN_2026)?.ratePercent]).toEqual([
        regime.code,
        '12',
      ]);
      expect([
        regime.code,
        rateEffectiveOn(regime, 'personal_income', IN_2026)?.ratePercent,
      ]).toEqual([regime.code, '12']);
    }
  });

  it('returns nothing before the versions take effect', () => {
    const regime = taxRegimeByCode(pack, 'qqs_foyda');
    expect(regime).toBeDefined();
    if (regime === undefined) return;
    expect(ratesEffectiveOn(regime, BEFORE_2026)).toEqual([]);
    expect(rateEffectiveOn(regime, 'vat', BEFORE_2026)).toBeUndefined();
    expect(turnoverCeilingEffectiveOn(regime, IN_2026)).toBeUndefined();
  });

  it('carries the turnover ceiling the threshold radar needs', () => {
    for (const code of ['aylanma_1', 'aylanma_4']) {
      const regime = taxRegimeByCode(pack, code);
      expect(regime).toBeDefined();
      if (regime === undefined) continue;
      const ceiling = turnoverCeilingEffectiveOn(regime, IN_2026);
      expect([code, ceiling?.currency]).toEqual([code, 'UZS']);
      expect([code, new Decimal(ceiling?.amount ?? '0').toFixed(0)]).toEqual([code, '1000000000']);
    }
    expect(
      turnoverCeilingEffectiveOn(pack.taxRegimes[2] ?? pack.taxRegimes[0]!, BEFORE_2026),
    ).toBeUndefined();
  });

  it('every rate is an exact decimal string, never a float', () => {
    for (const regime of pack.taxRegimes) {
      for (const rate of regime.rates) {
        expect(typeof rate.ratePercent).toBe('string');
        expect(new Decimal(rate.ratePercent).isFinite()).toBe(true);
      }
    }
  });

  it('names only legal forms the pack declares', () => {
    const known = new Set(pack.legalForms.map((f) => f.code));
    for (const regime of pack.taxRegimes) {
      for (const form of regime.legalForms) {
        expect([regime.code, form, known.has(form)]).toEqual([regime.code, form, true]);
      }
    }
  });
});

describe('uz pack — chart of accounts and articles', () => {
  it('has unique GL codes with a normal side consistent with their class', () => {
    const codes = pack.chartOfAccountsTemplate.map((a) => a.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const account of pack.chartOfAccountsTemplate) {
      expect([account.code, account.code[0]]).toEqual([
        account.code,
        { asset: '1', liability: '2', equity: '3', income: '4', expense: '5' }[account.type],
      ]);
    }
  });

  it('binds every article to a GL account that exists', () => {
    const codes = new Set(pack.chartOfAccountsTemplate.map((a) => a.code));
    const template = articleTemplateFor(pack, 'services');
    expect(template).toBeDefined();
    if (template === undefined) return;
    for (const article of template.articles) {
      expect([article.key, codes.has(article.glAccountCode)]).toEqual([article.key, true]);
    }
    expect(articleTemplateFor(pack, 'construction')).toBeUndefined();
  });

  it('resolves every article parent inside the same template', () => {
    const template = articleTemplateFor(pack, 'services');
    if (template === undefined) throw new Error('template missing');
    const keys = new Set(template.articles.map((a) => a.key));
    for (const article of template.articles) {
      if (article.parentKey !== null) {
        expect([article.key, keys.has(article.parentKey)]).toEqual([article.key, true]);
      }
    }
    expect(new Set(template.articles.map((a) => a.key)).size).toBe(template.articles.length);
  });

  it('keeps financing, investing and transfer articles out of the P&L', () => {
    const template = articleTemplateFor(pack, 'services');
    if (template === undefined) throw new Error('template missing');
    for (const article of template.articles) {
      if (['financing', 'investing', 'transfer'].includes(article.flowType)) {
        expect([article.key, article.pnlLineCode]).toEqual([article.key, null]);
      }
    }
  });
});

describe('uz pack — account roles', () => {
  it('marks exactly one GL account per money kind (I5)', () => {
    for (const kind of ['bank', 'cash', 'card', 'ewallet'] as const) {
      const account = cashGlAccountFor(pack, kind);
      expect([kind, account?.role]).toEqual([kind, 'cash']);
    }
    expect(cashGlAccountFor(pack, 'virtual')).toBeUndefined();
  });

  it('exposes the roles the platform resolves accounts by', () => {
    for (const role of [
      'receivable',
      'payable',
      'payroll_payable',
      'revenue',
      'expense',
      'fx_difference',
      'retained_earnings',
    ] as const) {
      expect([role, glAccountsByRole(pack, role).length > 0]).toEqual([role, true]);
    }
  });

  it('gives every account a role — an unroled account falls out of every report', () => {
    for (const account of pack.chartOfAccountsTemplate) {
      expect([account.code, typeof account.role]).toEqual([account.code, 'string']);
      expect([account.code, GL_ACCOUNT_ROLES.includes(account.role)]).toEqual([account.code, true]);
    }
  });

  it('keeps each role in the account class it belongs to', () => {
    // A balance sheet that groups by role must be able to trust that `loan` is
    // a liability; a mis-tagged account would move money across the sheet.
    for (const account of pack.chartOfAccountsTemplate) {
      expect([account.code, account.role, account.type]).toEqual([
        account.code,
        account.role,
        ROLE_ACCOUNT_TYPE[account.role],
      ]);
    }
  });

  it('separates tax expense from FX difference (§7.2 has a line for each)', () => {
    const tax = glAccountsByRole(pack, 'tax_expense');
    const fx = glAccountsByRole(pack, 'fx_difference');
    expect(tax).toHaveLength(1);
    expect(fx).toHaveLength(1);
    expect(tax[0]?.code).not.toBe(fx[0]?.code);

    const template = articleTemplateFor(pack, 'services');
    if (template === undefined) throw new Error('template missing');
    const taxArticle = template.articles.find((a) => a.pnlLineCode === 'tax');
    const fxArticle = template.articles.find((a) => a.pnlLineCode === 'fx_difference');
    expect(taxArticle?.glAccountCode).toBe(tax[0]?.code);
    expect(fxArticle?.glAccountCode).toBe(fx[0]?.code);
  });

  it('covers every balance-sheet line architecture §7.3 names', () => {
    for (const role of [
      'cash',
      'receivable',
      'inventory',
      'fixed_asset',
      'payable',
      'loan',
      'share_capital',
      'retained_earnings',
    ] as const) {
      expect([role, glAccountsByRole(pack, role).length > 0]).toEqual([role, true]);
    }
  });

  it('only puts accountKind on cash accounts', () => {
    for (const account of pack.chartOfAccountsTemplate) {
      if (account.role !== 'cash') {
        expect([account.code, account.accountKind]).toEqual([account.code, null]);
      }
    }
  });
});

describe('uz pack — translations', () => {
  it('translates every declared key into uz, ru and en, with none left over', () => {
    const template = articleTemplateFor(pack, 'services');
    if (template === undefined) throw new Error('template missing');

    const keys = declaredKeys([
      ...pack.legalForms.map((f) => f.nameKey),
      ...pack.taxRegimes.flatMap((r) => [
        r.nameKey,
        r.descriptionKey,
        ...r.rates.map((rate) => rate.baseKey),
      ]),
      ...pack.chartOfAccountsTemplate.map((a) => a.nameKey),
      ...pack.articleTemplates.map((t) => t.nameKey),
      ...template.articles.map((a) => a.nameKey),
      ...pack.banks.map((b) => b.nameKey),
      ...pack.statementParsers.map((p) => p.nameKey),
      ...pack.eInvoiceProviders.map((p) => p.nameKey),
      pack.taxAuthority?.nameKey ?? null,
      pack.fxSource.nameKey,
      ...pack.reportPresets.map((p) => p.nameKey),
    ]);

    const { missing, unused } = auditMessages(pack.messages, keys);
    expect(missing).toEqual([]);
    expect(unused).toEqual([]);
  });

  it('never stores a localized string where a key belongs', () => {
    // Every *Key value is a dotted identifier, not prose.
    for (const account of pack.chartOfAccountsTemplate) {
      expect(account.nameKey).toMatch(/^[a-z][A-Za-z0-9.]*$/);
    }
  });
});
