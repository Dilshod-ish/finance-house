import {
  Decimal,
  Money,
  addDays,
  addMonths,
  endOfMonth,
  startOfMonth,
  type IsoDate,
} from '@fincore/shared';
import { sql } from 'drizzle-orm';
import type { Database } from '@fincore/db';
import { glCodeForCash, glCodeForRole } from '../pack-resolution.js';
import { createRng, intBetween, pick } from '../rng.js';
import { usdPerUnit } from './fx.js';
import { createPoster, exact, isWeekend, units, type Leg } from './posting.js';
import { SHOWCASE_WINDOW } from './profiles.js';
import type { ShowcaseReference } from './reference.js';

/**
 * What one money account holds, in its own currency and as the ledger
 * currently states it in USD.
 */
interface AccountPosition {
  readonly accountId: string;
  readonly currency: string;
  readonly own: Decimal;
  readonly functional: Decimal;
}

async function positionsAt(
  db: Database,
  orgId: string,
  on: IsoDate,
): Promise<readonly AccountPosition[]> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
    const rows = await tx.execute<{
      account_id: string;
      currency: string;
      own: string;
      functional: string;
    }>(sql`
      select
        l.account_id,
        a.currency,
        -- Only lines actually in the account's currency count towards what it
        -- holds. A revaluation posts USD onto a som account: it changes what
        -- the som is worth, not how much som there is.
        sum(case when l.currency = a.currency
                 then case when l.side = 'D' then l.amount else -l.amount end
                 else 0 end) as own,
        sum(case when l.side = 'D' then l.amount_functional
                 else -l.amount_functional end) as functional
      from journal_line l
        join journal_entry e on e.id = l.entry_id and e.org_id = l.org_id
        join account a on a.id = l.account_id and a.org_id = l.org_id
      where l.org_id = ${orgId}
        and a.currency <> 'USD'
        and coalesce(e.cash_date, e.accrual_date) <= ${on}
      group by l.account_id, a.currency
    `);
    return rows.map((row) => ({
      accountId: row.account_id,
      currency: row.currency.trim(),
      own: new Decimal(row.own),
      functional: new Decimal(row.functional),
    }));
  });
}

export interface ShowcaseJournal {
  readonly entryCount: number;
  readonly months: readonly IsoDate[];
}

/** An invoice raised but not yet settled — carries the rate it was booked at. */
interface OpenItem {
  readonly on: IsoDate;
  readonly dueOn: IsoDate;
  readonly currency: string;
  readonly whole: number;
  readonly rate: Decimal;
  readonly counterpartyId: string;
  readonly directionId: string;
  readonly articleId: string;
}

function monthsOf(): IsoDate[] {
  const months: IsoDate[] = [];
  let day = startOfMonth(SHOWCASE_WINDOW.from);
  while (day <= SHOWCASE_WINDOW.to) {
    months.push(day);
    day = addMonths(day, 1);
  }
  return months;
}

/** Business days of one month that fall inside the window. */
function businessDaysOf(month: IsoDate): IsoDate[] {
  const days: IsoDate[] = [];
  let day = month;
  const last = endOfMonth(month);
  while (day <= last) {
    if (!isWeekend(day) && day >= SHOWCASE_WINDOW.from && day <= SHOWCASE_WINDOW.to) {
      days.push(day);
    }
    day = addDays(day, 1);
  }
  return days;
}

/**
 * Six months of books for one organization, posted through the ledger.
 *
 * The shape differs per sector, but three things are the same everywhere, and
 * they are the point of the exercise:
 *
 * - every organization reports in USD while most of its costs are in UZS, so
 *   each month end revalues what it holds in UZS and EUR;
 * - revenue is accrued when earned and collected later, so the P&L and the
 *   cash flow genuinely disagree, which is what I6 exists for;
 * - money sits in six places — bank and cash desk, three currencies each — so
 *   the cash flow has to tie per account, not only in total.
 */
export async function seedShowcaseJournal(
  db: Database,
  reference: ShowcaseReference,
): Promise<ShowcaseJournal> {
  const { pack, profile, accounts } = reference;
  const rng = createRng(profile.rngSeed);

  const glCash = glCodeForCash(pack, 'bank');
  const glCashDesk = glCodeForCash(pack, 'cash');
  const glFx = glCodeForRole(pack, 'fx_difference');
  const glReceivable = glCodeForRole(pack, 'receivable');
  const glPayable = glCodeForRole(pack, 'payable');
  const glPayrollPayable = glCodeForRole(pack, 'payroll_payable');
  const glTaxPayable = glCodeForRole(pack, 'tax_payable');
  const glTaxExpense = glCodeForRole(pack, 'tax_expense');
  const glShareCapital = glCodeForRole(pack, 'share_capital');
  const glRetained = glCodeForRole(pack, 'retained_earnings');
  const glFixedAsset = glCodeForRole(pack, 'fixed_asset');
  const glLoan = glCodeForRole(pack, 'loan');
  const glInterest = glCodeForRole(pack, 'interest_expense');

  const { post, count } = createPoster(db, reference, glFx);

  const articles = (flow: Parameters<typeof reference.articlesByFlowType.get>[0]) =>
    reference.articlesByFlowType.get(flow) ?? [];
  const articleKeyed = (key: string): string => {
    const id = reference.articleIdByKey.get(key);
    if (id === undefined) {
      throw new Error(`showcase expects article ${key} in the pack template`);
    }
    return id;
  };
  const glForArticle = (id: string, flow: Parameters<typeof articles>[0]): string => {
    const found = articles(flow).find((candidate) => candidate.id === id);
    if (found === undefined) {
      throw new Error(`article ${id} is not a ${flow} article`);
    }
    return found.glAccountCode;
  };

  /*
   * The pack's revenue articles include one that posts to an *other income*
   * account — scrap, rebates, the odd sale of something that is not the
   * product. Trading revenue must not land there, or a quarter of the top line
   * shows up below EBITDA, so the two are kept apart by the account's role
   * rather than by its name.
   */
  const tradingRevenue = articles('revenue').filter(
    (candidate) => reference.glRoleByCode.get(candidate.glAccountCode) === 'revenue',
  );
  const incidentalRevenue = articles('revenue').filter(
    (candidate) => reference.glRoleByCode.get(candidate.glAccountCode) === 'other_income',
  );
  if (tradingRevenue.length === 0) {
    throw new Error('region pack has no revenue article posting to a revenue account');
  }

  const anyCounterparty = (): string => pick(rng, reference.counterpartyIds);
  const anyDirection = (): string => pick(rng, reference.directionIds);
  const bankFor = (currency: string): string =>
    currency === 'USD'
      ? accounts.bankUsd
      : currency === 'EUR'
        ? accounts.bankEur
        : accounts.bankUzs;
  const deskFor = (currency: string): string =>
    currency === 'USD'
      ? accounts.cashUsd
      : currency === 'EUR'
        ? accounts.cashEur
        : accounts.cashUzs;

  // ---- Opening balances --------------------------------------------------
  const opening = profile.opening;
  const openingLegs: Leg[] = [
    {
      glCode: glCash,
      side: 'D',
      amount: units(opening.bankUsd, 'USD'),
      accountId: accounts.bankUsd,
    },
    {
      glCode: glCash,
      side: 'D',
      amount: units(opening.bankUzs, 'UZS'),
      accountId: accounts.bankUzs,
    },
    {
      glCode: glCash,
      side: 'D',
      amount: units(opening.bankEur, 'EUR'),
      accountId: accounts.bankEur,
    },
    {
      glCode: glCashDesk,
      side: 'D',
      amount: units(opening.cashUsd, 'USD'),
      accountId: accounts.cashUsd,
    },
    {
      glCode: glCashDesk,
      side: 'D',
      amount: units(opening.cashUzs, 'UZS'),
      accountId: accounts.cashUzs,
    },
    {
      glCode: glCashDesk,
      side: 'D',
      amount: units(opening.cashEur, 'EUR'),
      accountId: accounts.cashEur,
    },
    { glCode: glShareCapital, side: 'C', amount: units(opening.shareCapitalUsd, 'USD') },
  ];
  const openingFunctional = openingLegs
    .filter((leg) => leg.side === 'D')
    .reduce(
      (sum, leg) =>
        sum.plus(
          new Decimal(
            leg.amount
              .convert(
                usdPerUnit(leg.amount.currency, addDays(SHOWCASE_WINDOW.from, -1)).toFixed(10),
                'USD',
              )
              .round()
              .toStorage(),
          ),
        ),
      new Decimal(0),
    );
  openingLegs.push({
    glCode: glRetained,
    side: 'C',
    amount: exact(openingFunctional.minus(opening.shareCapitalUsd), 'USD'),
  });
  /*
   * Dated the day before the window opens. A handover balance belongs to the
   * period that ended, not the one starting: dated inside the window it would
   * show as cash appearing from nowhere rather than as the opening position.
   */
  const openingOn = addDays(SHOWCASE_WINDOW.from, -1);
  await post({
    on: openingOn,
    kind: 'opening',
    sourceType: 'opening_balance',
    description: `Opening balance at ${openingOn}`,
    legs: openingLegs,
  });

  const months = monthsOf();
  const openItems: OpenItem[] = [];
  const payables: OpenItem[] = [];
  let payrollDue: { whole: number; on: IsoDate } | null = null;

  for (const [index, month] of months.entries()) {
    const days = businessDaysOf(month);
    const dayAt = (n: number): IsoDate => {
      const day = days[n % days.length];
      if (day === undefined) {
        throw new Error(`month ${month} has no business days`);
      }
      return day;
    };

    // ---- Revenue, by sector ---------------------------------------------
    if (profile.key === 'b2c') {
      /*
       * Retail: paid at the till, so there is no receivable at all. Most of it
       * is UZS cash and card; a little hard currency from tourists.
       */
      for (const day of days) {
        const till = intBetween(rng, 23_000_000, 36_000_000);
        const card = intBetween(rng, 16_000_000, 26_000_000);
        const revenueArticle = pick(rng, tradingRevenue);
        const direction = anyDirection();
        await post({
          on: day,
          cashOn: day,
          kind: 'cash',
          sourceType: 'pos_z_report',
          description: `Till takings ${day}`,
          legs: [
            {
              glCode: glCashDesk,
              side: 'D',
              amount: units(till, 'UZS'),
              accountId: accounts.cashUzs,
            },
            {
              glCode: glForArticle(revenueArticle.id, 'revenue'),
              side: 'C',
              amount: units(till, 'UZS'),
              articleId: revenueArticle.id,
              directionId: direction,
            },
          ],
        });
        await post({
          on: day,
          cashOn: day,
          kind: 'cash',
          sourceType: 'acquiring_settlement',
          description: `Card settlement ${day}`,
          legs: [
            { glCode: glCash, side: 'D', amount: units(card, 'UZS'), accountId: accounts.bankUzs },
            {
              glCode: glForArticle(revenueArticle.id, 'revenue'),
              side: 'C',
              amount: units(card, 'UZS'),
              articleId: revenueArticle.id,
              directionId: direction,
              counterpartyId: reference.counterpartyIds[5] ?? anyCounterparty(),
            },
          ],
        });
      }
      // A little foreign cash each month.
      for (const currency of ['USD', 'EUR'] as const) {
        const day = dayAt(9);
        const whole =
          currency === 'USD' ? intBetween(rng, 900, 2_400) : intBetween(rng, 400, 1_100);
        const revenueArticle = pick(rng, tradingRevenue);
        await post({
          on: day,
          cashOn: day,
          kind: 'cash',
          sourceType: 'pos_z_report',
          description: `Foreign currency takings ${currency} ${month}`,
          legs: [
            {
              glCode: glCashDesk,
              side: 'D',
              amount: units(whole, currency),
              accountId: deskFor(currency),
            },
            {
              glCode: glForArticle(revenueArticle.id, 'revenue'),
              side: 'C',
              amount: units(whole, currency),
              articleId: revenueArticle.id,
              directionId: anyDirection(),
            },
          ],
        });
      }
    } else {
      /*
       * B2B and manufacturing both invoice and wait. The currency mix and the
       * terms differ; the accrual-then-settle shape does not.
       */
      const invoiceCount = profile.monthly.revenue.count;
      const terms = profile.monthly.revenue.termDays;
      for (let n = 0; n < invoiceCount; n += 1) {
        const day = dayAt(n * 2);
        const currency =
          profile.key === 'b2b'
            ? n % 8 === 7
              ? 'UZS'
              : n % 3 === 1
                ? 'EUR'
                : 'USD'
            : n % 6 === 5
              ? 'UZS'
              : n % 4 === 1
                ? 'EUR'
                : 'USD';
        const whole =
          currency === 'UZS'
            ? intBetween(rng, ...profile.monthly.revenue.invoiceUzs)
            : currency === 'EUR'
              ? intBetween(rng, ...profile.monthly.revenue.invoiceEur)
              : intBetween(rng, ...profile.monthly.revenue.invoiceUsd);
        const revenueArticle = pick(rng, tradingRevenue);
        const item: OpenItem = {
          on: day,
          dueOn: addDays(day, terms),
          currency,
          whole,
          rate: usdPerUnit(currency, day),
          counterpartyId: anyCounterparty(),
          directionId: anyDirection(),
          articleId: revenueArticle.id,
        };
        openItems.push(item);
        await post({
          on: day,
          kind: 'accrual',
          sourceType: 'sales_invoice',
          description: `Invoice ${month}-${String(n + 1).padStart(2, '0')} (${currency})`,
          legs: [
            {
              glCode: glReceivable,
              side: 'D',
              amount: units(whole, currency),
              counterpartyId: item.counterpartyId,
            },
            {
              glCode: glForArticle(revenueArticle.id, 'revenue'),
              side: 'C',
              amount: units(whole, currency),
              articleId: revenueArticle.id,
              directionId: item.directionId,
              counterpartyId: item.counterpartyId,
            },
          ],
        });
      }
    }

    // ---- Settling what is now due ---------------------------------------
    for (let n = openItems.length - 1; n >= 0; n -= 1) {
      const item = openItems[n];
      if (item === undefined || item.dueOn > endOfMonth(month) || item.dueOn > SHOWCASE_WINDOW.to) {
        continue;
      }
      openItems.splice(n, 1);
      const paidOn = isWeekend(item.dueOn) ? addDays(item.dueOn, 2) : item.dueOn;
      if (paidOn > SHOWCASE_WINDOW.to) {
        continue;
      }
      await post({
        on: paidOn,
        cashOn: paidOn,
        kind: 'cash',
        sourceType: 'bank_statement',
        description: `Settlement of invoice from ${item.on}`,
        legs: [
          {
            glCode: glCash,
            side: 'D',
            amount: units(item.whole, item.currency),
            accountId: bankFor(item.currency),
            articleId: item.articleId,
            directionId: item.directionId,
            counterpartyId: item.counterpartyId,
          },
          {
            // Released at the rate it was raised at; the gap is a real gain or
            // loss and `withExchangeDifference` gives it its own line.
            glCode: glReceivable,
            side: 'C',
            amount: units(item.whole, item.currency),
            rate: item.rate,
            counterpartyId: item.counterpartyId,
          },
        ],
      });
    }

    // ---- Direct costs ----------------------------------------------------
    const cogsCount = profile.monthly.cogsCount;
    for (let n = 0; n < cogsCount; n += 1) {
      const day = dayAt(n * 3 + 1);
      const currency = profile.key === 'manufacturing' && n % 5 === 0 ? 'USD' : 'UZS';
      const whole =
        currency === 'USD'
          ? intBetween(rng, ...profile.monthly.cogsUsd)
          : intBetween(rng, ...profile.monthly.cogsUzs);
      const cogsArticle = pick(rng, articles('cogs'));
      const item: OpenItem = {
        on: day,
        dueOn: addDays(day, profile.key === 'b2c' ? 25 : 30),
        currency,
        whole,
        rate: usdPerUnit(currency, day),
        counterpartyId: anyCounterparty(),
        directionId: anyDirection(),
        articleId: cogsArticle.id,
      };
      payables.push(item);
      await post({
        on: day,
        kind: 'accrual',
        sourceType: 'purchase_invoice',
        description: `Supplier invoice ${month}-${String(n + 1).padStart(2, '0')}`,
        legs: [
          {
            glCode: glForArticle(cogsArticle.id, 'cogs'),
            side: 'D',
            amount: units(whole, currency),
            articleId: cogsArticle.id,
            directionId: item.directionId,
            counterpartyId: item.counterpartyId,
          },
          {
            glCode: glPayable,
            side: 'C',
            amount: units(whole, currency),
            counterpartyId: item.counterpartyId,
          },
        ],
      });
    }

    for (let n = payables.length - 1; n >= 0; n -= 1) {
      const item = payables[n];
      if (item === undefined || item.dueOn > endOfMonth(month) || item.dueOn > SHOWCASE_WINDOW.to) {
        continue;
      }
      payables.splice(n, 1);
      const paidOn = isWeekend(item.dueOn) ? addDays(item.dueOn, 2) : item.dueOn;
      if (paidOn > SHOWCASE_WINDOW.to) {
        continue;
      }
      await post({
        on: paidOn,
        cashOn: paidOn,
        kind: 'cash',
        sourceType: 'bank_statement',
        description: `Payment of supplier invoice from ${item.on}`,
        legs: [
          {
            glCode: glPayable,
            side: 'D',
            amount: units(item.whole, item.currency),
            rate: item.rate,
            counterpartyId: item.counterpartyId,
          },
          {
            glCode: glCash,
            side: 'C',
            amount: units(item.whole, item.currency),
            accountId: bankFor(item.currency),
            articleId: item.articleId,
            directionId: item.directionId,
            counterpartyId: item.counterpartyId,
          },
        ],
      });
    }

    // ---- Payroll: accrued this month, paid early the next ----------------
    if (payrollDue !== null) {
      const payDay = dayAt(3);
      await post({
        on: payDay,
        cashOn: payDay,
        kind: 'cash',
        sourceType: 'payroll',
        description: `Payroll paid for ${payrollDue.on.slice(0, 7)}`,
        legs: [
          { glCode: glPayrollPayable, side: 'D', amount: units(payrollDue.whole, 'UZS') },
          {
            glCode: glCash,
            side: 'C',
            amount: units(payrollDue.whole, 'UZS'),
            accountId: accounts.bankUzs,
            articleId: articleKeyed('svc.opexFix.adminPayroll'),
          },
        ],
      });
    }
    const payrollWhole = intBetween(rng, ...profile.monthly.payrollUzs);
    const payrollDay =
      endOfMonth(month) > SHOWCASE_WINDOW.to ? SHOWCASE_WINDOW.to : endOfMonth(month);
    await post({
      on: payrollDay,
      kind: 'accrual',
      sourceType: 'payroll',
      description: `Payroll accrued for ${month.slice(0, 7)}`,
      legs: [
        {
          glCode: glCodeForRole(pack, 'expense'),
          side: 'D',
          amount: units(payrollWhole, 'UZS'),
          articleId: articleKeyed('svc.opexFix.adminPayroll'),
        },
        { glCode: glPayrollPayable, side: 'C', amount: units(payrollWhole, 'UZS') },
      ],
    });
    payrollDue = { whole: payrollWhole, on: month };

    // ---- Overheads, paid as they fall ------------------------------------
    const overheads: readonly [string, readonly [number, number]][] = [
      ['svc.opexFix.rent', profile.monthly.rentUzs],
      ['svc.opexFix.utilities', profile.monthly.utilitiesUzs],
      ['svc.opexFix.communications', profile.monthly.communicationsUzs],
      ['svc.opexVar.marketing', profile.monthly.marketingUzs],
    ];
    for (const [key, range] of overheads) {
      const day = dayAt(6 + overheads.findIndex(([k]) => k === key));
      const whole = intBetween(rng, ...range);
      const articleId = articleKeyed(key);
      await post({
        on: day,
        cashOn: day,
        kind: 'cash',
        sourceType: 'bank_statement',
        description: `${key.split('.').pop() ?? key} ${month.slice(0, 7)}`,
        legs: [
          {
            glCode: glCodeForRole(pack, 'expense'),
            side: 'D',
            amount: units(whole, 'UZS'),
            articleId,
            directionId: anyDirection(),
          },
          {
            glCode: glCash,
            side: 'C',
            amount: units(whole, 'UZS'),
            accountId: accounts.bankUzs,
            articleId,
          },
        ],
      });
    }

    // A USD software subscription, so not every cost is local.
    const softwareDay = dayAt(11);
    const softwareWhole = intBetween(rng, ...profile.monthly.softwareUsd);
    await post({
      on: softwareDay,
      cashOn: softwareDay,
      kind: 'cash',
      sourceType: 'bank_statement',
      description: `Software subscriptions ${month.slice(0, 7)}`,
      legs: [
        {
          glCode: glCodeForRole(pack, 'expense'),
          side: 'D',
          amount: units(softwareWhole, 'USD'),
          articleId: articleKeyed('svc.opexFix.office'),
        },
        {
          glCode: glCash,
          side: 'C',
          amount: units(softwareWhole, 'USD'),
          accountId: accounts.bankUsd,
          articleId: articleKeyed('svc.opexFix.office'),
        },
      ],
    });

    // A little genuine other income — scrap, rebates, a refunded deposit.
    const incidental = incidentalRevenue[0];
    if (incidental !== undefined && index % 2 === 0) {
      const day = dayAt(16);
      const whole = intBetween(rng, 4_000_000, 13_000_000);
      await post({
        on: day,
        cashOn: day,
        kind: 'cash',
        sourceType: 'bank_statement',
        description: `Other income ${month.slice(0, 7)}`,
        legs: [
          {
            glCode: glCash,
            side: 'D',
            amount: units(whole, 'UZS'),
            accountId: accounts.bankUzs,
            articleId: incidental.id,
          },
          {
            glCode: incidental.glAccountCode,
            side: 'C',
            amount: units(whole, 'UZS'),
            articleId: incidental.id,
            directionId: anyDirection(),
          },
        ],
      });
    }

    // ---- Tax: accrued and paid -------------------------------------------
    const taxWhole = intBetween(rng, ...profile.monthly.taxUzs);
    const taxAccrualDay = payrollDay;
    await post({
      on: taxAccrualDay,
      kind: 'accrual',
      sourceType: 'tax_calculation',
      description: `Tax accrued for ${month.slice(0, 7)}`,
      legs: [
        {
          glCode: glTaxExpense,
          side: 'D',
          amount: units(taxWhole, 'UZS'),
          articleId: articleKeyed('svc.belowEbitda.tax'),
        },
        { glCode: glTaxPayable, side: 'C', amount: units(taxWhole, 'UZS') },
      ],
    });
    if (index > 0) {
      const taxPayDay = dayAt(14);
      await post({
        on: taxPayDay,
        cashOn: taxPayDay,
        kind: 'cash',
        sourceType: 'bank_statement',
        description: `Tax paid for ${addMonths(month, -1).slice(0, 7)}`,
        legs: [
          { glCode: glTaxPayable, side: 'D', amount: units(taxWhole, 'UZS') },
          {
            glCode: glCash,
            side: 'C',
            amount: units(taxWhole, 'UZS'),
            accountId: accounts.bankUzs,
            articleId: articleKeyed('svc.belowEbitda.tax'),
          },
        ],
      });
    }

    // ---- Moving money between its own accounts ---------------------------
    const transferArticle = articleKeyed('svc.transfer.internal');
    if (profile.key === 'b2c') {
      // Retail banks its takings: the cash desk empties into the bank.
      for (const n of [1, 2, 3]) {
        const day = dayAt(n * 5);
        const whole = intBetween(rng, 90_000_000, 150_000_000);
        await post({
          on: day,
          cashOn: day,
          kind: 'cash',
          sourceType: 'cash_collection',
          description: `Cash banked ${day}`,
          legs: [
            {
              glCode: glCash,
              side: 'D',
              amount: units(whole, 'UZS'),
              accountId: accounts.bankUzs,
              articleId: transferArticle,
            },
            {
              glCode: glCashDesk,
              side: 'C',
              amount: units(whole, 'UZS'),
              accountId: accounts.cashUzs,
              articleId: transferArticle,
            },
          ],
        });
      }
    } else {
      const day = dayAt(8);
      const whole = intBetween(rng, 18_000_000, 34_000_000);
      await post({
        on: day,
        cashOn: day,
        kind: 'cash',
        sourceType: 'bank_statement',
        description: `Petty cash drawn ${day}`,
        legs: [
          {
            glCode: glCashDesk,
            side: 'D',
            amount: units(whole, 'UZS'),
            accountId: accounts.cashUzs,
            articleId: transferArticle,
          },
          {
            glCode: glCash,
            side: 'C',
            amount: units(whole, 'UZS'),
            accountId: accounts.bankUzs,
            articleId: transferArticle,
          },
        ],
      });
    }

    // Selling hard currency for local costs: two currencies, one entry.
    const conversionDay = dayAt(12);
    const soldUsd = intBetween(rng, 6_000, 18_000);
    // The bank's rate, half a percent inside the official one.
    const boughtUzs = new Decimal(soldUsd)
      .dividedBy(usdPerUnit('UZS', conversionDay))
      .times('0.995');
    await post({
      on: conversionDay,
      cashOn: conversionDay,
      kind: 'cash',
      sourceType: 'fx_conversion',
      description: `Sold USD for UZS ${conversionDay}`,
      legs: [
        {
          glCode: glCash,
          side: 'D',
          amount: exact(boughtUzs, 'UZS'),
          accountId: accounts.bankUzs,
          articleId: transferArticle,
        },
        {
          glCode: glCash,
          side: 'C',
          amount: units(soldUsd, 'USD'),
          accountId: accounts.bankUsd,
          articleId: transferArticle,
        },
      ],
    });

    // ---- Retail: a store refit, so investing is not only a factory thing --
    if (profile.key === 'b2c' && index === 2) {
      const refitDay = dayAt(10);
      await post({
        on: refitDay,
        cashOn: refitDay,
        kind: 'cash',
        sourceType: 'supplier_invoice',
        description: 'North store refit',
        legs: [
          {
            glCode: glFixedAsset,
            side: 'D',
            amount: units(310_000_000, 'UZS'),
            articleId: articleKeyed('svc.investing.equipment'),
            counterpartyId: anyCounterparty(),
          },
          {
            glCode: glCash,
            side: 'C',
            amount: units(310_000_000, 'UZS'),
            accountId: accounts.bankUzs,
            articleId: articleKeyed('svc.investing.equipment'),
          },
        ],
      });
    }

    // ---- Manufacturing only: equipment, and the loan that paid for it ----
    if (profile.key === 'manufacturing') {
      if (index === 0) {
        const drawDay = dayAt(2);
        await post({
          on: drawDay,
          cashOn: drawDay,
          kind: 'cash',
          sourceType: 'loan_agreement',
          description: 'Equipment loan drawn',
          legs: [
            {
              glCode: glCash,
              side: 'D',
              amount: units(80_000, 'USD'),
              accountId: accounts.bankUsd,
              articleId: articleKeyed('svc.financing.loanIn'),
              counterpartyId: reference.counterpartyIds[6] ?? anyCounterparty(),
            },
            { glCode: glLoan, side: 'C', amount: units(80_000, 'USD') },
          ],
        });
      }
      if (index === 1) {
        const buyDay = dayAt(7);
        await post({
          on: buyDay,
          cashOn: buyDay,
          kind: 'cash',
          sourceType: 'supplier_invoice',
          description: 'Knitting line purchased',
          legs: [
            {
              glCode: glFixedAsset,
              side: 'D',
              amount: units(45_000, 'EUR'),
              articleId: articleKeyed('svc.investing.equipment'),
              counterpartyId: reference.counterpartyIds[5] ?? anyCounterparty(),
            },
            {
              glCode: glCash,
              side: 'C',
              amount: units(45_000, 'EUR'),
              accountId: accounts.bankEur,
              articleId: articleKeyed('svc.investing.equipment'),
            },
          ],
        });
      }
      const repayDay = dayAt(18);
      await post({
        on: repayDay,
        cashOn: repayDay,
        kind: 'cash',
        sourceType: 'bank_statement',
        description: `Loan repayment ${month.slice(0, 7)}`,
        legs: [
          {
            glCode: glLoan,
            side: 'D',
            amount: units(6_000, 'USD'),
            articleId: articleKeyed('svc.financing.loanOut'),
          },
          {
            glCode: glInterest,
            side: 'D',
            amount: units(700, 'USD'),
            articleId: articleKeyed('svc.belowEbitda.interest'),
          },
          {
            glCode: glCash,
            side: 'C',
            amount: units(6_700, 'USD'),
            accountId: accounts.bankUsd,
            articleId: articleKeyed('svc.financing.loanOut'),
          },
        ],
      });
    }

    /*
     * Month end: restate what is held in UZS and EUR at the closing rate.
     * Without this the balance sheet would report foreign cash at whatever
     * rates happened to apply when the money arrived, which for a USD-reporting
     * company holding mostly som is simply wrong (CLAUDE.md §5).
     *
     * `cash_date` is deliberately null — no money moved — so the cash flow
     * keeps this out of its flows and shows it on its own line.
     */
    const closeOn = endOfMonth(month) > SHOWCASE_WINDOW.to ? SHOWCASE_WINDOW.to : endOfMonth(month);
    for (const position of await positionsAt(db, reference.orgId, closeOn)) {
      if (position.own.isZero()) {
        continue;
      }
      const target = new Decimal(
        units(0, 'USD')
          .plus(
            Money.of(position.own.toFixed(4), position.currency)
              .convert(usdPerUnit(position.currency, closeOn).toFixed(10), 'USD')
              .round(),
          )
          .toStorage(),
      );
      const delta = target.minus(position.functional);
      if (delta.isZero()) {
        continue;
      }
      const glCode =
        position.accountId === accounts.cashUzs || position.accountId === accounts.cashEur
          ? glCashDesk
          : glCash;
      await post({
        on: closeOn,
        kind: 'fx_revaluation',
        sourceType: 'period_close',
        description: `FX revaluation of ${position.currency} cash at ${closeOn}`,
        legs: [
          {
            glCode,
            side: delta.greaterThan(0) ? 'D' : 'C',
            amount: exact(delta.abs(), 'USD'),
            accountId: position.accountId,
          },
          {
            glCode: glFx,
            side: delta.greaterThan(0) ? 'C' : 'D',
            amount: exact(delta.abs(), 'USD'),
            articleId: articleKeyed('svc.belowEbitda.fx'),
          },
        ],
      });
    }
  }

  return { entryCount: count(), months };
}
