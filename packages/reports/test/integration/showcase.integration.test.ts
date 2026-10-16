import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '@fincore/db/testing';
import {
  SHOWCASE_PROFILES,
  SHOWCASE_WINDOW,
  seedShowcase,
  type ShowcaseResult,
} from '@fincore/seed';
import { Money, currency, isoDate } from '@fincore/shared';
import { createReports, type Reports } from '../../src/index.js';

const FROM = isoDate(SHOWCASE_WINDOW.from);
const TO = isoDate(SHOWCASE_WINDOW.to);
const USD = currency('USD');

let h: TestDatabase;
let reports: Reports;
let seeded: ShowcaseResult;

beforeAll(async () => {
  h = await createTestDatabase();
  reports = createReports(h.db);
  seeded = await seedShowcase(h.db);
}, 300_000);

afterAll(async () => {
  await h.close();
});

/**
 * Three businesses with six months of books each, every one reporting in USD
 * while most of what it spends is som. These tests do not check the figures —
 * the figures are generated — they check that the three statements still agree
 * with each other and with the ledger once multi-currency, accrual-versus-cash
 * timing and six money accounts are all in play at once.
 */
describe('showcase dataset', () => {
  it('seeds every profile', () => {
    expect(seeded.orgs).toHaveLength(SHOWCASE_PROFILES.length);
    for (const org of seeded.orgs) {
      expect(org.journal.entryCount).toBeGreaterThan(150);
    }
  });

  it('reports in USD, whatever the money was earned in', async () => {
    for (const org of seeded.orgs) {
      const [pnl] = await reports.getPnl({ orgId: org.profile.orgId, from: FROM, to: TO });
      expect(pnl?.currency).toBe('USD');
    }
  });

  it('balances, for every organization (I1)', async () => {
    for (const org of seeded.orgs) {
      const [sheet] = await reports.getBalanceSheet({ orgId: org.profile.orgId, asOf: TO });
      expect(sheet?.isBalanced).toBe(true);
      expect(sheet?.difference.toStorage()).toBe('0.0000');
    }
  });

  it('ties net profit to the movement in equity, for every organization', async () => {
    for (const org of seeded.orgs) {
      const checks = await reports.reconcilePnl({ orgId: org.profile.orgId, from: FROM, to: TO });
      expect(checks.length).toBeGreaterThan(0);
      for (const check of checks) {
        expect(check.residual.toStorage()).toBe('0.0000');
      }
    }
  });

  it('ties closing cash to the ledger, for every organization and every account', async () => {
    for (const org of seeded.orgs) {
      const checks = await reports.reconcileCashFlow({
        orgId: org.profile.orgId,
        from: FROM,
        to: TO,
      });
      for (const check of checks) {
        expect(check.residual.toStorage()).toBe('0.0000');
      }

      // And per account: a transfer between two of them is a real movement on
      // each, even though it nets to nothing over the organization.
      for (const accountId of Object.values(org.reference.accounts)) {
        const [perAccount] = await reports.reconcileCashFlow({
          orgId: org.profile.orgId,
          from: FROM,
          to: TO,
          accountIds: [accountId],
        });
        expect(perAccount?.residual.toStorage()).toBe('0.0000');
      }
    }
  });

  it('shows the P&L and the cash flow disagreeing, which is the whole point (I6)', async () => {
    for (const org of seeded.orgs) {
      const [pnl] = await reports.getPnl({ orgId: org.profile.orgId, from: FROM, to: TO });
      const [cash] = await reports.getCashFlow({ orgId: org.profile.orgId, from: FROM, to: TO });
      const revenue = pnl?.rows.find((row) => row.code === 'revenue')?.amount;
      const operating = cash?.rows.find((row) => row.code === 'operating.in')?.total;
      expect(revenue).toBeDefined();
      expect(operating).toBeDefined();
      // Invoiced and collected are different numbers over the same months.
      expect(revenue?.toStorage()).not.toBe(operating?.toStorage());
    }
  });

  it('revalues what it holds in som and euro at each month end (CLAUDE.md §5)', async () => {
    for (const org of seeded.orgs) {
      const [cash] = await reports.getCashFlow({ orgId: org.profile.orgId, from: FROM, to: TO });
      const nonCash = cash?.rows.find((row) => row.code === 'nonCashChange');
      expect(nonCash).toBeDefined();
      // Something moved the balance without money moving: that is the
      // revaluation, and it has to be visible rather than absorbed.
      expect(nonCash?.amounts.some((amount) => !amount.isZero())).toBe(true);
    }
  });

  it('keeps each organization to its own books (I8)', async () => {
    const [first, second] = seeded.orgs;
    if (first === undefined || second === undefined) {
      throw new Error('expected at least two showcase organizations');
    }
    const [a] = await reports.getPnl({ orgId: first.profile.orgId, from: FROM, to: TO });
    const [b] = await reports.getPnl({ orgId: second.profile.orgId, from: FROM, to: TO });
    const revenueOf = (report: typeof a) =>
      report?.rows.find((row) => row.code === 'revenue')?.amount ?? Money.zero(USD);
    // Different businesses, so different revenue. Equal would mean one read
    // the other's ledger.
    expect(revenueOf(a).toStorage()).not.toBe(revenueOf(b).toStorage());
  });
});
