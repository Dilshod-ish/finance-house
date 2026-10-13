import { sql } from 'drizzle-orm';
import type { Database } from '@fincore/db';
import { createLedger, type PostEntryInput, type PostEntryLineInput } from '@fincore/ledger';
import { Decimal, Money, addDays, toUtcDate, type FlowType, type IsoDate } from '@fincore/shared';
import { glCodeForCash, glCodeForRole } from './pack-resolution.js';
import { rateOn, type ReferenceData, type SeedWindow, type SeededArticle } from './reference.js';
import { createRng, intBetween, pick } from './rng.js';

export interface SeededJournal {
  readonly entryCount: number;
  /** One per legal entity, dated the first day of the window. */
  readonly openingEntryIds: readonly string[];
  readonly reversedEntryId: string;
  readonly reversalEntryId: string;
  readonly fxRevaluationEntryId: string;
}

const SEED = 20260101;

/** Minor units (1/10000) kept as integers, so no float ever touches money. */
function money(minorUnits: number, currency: string): Money {
  return Money.of(new Decimal(minorUnits).dividedBy(10_000).toFixed(4), currency);
}

function isWeekend(day: IsoDate): boolean {
  const weekday = toUtcDate(day).getUTCDay();
  return weekday === 0 || weekday === 6;
}

function businessDays(window: SeedWindow): IsoDate[] {
  const days: IsoDate[] = [];
  let day = window.from;
  while (day <= window.to) {
    if (!isWeekend(day)) {
      days.push(day);
    }
    day = addDays(day, 1);
  }
  return days;
}

function articleOf(reference: ReferenceData, flow: FlowType, index: number): SeededArticle {
  const bucket = reference.articlesByFlowType.get(flow) ?? [];
  const article = bucket[index % bucket.length];
  if (article === undefined) {
    throw new Error(`no article with flow type ${flow} in the seeded template`);
  }
  return article;
}

/**
 * Posts the demo ledger through `packages/ledger` — the only package allowed to
 * write `journal_*` (CLAUDE.md §4). Every amount is derived from a fixed PRNG,
 * so the financial content is identical on every run.
 */
export async function seedJournal(
  db: Database,
  reference: ReferenceData,
  window: SeedWindow,
): Promise<SeededJournal> {
  const ledger = createLedger(db);
  const rng = createRng(SEED);
  const { pack, orgId, localCurrency, foreignCurrency: foreign } = reference;

  const glCash = glCodeForCash(pack, 'bank');
  const glCashDesk = glCodeForCash(pack, 'cash');
  const glReceivable = glCodeForRole(pack, 'receivable');
  const glPayable = glCodeForRole(pack, 'payable');
  const glPayroll = glCodeForRole(pack, 'payroll_payable');
  const glFxDifference = glCodeForRole(pack, 'fx_difference');
  const glShareCapital = glCodeForRole(pack, 'share_capital');
  const glRetained = glCodeForRole(pack, 'retained_earnings');

  const gl = (code: string): string => {
    const id = reference.glIdByCode.get(code);
    if (id === undefined) {
      throw new Error(`GL account ${code} was not seeded`);
    }
    return id;
  };

  let entryCount = 0;
  const companyExpenseEntryIds: string[] = [];

  async function post(input: PostEntryInput): Promise<string> {
    const result = await ledger.postEntry(input);
    if (!result.ok) {
      throw new Error(`seed posting rejected: ${result.error.code} — ${result.error.message}`);
    }
    entryCount += 1;
    return result.value.id;
  }

  const entry = (
    legalEntityId: string,
    accrualDate: IsoDate,
    kind: PostEntryInput['kind'],
    sourceType: string,
    lines: readonly PostEntryLineInput[],
    cashDate: IsoDate | null,
    description: string,
  ): PostEntryInput => ({
    orgId,
    legalEntityId,
    accrualDate,
    cashDate,
    kind,
    sourceType,
    description,
    lines,
    postedBy: null,
  });

  // ---- Opening balances (kind='opening') --------------------------------
  // Without these the balance sheet has no equity at all: every asset would
  // have to have arrived from revenue, which is only true of a business that
  // started with nothing. Dated the first day of the window, which is how an
  // owner states it ("as of 1 January we had ...").
  const openingEntryIds: string[] = [];
  const openingRate = rateOn(window, window.from);

  const companyOpeningLocal = money(240_000_000 * 10_000, localCurrency);
  const companyOpeningForeign = money(18_000 * 10_000, foreign);
  const companyOpeningForeignFunctional = companyOpeningForeign
    .convert(openingRate, localCurrency)
    .round();
  const companyCapital = money(100_000_000 * 10_000, localCurrency);
  const companyRetained = companyOpeningLocal
    .plus(companyOpeningForeignFunctional)
    .minus(companyCapital);

  openingEntryIds.push(
    await post(
      entry(
        reference.companyEntityId,
        window.from,
        'opening',
        'opening_balance',
        [
          {
            glAccountId: gl(glCash),
            side: 'D',
            amount: companyOpeningLocal,
            accountId: reference.accounts.companyBankLocal,
          },
          {
            glAccountId: gl(glCash),
            side: 'D',
            amount: companyOpeningForeign,
            fxRate: openingRate.toFixed(10),
            accountId: reference.accounts.companyBankForeign,
          },
          { glAccountId: gl(glShareCapital), side: 'C', amount: companyCapital },
          { glAccountId: gl(glRetained), side: 'C', amount: companyRetained },
        ],
        null,
        `Opening balance at ${window.from}`,
      ),
    ),
  );

  const traderOpening = money(35_000_000 * 10_000, localCurrency);
  openingEntryIds.push(
    await post(
      entry(
        reference.soleTraderEntityId,
        window.from,
        'opening',
        'opening_balance',
        [
          {
            glAccountId: gl(glCash),
            side: 'D',
            amount: traderOpening,
            accountId: reference.accounts.soleTraderBank,
          },
          { glAccountId: gl(glShareCapital), side: 'C', amount: traderOpening },
        ],
        null,
        `Opening balance at ${window.from}`,
      ),
    ),
  );

  const days = businessDays(window);
  const perMonth = new Map<string, IsoDate[]>();
  for (const day of days) {
    const key = day.slice(0, 7);
    perMonth.set(key, [...(perMonth.get(key) ?? []), day]);
  }

  for (const [month, monthDays] of perMonth) {
    const dayAt = (index: number): IsoDate => {
      const day = monthDays[index % monthDays.length];
      if (day === undefined) {
        throw new Error(`month ${month} has no business days`);
      }
      return day;
    };

    // ---- Company: 18 invoices accrued, 15 of them settled -------------------
    const invoices: { day: IsoDate; value: Money; article: SeededArticle }[] = [];
    for (let index = 0; index < 18; index += 1) {
      const day = dayAt(index);
      const article = articleOf(reference, 'revenue', index);
      const value = money(intBetween(rng, 8_000_000, 45_000_000) * 10_000, localCurrency);
      invoices.push({ day, value, article });
      await post(
        entry(
          reference.companyEntityId,
          day,
          'accrual',
          'obligation',
          [
            { glAccountId: gl(glReceivable), side: 'D', amount: value },
            {
              glAccountId: gl(article.glAccountCode),
              side: 'C',
              amount: value,
              articleId: article.id,
              directionId: pick(rng, reference.directionIds),
            },
          ],
          null,
          `Invoice ${month}-${String(index + 1).padStart(2, '0')}`,
        ),
      );
    }

    for (let index = 0; index < 15; index += 1) {
      const invoice = invoices[index];
      if (invoice === undefined) {
        continue;
      }
      const settledOn = dayAt(index + 3);
      await post(
        entry(
          reference.companyEntityId,
          settledOn,
          'cash',
          'bank_statement',
          [
            {
              glAccountId: gl(glCash),
              side: 'D',
              amount: invoice.value,
              accountId: reference.accounts.companyBankLocal,
            },
            { glAccountId: gl(glReceivable), side: 'C', amount: invoice.value },
          ],
          settledOn,
          `Settlement of invoice ${month}-${String(index + 1).padStart(2, '0')}`,
        ),
      );
    }

    // ---- Company: expenses, 4 paid and 2 accrued ---------------------------
    for (let index = 0; index < 6; index += 1) {
      const day = dayAt(index * 3);
      const article = articleOf(reference, index < 3 ? 'opex_fixed' : 'opex_variable', index);
      const value = money(intBetween(rng, 1_200_000, 9_000_000) * 10_000, localCurrency);
      const paid = index < 4;
      const id = await post(
        entry(
          reference.companyEntityId,
          day,
          paid ? 'cash' : 'accrual',
          paid ? 'bank_statement' : 'obligation',
          [
            {
              glAccountId: gl(article.glAccountCode),
              side: 'D',
              amount: value,
              articleId: article.id,
              directionId: pick(rng, reference.directionIds),
            },
            paid
              ? {
                  glAccountId: gl(glCash),
                  side: 'C',
                  amount: value,
                  accountId: reference.accounts.companyBankLocal,
                }
              : { glAccountId: gl(glPayable), side: 'C', amount: value },
          ],
          paid ? day : null,
          `Expense ${month}-${String(index + 1).padStart(2, '0')}`,
        ),
      );
      companyExpenseEntryIds.push(id);
    }

    // ---- Company: payroll accrued then paid --------------------------------
    const payrollArticle = articleOf(reference, 'opex_fixed', 1);
    const payroll = money(intBetween(rng, 30_000_000, 42_000_000) * 10_000, localCurrency);
    const payrollDay = dayAt(monthDays.length - 3);
    await post(
      entry(
        reference.companyEntityId,
        payrollDay,
        'payroll',
        'payroll_run',
        [
          {
            glAccountId: gl(payrollArticle.glAccountCode),
            side: 'D',
            amount: payroll,
            articleId: payrollArticle.id,
          },
          { glAccountId: gl(glPayroll), side: 'C', amount: payroll },
        ],
        null,
        `Payroll accrual ${month}`,
      ),
    );
    const payrollPaidOn = dayAt(monthDays.length - 1);
    await post(
      entry(
        reference.companyEntityId,
        payrollPaidOn,
        'cash',
        'bank_statement',
        [
          { glAccountId: gl(glPayroll), side: 'D', amount: payroll },
          {
            glAccountId: gl(glCash),
            side: 'C',
            amount: payroll,
            accountId: reference.accounts.companyBankLocal,
          },
        ],
        payrollPaidOn,
        `Payroll payment ${month}`,
      ),
    );

    // ---- Company: two receipts in foreign currency -------------------------
    for (let index = 0; index < 2; index += 1) {
      const day = dayAt(4 + index * 7);
      const rate = rateOn(window, day);
      const article = articleOf(reference, 'revenue', index + 1);
      const received = money(intBetween(rng, 1_500, 9_000) * 10_000, foreign);
      // The credit leg is stated in the functional currency at the same rate,
      // so I1 holds on exactly the figures the database will check.
      const functional = received.convert(rate, localCurrency).round();
      await post(
        entry(
          reference.companyEntityId,
          day,
          'cash',
          'bank_statement',
          [
            {
              glAccountId: gl(glCash),
              side: 'D',
              amount: received,
              fxRate: rate.toFixed(10),
              accountId: reference.accounts.companyBankForeign,
            },
            {
              glAccountId: gl(article.glAccountCode),
              side: 'C',
              amount: functional,
              articleId: article.id,
              directionId: reference.directionIds[0] ?? null,
            },
          ],
          day,
          `Export receipt ${month}-${String(index + 1)}`,
        ),
      );
    }

    // ---- Company: bank to cash desk transfer -------------------------------
    const transferDay = dayAt(6);
    const transferred = money(intBetween(rng, 2_000_000, 6_000_000) * 10_000, localCurrency);
    await post(
      entry(
        reference.companyEntityId,
        transferDay,
        'cash',
        'bank_statement',
        [
          {
            glAccountId: gl(glCashDesk),
            side: 'D',
            amount: transferred,
            accountId: reference.accounts.companyCash,
          },
          {
            glAccountId: gl(glCash),
            side: 'C',
            amount: transferred,
            accountId: reference.accounts.companyBankLocal,
          },
        ],
        transferDay,
        `Cash withdrawal ${month}`,
      ),
    );

    // ---- Sole trader: 18 cash sales and 5 expenses -------------------------
    for (let index = 0; index < 18; index += 1) {
      const day = dayAt(index);
      const article = articleOf(reference, 'revenue', index);
      const value = money(intBetween(rng, 900_000, 4_500_000) * 10_000, localCurrency);
      await post(
        entry(
          reference.soleTraderEntityId,
          day,
          'cash',
          'bank_statement',
          [
            {
              glAccountId: gl(glCash),
              side: 'D',
              amount: value,
              accountId: reference.accounts.soleTraderBank,
            },
            {
              glAccountId: gl(article.glAccountCode),
              side: 'C',
              amount: value,
              articleId: article.id,
              directionId: reference.directionIds[1] ?? null,
            },
          ],
          day,
          `Sale ${month}-${String(index + 1).padStart(2, '0')}`,
        ),
      );
    }

    for (let index = 0; index < 5; index += 1) {
      const day = dayAt(index * 4);
      const article = articleOf(reference, 'opex_variable', index);
      const value = money(intBetween(rng, 300_000, 1_800_000) * 10_000, localCurrency);
      await post(
        entry(
          reference.soleTraderEntityId,
          day,
          'cash',
          'bank_statement',
          [
            {
              glAccountId: gl(article.glAccountCode),
              side: 'D',
              amount: value,
              articleId: article.id,
            },
            {
              glAccountId: gl(glCash),
              side: 'C',
              amount: value,
              accountId: reference.accounts.soleTraderBank,
            },
          ],
          day,
          `Sole trader expense ${month}-${String(index + 1)}`,
        ),
      );
    }
  }

  // ---- Month-end FX revaluation of the foreign account (§5) ----------------
  const closingRate = rateOn(window, window.to);
  const [position] = await db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
    return tx.execute<{ foreign_units: string; functional_units: string }>(sql`
      select
        coalesce(sum(case when side = 'D' then amount else -amount end), 0) as foreign_units,
        coalesce(sum(case when side = 'D' then amount_functional else -amount_functional end), 0)
          as functional_units
      from journal_line
      where org_id = ${orgId}
        and account_id = ${reference.accounts.companyBankForeign}
    `);
  });
  if (position === undefined) {
    throw new Error('foreign account position could not be read');
  }

  const heldForeign = Money.of(position.foreign_units, foreign);
  const carriedFunctional = Money.of(position.functional_units, localCurrency);
  const restated = heldForeign.convert(closingRate, localCurrency).round();
  const difference = restated.minus(carriedFunctional);
  if (difference.isZero()) {
    throw new Error('seed expected a non-zero FX revaluation; the rate series produced none');
  }
  const gain = difference.isPositive();
  const magnitude = difference.abs();

  // Only the functional value is restated; the foreign balance is untouched,
  // so both legs are stated in the functional currency at a rate of 1.
  const fxRevaluationEntryId = await post(
    entry(
      reference.companyEntityId,
      window.to,
      'fx_revaluation',
      'period_close',
      [
        {
          glAccountId: gl(gain ? glCash : glFxDifference),
          side: 'D',
          amount: magnitude,
          accountId: gain ? reference.accounts.companyBankForeign : null,
        },
        {
          glAccountId: gl(gain ? glFxDifference : glCash),
          side: 'C',
          amount: magnitude,
          accountId: gain ? null : reference.accounts.companyBankForeign,
        },
      ],
      null,
      `FX revaluation at ${window.to}`,
    ),
  );

  // ---- One correction, made the only way I2 and I4 allow: a reversal -------
  const reversedEntryId = companyExpenseEntryIds[1];
  if (reversedEntryId === undefined) {
    throw new Error('seed has no expense entry to reverse');
  }
  const reversal = await ledger.reverseEntry(
    orgId,
    reversedEntryId,
    'duplicate supplier invoice',
    null,
  );
  if (!reversal.ok) {
    throw new Error(`seed reversal rejected: ${reversal.error.code}`);
  }
  entryCount += 1;

  return {
    entryCount,
    openingEntryIds,
    reversedEntryId,
    reversalEntryId: reversal.value.id,
    fxRevaluationEntryId,
  };
}
