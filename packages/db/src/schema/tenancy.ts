import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  check,
  index,
  pgTable,
  smallint,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, currencyCode, pk } from './columns.js';
import { MEMBERSHIP_ROLES, inList } from '@fincore/shared';

export const organization = pgTable('organization', {
  id: pk(),
  name: text('name').notNull(),
  /** Presentation default; a legal entity may transact in anything. */
  baseCurrency: currencyCode('base_currency').notNull(),
  countryCode: char('country_code', { length: 2 }).notNull(),
  /** Which RegionPack resolves tax, banks, CoA and locale for this tenant. */
  regionPack: text('region_pack').notNull(),
  fiscalYearStart: smallint('fiscal_year_start').notNull().default(1),
  createdAt: createdAt(),
});

export const legalEntity = pgTable(
  'legal_entity',
  {
    id: pk(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    /** Resolved through the region pack — never hardcoded here. */
    legalForm: text('legal_form'),
    taxId: text('tax_id'),
    /** I1 is checked in this currency. */
    functionalCurrency: currencyCode('functional_currency').notNull(),
    taxRegime: text('tax_regime'),
    vatRegistered: boolean('vat_registered').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index('legal_entity_org_idx').on(t.orgId),
    unique('legal_entity_id_org_uq').on(t.id, t.orgId),
  ],
);

/**
 * Not tenant-scoped: one human can belong to several organizations, so
 * `app_user` carries no `org_id` and is not covered by I8. Tenant access is
 * expressed by `membership`.
 */
export const appUser = pgTable('app_user', {
  id: pk(),
  email: text('email').notNull().unique(),
  displayName: text('display_name').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: createdAt(),
});

export const membership = pgTable(
  'membership',
  {
    id: pk(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'restrict' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => appUser.id, { onDelete: 'restrict' }),
    role: text('role').$type<(typeof MEMBERSHIP_ROLES)[number]>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('membership_org_user_uq').on(t.orgId, t.userId),
    index('membership_user_idx').on(t.userId),
    check('membership_role_ck', sql.raw(`role in (${inList(MEMBERSHIP_ROLES)})`)),
  ],
);
