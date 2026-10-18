import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

/**
 * M2 end to end, through the browser: a file goes in, what it could not
 * classify waits in the queue, classifying it moves the money off the
 * suspense account, and the upload can be undone.
 *
 * The fixture is a real statement workbook built from the real template, so
 * this suite exercises the same path a client's file takes. Regenerate it with
 * `pnpm --filter @fincore/operations fixture apps/web/e2e/fixtures/statement.xlsx`.
 */
const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'statement.xlsx');

/*
 * This suite writes: it imports a statement and corrects the ledger. Unlike
 * the read-only report suite it therefore needs a freshly seeded database —
 * `pnpm db:reset` — because the product never deletes a `cash_operation`, so a
 * second run would see its own first run's rows as duplicates. Checked up
 * front, because failing on the precondition is far clearer than failing
 * twenty lines later on a figure that looks wrong for no reason.
 */
test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await page.goto('/operations?lang=uz');
  const standing = page.getByRole('row').filter({ hasText: 'april.xlsx' });
  const count = await standing.count();
  await page.close();
  if (count > 0) {
    throw new Error(
      'This database already carries an imported statement. Run `pnpm db:reset` before `pnpm test:e2e`.',
    );
  }
});

/** Hands the file to the picker the way a person does. */
async function upload(page: Page): Promise<void> {
  await page.getByTestId('statement-file').setInputFiles({
    name: 'april.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: await readFile(FIXTURE),
  });
}

const normalize = (text: string): string => text.replace(/\s+/gu, ' ').trim();

test('a statement goes in, is classified, refused twice, and undone', async ({ page }) => {
  await page.goto('/operations?lang=uz');
  await expect(page.getByRole('heading', { name: 'Operatsiyalar' }).first()).toBeVisible();

  // ---- the file lands -------------------------------------------------
  await upload(page);
  await expect(page.getByText(/2 qator/)).toBeVisible();

  const queue = page.getByRole('row').filter({ hasText: 'unidentified transfer' });
  await expect(queue).toBeVisible();
  expect(normalize(await queue.innerText())).toContain('300 000,00');

  // ---- classifying it corrects the ledger ------------------------------
  await queue.getByRole('combobox').selectOption({ label: 'Выручка от проектов' });
  await queue.getByRole('button', { name: 'Tayinlash' }).click();
  // It leaves the queue only once the server confirms the correction.
  await expect(page.getByRole('row').filter({ hasText: 'unidentified transfer' })).toHaveCount(0);

  // ---- the same bytes are refused while that import stands -------------
  await upload(page);
  await expect(page.getByText(/allaqachon yuklangan/)).toBeVisible();

  // ---- undoing it needs a reason, which the reversal carries -----------
  const batch = page.getByRole('row').filter({ hasText: 'april.xlsx' }).first();
  await expect(batch).toBeVisible();
  const revert = batch.getByRole('button', { name: 'Bekor qilish' });
  await expect(revert).toBeDisabled();
  await batch.getByRole('textbox').fill('wrong month');
  await revert.click();
  await expect(page.getByRole('row').filter({ hasText: 'april.xlsx' }).first()).toContainText(
    'Bekor qilingan',
  );

  // ---- and then the file may load again, as all duplicates -------------
  // The product never deletes a `cash_operation`, so the rows the reverted
  // batch recorded still make every row of this upload a duplicate.
  await upload(page);
  await expect(page.getByText(/2 takror/)).toBeVisible();
});
