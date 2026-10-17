import { sql } from 'drizzle-orm';
import {
  account,
  appUser,
  article,
  counterparty,
  direction,
  fxRate,
  glAccount,
  legalEntity,
  membership,
  organization,
  type Database,
} from '@fincore/db';
import { articleTemplateFor, type RegionPack } from '@fincore/region-pack-contract';
import type { FlowType } from '@fincore/shared';
import { companyProfile } from '../pack-resolution.js';
import { showcaseFxRows } from './fx.js';
import { SHOWCASE_OWNER_USER_ID, SHOWCASE_WINDOW, type ShowcaseProfile } from './profiles.js';

export interface ShowcaseArticle {
  readonly id: string;
  readonly key: string;
  readonly glAccountCode: string;
}

/** The six money accounts every showcase organization keeps. */
export interface ShowcaseAccounts {
  readonly bankUsd: string;
  readonly bankUzs: string;
  readonly bankEur: string;
  readonly cashUsd: string;
  readonly cashUzs: string;
  readonly cashEur: string;
}

export interface ShowcaseReference {
  readonly profile: ShowcaseProfile;
  readonly pack: RegionPack;
  readonly orgId: string;
  readonly legalEntityId: string;
  readonly glIdByCode: ReadonlyMap<string, string>;
  /** So a generator can pick articles by what their account *is*. */
  readonly glRoleByCode: ReadonlyMap<string, string>;
  readonly accounts: ShowcaseAccounts;
  readonly directionIds: readonly string[];
  readonly counterpartyIds: readonly string[];
  readonly articlesByFlowType: ReadonlyMap<FlowType, readonly ShowcaseArticle[]>;
  /** By the pack's article key, for a generator that wants a named one. */
  readonly articleIdByKey: ReadonlyMap<string, string>;
}

/**
 * Reference data for one showcase organization: a single legal entity whose
 * functional currency is USD, and six money accounts — a bank account and a
 * cash desk in each of USD, UZS and EUR.
 *
 * Six accounts rather than the usual one or two because this dataset exists to
 * put the multi-currency machinery under load: every non-USD balance has to be
 * revalued at each month end, and the cash flow statement has to tie per
 * account as well as per organization.
 */
export async function seedShowcaseReference(
  db: Database,
  pack: RegionPack,
  profile: ShowcaseProfile,
): Promise<ShowcaseReference> {
  const { orgId } = profile;
  const company = companyProfile(pack, SHOWCASE_WINDOW.from);
  const name = (key: string): string => pack.messages[pack.locale.defaultLanguage][key] ?? key;

  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);

    // The legal form comes from the pack, never from this package (§4).
    const displayName = `${profile.tradeName} ${company.legalForm.code}`;

    await tx.insert(organization).values({
      id: orgId,
      name: displayName,
      // What the organization reports in — USD here, not the pack's default.
      baseCurrency: profile.functionalCurrency,
      countryCode: pack.countryCode,
      regionPack: pack.code,
    });

    await tx
      .insert(appUser)
      .values({
        id: SHOWCASE_OWNER_USER_ID,
        email: 'owner@showcase.example',
        displayName: 'Showcase owner',
      })
      .onConflictDoNothing();
    await tx.insert(membership).values({ orgId, userId: SHOWCASE_OWNER_USER_ID, role: 'owner' });

    await tx.insert(legalEntity).values({
      id: profile.legalEntityId,
      orgId,
      name: displayName,
      legalForm: company.legalForm.code,
      taxRegime: company.taxRegime.code,
      functionalCurrency: profile.functionalCurrency,
      vatRegistered: true,
    });

    const accountRows = await tx
      .insert(account)
      .values([
        {
          orgId,
          legalEntityId: profile.legalEntityId,
          name: 'Bank · USD',
          kind: 'bank',
          currency: 'USD',
        },
        {
          orgId,
          legalEntityId: profile.legalEntityId,
          name: 'Bank · UZS',
          kind: 'bank',
          currency: 'UZS',
        },
        {
          orgId,
          legalEntityId: profile.legalEntityId,
          name: 'Bank · EUR',
          kind: 'bank',
          currency: 'EUR',
        },
        {
          orgId,
          legalEntityId: profile.legalEntityId,
          name: 'Kassa · USD',
          kind: 'cash',
          currency: 'USD',
        },
        {
          orgId,
          legalEntityId: profile.legalEntityId,
          name: 'Kassa · UZS',
          kind: 'cash',
          currency: 'UZS',
        },
        {
          orgId,
          legalEntityId: profile.legalEntityId,
          name: 'Kassa · EUR',
          kind: 'cash',
          currency: 'EUR',
        },
      ])
      .returning({ id: account.id });

    const glRows = pack.chartOfAccountsTemplate.map((seed) => ({
      orgId,
      code: seed.code,
      name: name(seed.nameKey),
      type: seed.type,
      normalSide: seed.normalSide,
      role: seed.role,
    }));
    const insertedGl = await tx
      .insert(glAccount)
      .values(glRows)
      .returning({ id: glAccount.id, code: glAccount.code });
    const glIdByCode = new Map(insertedGl.map((row) => [row.code, row.id]));
    const glRoleByCode = new Map(
      pack.chartOfAccountsTemplate.map((seed) => [seed.code, seed.role as string]),
    );

    const directionRows = await tx
      .insert(direction)
      .values(profile.directions.map((label) => ({ orgId, name: label })))
      .returning({ id: direction.id });

    const counterpartyRows = await tx
      .insert(counterparty)
      .values(profile.counterparties.map((label) => ({ orgId, name: label })))
      .returning({ id: counterparty.id });

    const template = articleTemplateFor(pack, 'services');
    if (template === undefined) {
      throw new Error(`region pack ${pack.code} has no services article template`);
    }
    const articleIdByKey = new Map<string, string>();
    const articlesByFlowType = new Map<FlowType, ShowcaseArticle[]>();
    // Parents first: an article's parent must already exist.
    for (const pass of [0, 1]) {
      for (const seed of template.articles) {
        if ((pass === 0) !== (seed.parentKey === null)) {
          continue;
        }
        const glAccountId = glIdByCode.get(seed.glAccountCode);
        if (glAccountId === undefined) {
          throw new Error(`article ${seed.key} points at unknown GL code ${seed.glAccountCode}`);
        }
        const [row] = await tx
          .insert(article)
          .values({
            orgId,
            parentId: seed.parentKey === null ? null : (articleIdByKey.get(seed.parentKey) ?? null),
            name: name(seed.nameKey),
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

    await tx.insert(fxRate).values(showcaseFxRows(orgId, pack.fxSource.id));

    const accountId = (index: number): string => {
      const row = accountRows[index];
      if (row === undefined) {
        throw new Error('showcase account was not created');
      }
      return row.id;
    };

    return {
      profile,
      pack,
      orgId,
      legalEntityId: profile.legalEntityId,
      glIdByCode,
      glRoleByCode,
      accounts: {
        bankUsd: accountId(0),
        bankUzs: accountId(1),
        bankEur: accountId(2),
        cashUsd: accountId(3),
        cashUzs: accountId(4),
        cashEur: accountId(5),
      },
      articleIdByKey,
      directionIds: directionRows.map((row) => row.id),
      counterpartyIds: counterpartyRows.map((row) => row.id),
      articlesByFlowType,
    };
  });
}
