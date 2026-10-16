import { expect, test } from '@playwright/test';

/**
 * The demo seed's figures. A diff here means the ledger or a report changed.
 *
 * Two forms on purpose: a report is rounded to whole units for reading, while
 * the check screen shows the exact figure, because rounding a reconciliation
 * is how a residual gets hidden.
 */
const NET_PROFIT_ROUNDED = '1 859 049 257';
const NET_PROFIT_EXACT = '1 859 049 256,50';
/** The balance sheet's cash line, reached instead through the cash flow. */
const CLOSING_CASH = '2 191 476 833';
const PERIOD = 'from=2026-01-01&to=2026-03-31';

/** The UI separates groups with a narrow no-break space; tests compare plainly. */
const normalize = (text: string): string => text.replace(/[\u202f\u00a0\s]+/gu, ' ').trim();

test('the P&L renders, and every figure opens the entries behind it (I3)', async ({ page }) => {
  await page.goto(`/reports/pnl?${PERIOD}`);

  await expect(page.getByRole('heading', { name: 'Daromad va xarajatlar' })).toBeVisible();

  const netProfitRow = page.getByRole('row').filter({ hasText: 'Sof foyda' }).first();
  await expect(netProfitRow).toBeVisible();
  expect(normalize(await netProfitRow.innerText())).toContain(NET_PROFIT_ROUNDED);

  // The design system's rule: if a number shows and cannot be opened, that is
  // a design error. Clicking it must reach the ledger lines behind it.
  await netProfitRow.getByRole('button').first().click();

  const panel = page.getByRole('complementary');
  await expect(panel).toBeVisible();
  await expect(panel.getByText('Qaysi yozuvlardan')).toBeVisible();

  const drilldown = page.getByTestId('drilldown-table');
  await expect(drilldown).toBeVisible();
  await expect(drilldown.getByRole('row')).not.toHaveCount(1);

  // I3 again: each line names what produced it.
  const firstLine = normalize(await drilldown.getByRole('row').nth(1).innerText());
  expect(firstLine).toMatch(/\d{2}\.\d{2}\.\d{4}/);
  expect(firstLine.length).toBeGreaterThan(10);

  await panel.getByRole('button', { name: 'Yopish' }).click();
  await expect(panel).toBeHidden();
});

test('the cash flow has a column per month and ties to the ledger', async ({ page }) => {
  await page.goto(`/reports/cash-flow?${PERIOD}`);

  await expect(page.getByRole('heading', { name: 'Pul oqimi' })).toBeVisible();
  await expect(page.getByText('Sverka o‘tdi')).toBeVisible();

  for (const month of ['2026-01', '2026-02', '2026-03']) {
    await expect(page.getByRole('columnheader', { name: month })).toBeVisible();
  }

  // Closing cash is the balance sheet's cash line, by a different route.
  const closing = page.getByRole('row').filter({ hasText: 'Davr oxiriga pul' }).first();
  expect(normalize(await closing.innerText())).toContain(CLOSING_CASH);

  // A month's figure opens the entries behind that month alone (I3, I6).
  const operating = page.getByRole('row').filter({ hasText: 'Operatsion tushumlar' }).first();
  await operating.getByRole('button').first().click();

  const panel = page.getByRole('complementary');
  await expect(panel).toBeVisible();
  const drilldown = page.getByTestId('drilldown-table');
  await expect(drilldown).toBeVisible();
  // Dated by cash_date and scoped to the clicked month alone (I6).
  await expect(drilldown.getByRole('row').nth(1)).toContainText('.01.2026');
});

test('the balance sheet ties, and says so', async ({ page }) => {
  await page.goto('/reports/balance-sheet?asOf=2026-03-31');

  await expect(page.getByRole('heading', { name: 'Balans' })).toBeVisible();
  await expect(page.getByText('Balans teng', { exact: true })).toBeVisible();

  const assets = page.getByRole('row').filter({ hasText: 'AKTIVLAR' }).first();
  const liabilities = page.getByRole('row').filter({ hasText: 'PASSIVLAR' }).first();
  const amountOf = async (row: typeof assets): Promise<string> => {
    const text = normalize(await row.innerText());
    return text.replace(/^[^\d-]+/, '');
  };
  expect(await amountOf(assets)).toBe(await amountOf(liabilities));
});

test('the check screen reports a zero residual', async ({ page }) => {
  await page.goto(`/reports/checks?${PERIOD}`);

  await expect(page.getByText('Sverka o‘tdi')).toBeVisible();
  expect(normalize(await page.getByTestId('check-residual').innerText())).toBe('0,00');
  expect(normalize(await page.getByTestId('check-netProfit').innerText())).toBe(NET_PROFIT_EXACT);
});

test('the reader can switch language without losing the report', async ({ page }) => {
  await page.goto(`/reports/pnl?${PERIOD}&lang=ru`);
  await expect(page.getByRole('heading', { name: 'Доходы и расходы' })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'Чистая прибыль' }).first()).toBeVisible();

  await page.goto(`/reports/pnl?${PERIOD}&lang=en`);
  await expect(page.getByRole('heading', { name: 'Profit and loss' })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'Net profit' }).first()).toBeVisible();
});
