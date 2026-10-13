import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';

export interface OrgFixture {
  orgId: string;
  legalEntityId: string;
  cashGl: string;
  revenueGl: string;
  expenseGl: string;
  accountId: string;
}

/**
 * Minimal tenant: one organization, one legal entity, three GL accounts and one
 * bank account. Written through the same RLS policies the application uses.
 */
export async function seedOrg(
  sql: postgres.Sql,
  name: string,
  currency = 'UZS',
): Promise<OrgFixture> {
  const orgId = randomUUID();
  const legalEntityId = randomUUID();
  const cashGl = randomUUID();
  const revenueGl = randomUUID();
  const expenseGl = randomUUID();
  const accountId = randomUUID();

  await sql.begin(async (tx) => {
    await tx`select set_config('app.org_id', ${orgId}, true)`;
    await tx`
      insert into organization (id, name, base_currency, country_code, region_pack)
      values (${orgId}, ${name}, ${currency}, 'UZ', 'uz')`;
    await tx`
      insert into legal_entity (id, org_id, name, legal_form, functional_currency, tax_regime)
      values (${legalEntityId}, ${orgId}, ${`${name} MCHJ`}, 'MCHJ', ${currency}, 'qqs_foyda')`;
    await tx`
      insert into gl_account (id, org_id, code, name, type, normal_side) values
        (${cashGl},    ${orgId}, '1010', 'Cash and banks', 'asset',   'D'),
        (${revenueGl}, ${orgId}, '4010', 'Revenue',        'income',  'C'),
        (${expenseGl}, ${orgId}, '5010', 'Operating cost', 'expense', 'D')`;
    await tx`
      insert into account (id, org_id, legal_entity_id, name, kind, currency)
      values (${accountId}, ${orgId}, ${legalEntityId}, 'Main account', 'bank', ${currency})`;
  });

  return { orgId, legalEntityId, cashGl, revenueGl, expenseGl, accountId };
}

export interface PostLine {
  glAccountId: string;
  side: 'D' | 'C';
  amount: string;
  accountId?: string;
}

/** Inserts an entry and its lines inside one transaction, as the ledger would. */
export async function postRawEntry(
  sql: postgres.Sql,
  fx: OrgFixture,
  options: {
    accrualDate: string;
    cashDate?: string | null;
    kind?: string;
    sourceType?: string;
    lines: PostLine[];
    entryId?: string;
    idempotencyKey?: string | null;
    reversesId?: string;
    reversalReason?: string;
  },
): Promise<string> {
  const entryId = options.entryId ?? randomUUID();
  await sql.begin(async (tx) => {
    await tx`select set_config('app.org_id', ${fx.orgId}, true)`;
    await tx`
      insert into journal_entry
        (id, org_id, legal_entity_id, accrual_date, cash_date, kind, source_type,
         idempotency_key, reverses_id, reversal_reason)
      values
        (${entryId}, ${fx.orgId}, ${fx.legalEntityId}, ${options.accrualDate},
         ${options.cashDate ?? null}, ${options.kind ?? 'manual'},
         ${options.sourceType ?? 'test'}, ${options.idempotencyKey ?? null},
         ${options.reversesId ?? null}, ${options.reversalReason ?? null})`;
    for (const line of options.lines) {
      await tx`
        insert into journal_line
          (org_id, entry_id, gl_account_id, side, amount, currency, fx_rate,
           amount_functional, source_type, account_id)
        values
          (${fx.orgId}, ${entryId}, ${line.glAccountId}, ${line.side}, ${line.amount}, 'UZS',
           '1.0000000000', ${line.amount}, ${options.sourceType ?? 'test'},
           ${line.accountId ?? null})`;
    }
  });
  return entryId;
}
