import { sql } from 'drizzle-orm';
import {
  account,
  appUser,
  article,
  direction,
  fxRate,
  glAccount,
  legalEntity,
  membership,
  organization,
  type Database,
} from '@fincore/db';
import { Decimal, addDays, isoDate, type FlowType, type IsoDate } from '@fincore/shared';
import { articleTemplateFor, type RegionPack } from '@fincore/region-pack-contract';
import {
  ACCOUNT_COMPANY_BANK_LOCAL,
  ACCOUNT_COMPANY_BANK_USD,
  ACCOUNT_COMPANY_CASH,
  ACCOUNT_SOLE_TRADER_BANK,
  COMPANY_ENTITY_ID,
  OWNER_USER_ID,
  SOLE_TRADER_ENTITY_ID,
} from './ids.js';
import { companyProfile, foreignCurrency, soleTraderProfile } from './pack-resolution.js';

export interface SeedWindow {
  readonly from: IsoDate;
  readonly to: IsoDate;
}

export interface ReferenceData {
  readonly orgId: string;
  readonly pack: RegionPack;
  readonly localCurrency: string;
  readonly foreignCurrency: string;
  readonly companyEntityId: string;
  readonly soleTraderEntityId: string;
  /** gl_account.code -> gl_account.id, for this organization. */
  readonly glIdByCode: ReadonlyMap<string, string>;
  readonly accounts: {
    readonly companyBankLocal: string;
    readonly companyBankForeign: string;
    readonly companyCash: string;
    readonly soleTraderBank: string;
  };
  readonly directionIds: readonly string[];
  /**
   * Articles grouped by flow type. The journal generator picks articles the way
   * the product does — by what they mean — and takes the GL account from the
   * article, never by naming a country's chart-of-accounts code.
   */
  readonly articlesByFlowType: ReadonlyMap<FlowType, readonly SeededArticle[]>;
}

export interface SeededArticle {
  readonly id: string;
  readonly key: string;
  readonly glAccountCode: string;
}

const DIRECTION_IDS = [
  '2f6a1e10-0000-4000-8000-000000000401',
  '2f6a1e10-0000-4000-8000-000000000402',
] as const;

/**
 * Reference data for one tenant: organization, two legal entities, four money
 * accounts, the pack's chart of accounts and article template, and a daily FX
 * series. Everything country-specific comes from `pack`.
 */
export interface FixedIds {
  readonly companyEntityId: string;
  readonly soleTraderEntityId: string;
  readonly companyBankLocal: string;
  readonly companyBankForeign: string;
  readonly companyCash: string;
  readonly soleTraderBank: string;
  readonly directionIds: readonly [string, string];
}

/** The demo tenant pins its ids so a reseed keeps the same URLs. */
export const DEMO_IDS: FixedIds = {
  companyEntityId: COMPANY_ENTITY_ID,
  soleTraderEntityId: SOLE_TRADER_ENTITY_ID,
  companyBankLocal: ACCOUNT_COMPANY_BANK_LOCAL,
  companyBankForeign: ACCOUNT_COMPANY_BANK_USD,
  companyCash: ACCOUNT_COMPANY_CASH,
  soleTraderBank: ACCOUNT_SOLE_TRADER_BANK,
  directionIds: DIRECTION_IDS,
};

export async function seedReference(
  db: Database,
  pack: RegionPack,
  options: { orgId: string; name: string; window: SeedWindow; ids?: FixedIds },
): Promise<ReferenceData> {
  const { orgId, window } = options;
  const local = pack.currency.default;
  const foreign = foreignCurrency(pack);
  const company = companyProfile(pack, window.from);
  const soleTrader = soleTraderProfile(pack, window.from);

  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);

    await tx.insert(organization).values({
      id: orgId,
      name: options.name,
      baseCurrency: local,
      countryCode: pack.countryCode,
      regionPack: pack.code,
    });

    await tx
      .insert(appUser)
      .values({
        id: OWNER_USER_ID,
        email: 'owner@fincore.example',
        displayName: 'Demo owner',
      })
      .onConflictDoNothing();
    // app_user is shared across tenants by design (no org_id, ADR-0002).
    await tx.insert(membership).values({ orgId, userId: OWNER_USER_ID, role: 'owner' });

    const ids = options.ids;
    const insertedEntities = await tx
      .insert(legalEntity)
      .values([
        {
          ...(ids === undefined ? {} : { id: ids.companyEntityId }),
          orgId,
          name: `${options.name} ${company.legalForm.code}`,
          legalForm: company.legalForm.code,
          taxRegime: company.taxRegime.code,
          functionalCurrency: local,
          vatRegistered: true,
        },
        {
          ...(ids === undefined ? {} : { id: ids.soleTraderEntityId }),
          orgId,
          name: `${options.name} ${soleTrader.legalForm.code}`,
          legalForm: soleTrader.legalForm.code,
          taxRegime: soleTrader.taxRegime.code,
          functionalCurrency: local,
          vatRegistered: false,
        },
      ])
      .returning({ id: legalEntity.id });
    const companyEntityId = insertedEntities[0]?.id ?? '';
    const soleTraderEntityId = insertedEntities[1]?.id ?? '';

    const insertedAccounts = await tx
      .insert(account)
      .values([
        {
          ...(ids === undefined ? {} : { id: ids.companyBankLocal }),
          orgId,
          legalEntityId: companyEntityId,
          name: 'Company current account',
          kind: 'bank',
          currency: local,
        },
        {
          ...(ids === undefined ? {} : { id: ids.companyBankForeign }),
          orgId,
          legalEntityId: companyEntityId,
          name: `Company ${foreign} account`,
          kind: 'bank',
          currency: foreign,
        },
        {
          ...(ids === undefined ? {} : { id: ids.companyCash }),
          orgId,
          legalEntityId: companyEntityId,
          name: 'Company cash desk',
          kind: 'cash',
          currency: local,
        },
        {
          ...(ids === undefined ? {} : { id: ids.soleTraderBank }),
          orgId,
          legalEntityId: soleTraderEntityId,
          name: 'Sole trader current account',
          kind: 'bank',
          currency: local,
        },
      ])
      .returning({ id: account.id });

    const glRows = pack.chartOfAccountsTemplate.map((seed) => ({
      orgId,
      code: seed.code,
      // The pack ships locale keys; the organization's language resolves them.
      name: pack.messages[pack.locale.defaultLanguage][seed.nameKey] ?? seed.nameKey,
      type: seed.type,
      normalSide: seed.normalSide,
    }));
    const insertedGl = await tx
      .insert(glAccount)
      .values(glRows)
      .returning({ id: glAccount.id, code: glAccount.code });
    const glIdByCode = new Map(insertedGl.map((row) => [row.code, row.id]));

    const insertedDirections = await tx
      .insert(direction)
      .values([
        { ...(ids === undefined ? {} : { id: ids.directionIds[0] }), orgId, name: 'Projects' },
        { ...(ids === undefined ? {} : { id: ids.directionIds[1] }), orgId, name: 'Retainers' },
      ])
      .returning({ id: direction.id });

    const template = articleTemplateFor(pack, 'services');
    if (template === undefined) {
      throw new Error(`region pack ${pack.code} has no services article template`);
    }
    const articleIdByKey = new Map<string, string>();
    const articlesByFlowType = new Map<FlowType, SeededArticle[]>();
    // Parents first: an article's parent must already exist.
    for (const pass of [0, 1]) {
      for (const seed of template.articles) {
        const isRoot = seed.parentKey === null;
        if ((pass === 0) !== isRoot) {
          continue;
        }
        const glAccountId = glIdByCode.get(seed.glAccountCode);
        if (glAccountId === undefined) {
          throw new Error(`article ${seed.key} points at unknown GL code ${seed.glAccountCode}`);
        }
        const parentId = seed.parentKey === null ? null : articleIdByKey.get(seed.parentKey);
        const [row] = await tx
          .insert(article)
          .values({
            orgId,
            parentId: parentId ?? null,
            name: pack.messages[pack.locale.defaultLanguage][seed.nameKey] ?? seed.nameKey,
            flowType: seed.flowType,
            glAccountId,
            pnlLineCode: seed.pnlLineCode,
            vatRate: seed.vatRatePercent,
            sortOrder: seed.sortOrder,
          })
          .returning({ id: article.id });
        if (row !== undefined) {
          articleIdByKey.set(seed.key, row.id);
          const bucket = articlesByFlowType.get(seed.flowType) ?? [];
          bucket.push({ id: row.id, key: seed.key, glAccountCode: seed.glAccountCode });
          articlesByFlowType.set(seed.flowType, bucket);
        }
      }
    }

    await tx.insert(fxRate).values(buildFxSeries(orgId, pack, local, foreign, window));

    return {
      orgId,
      pack,
      localCurrency: local,
      foreignCurrency: foreign,
      companyEntityId,
      soleTraderEntityId,
      glIdByCode,
      accounts: {
        companyBankLocal: insertedAccounts[0]?.id ?? '',
        companyBankForeign: insertedAccounts[1]?.id ?? '',
        companyCash: insertedAccounts[2]?.id ?? '',
        soleTraderBank: insertedAccounts[3]?.id ?? '',
      },
      directionIds: insertedDirections.map((row) => row.id),
      articlesByFlowType,
    };
  });
}

/** Opening rate, drifting by a fixed step so the series is reproducible. */
const OPENING_RATE = new Decimal('12500');
const DAILY_DRIFT = new Decimal('3.5');

export function rateOn(window: SeedWindow, on: IsoDate): Decimal {
  const days = Math.round(
    (Date.parse(`${on}T00:00:00Z`) - Date.parse(`${window.from}T00:00:00Z`)) / 86_400_000,
  );
  return OPENING_RATE.plus(DAILY_DRIFT.times(days));
}

function buildFxSeries(
  orgId: string,
  pack: RegionPack,
  local: string,
  foreign: string,
  window: SeedWindow,
): {
  orgId: string;
  asOfDate: string;
  baseCurrency: string;
  quoteCurrency: string;
  rate: string;
  source: string;
}[] {
  const rows = [];
  let day = window.from;
  while (day <= window.to) {
    rows.push({
      orgId,
      asOfDate: day,
      baseCurrency: foreign,
      quoteCurrency: local,
      rate: rateOn(window, day).toFixed(10),
      source: pack.fxSource.id,
    });
    day = addDays(day, 1);
  }
  return rows;
}

export const DEMO_WINDOW: SeedWindow = {
  from: isoDate('2026-01-01'),
  to: isoDate('2026-03-31'),
};
