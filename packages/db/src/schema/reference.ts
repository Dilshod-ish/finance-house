import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  numeric,
  pgTable,
  text,
  unique,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { createdAt, currencyCode, pk } from './columns.js';
import {
  ACCOUNT_KINDS,
  COUNTERPARTY_KINDS,
  FLOW_TYPES,
  GL_ACCOUNT_TYPES,
  SIDES,
  inList,
  type AccountKind,
  type FlowType,
  type GlAccountType,
  type Side,
} from './domain.js';
import { legalEntity, organization } from './tenancy.js';

/** Where money physically sits. I5 reads `kind` to decide what is cash. */
export const account = pgTable(
  'account',
  {
    id: pk(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'restrict' }),
    legalEntityId: uuid('legal_entity_id')
      .notNull()
      .references(() => legalEntity.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    kind: text('kind').$type<AccountKind>().notNull(),
    currency: currencyCode('currency').notNull(),
    /** Resolved through the region pack's bank list — never a literal here. */
    bankCode: text('bank_code'),
    iban: text('iban'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    index('account_org_idx').on(t.orgId),
    index('account_org_legal_entity_idx').on(t.orgId, t.legalEntityId),
    unique('account_id_org_uq').on(t.id, t.orgId),
    check('account_kind_ck', sql.raw(`kind in (${inList(ACCOUNT_KINDS)})`)),
  ],
);

/**
 * Internal management chart of accounts. Materialised per organization from the
 * region pack template: `org_id` is NOT NULL so that I8 holds without a
 * "system rows are shared" hole in the RLS policy.
 */
export const glAccount = pgTable(
  'gl_account',
  {
    id: pk(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'restrict' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    type: text('type').$type<GlAccountType>().notNull(),
    normalSide: text('normal_side').$type<Side>().notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    unique('gl_account_org_code_uq').on(t.orgId, t.code),
    unique('gl_account_id_org_uq').on(t.id, t.orgId),
    check('gl_account_type_ck', sql.raw(`type in (${inList(GL_ACCOUNT_TYPES)})`)),
    check('gl_account_normal_side_ck', sql.raw(`normal_side in (${inList(SIDES)})`)),
  ],
);

/** The layer users actually see. Each article maps to exactly one gl_account. */
export const article = pgTable(
  'article',
  {
    id: pk(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'restrict' }),
    parentId: uuid('parent_id').references((): AnyPgColumn => article.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    flowType: text('flow_type').$type<FlowType>().notNull(),
    glAccountId: uuid('gl_account_id')
      .notNull()
      .references(() => glAccount.id, { onDelete: 'restrict' }),
    pnlLineCode: text('pnl_line_code'),
    /** Percentage, supplied by the region pack. Not money — no I7 concern. */
    vatRate: numeric('vat_rate', { precision: 5, scale: 2 }).$type<string>(),
    sortOrder: integer('sort_order').notNull().default(0),
    isArchived: boolean('is_archived').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index('article_org_idx').on(t.orgId),
    index('article_org_parent_idx').on(t.orgId, t.parentId),
    unique('article_id_org_uq').on(t.id, t.orgId),
    check('article_flow_type_ck', sql.raw(`flow_type in (${inList(FLOW_TYPES)})`)),
    check('article_no_self_parent_ck', sql`parent_id is distinct from id`),
  ],
);

/** Business direction — the dimension that is mandatory in practice. */
export const direction = pgTable(
  'direction',
  {
    id: pk(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'restrict' }),
    parentId: uuid('parent_id').references((): AnyPgColumn => direction.id, {
      onDelete: 'restrict',
    }),
    name: text('name').notNull(),
    isArchived: boolean('is_archived').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index('direction_org_idx').on(t.orgId),
    unique('direction_id_org_uq').on(t.id, t.orgId),
    check('direction_no_self_parent_ck', sql`parent_id is distinct from id`),
  ],
);

export const counterparty = pgTable(
  'counterparty',
  {
    id: pk(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    taxId: text('tax_id'),
    kinds: text('kinds')
      .array()
      .$type<string[]>()
      .notNull()
      .default(sql`'{}'::text[]`),
    paymentTermsDays: integer('payment_terms_days'),
    isArchived: boolean('is_archived').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index('counterparty_org_idx').on(t.orgId),
    unique('counterparty_id_org_uq').on(t.id, t.orgId),
    check(
      'counterparty_kinds_ck',
      sql.raw(`kinds <@ array[${inList(COUNTERPARTY_KINDS)}]::text[]`),
    ),
  ],
);
