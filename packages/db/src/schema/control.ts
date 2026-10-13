import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, currencyCode, pk, rate } from './columns.js';
import { appUser, legalEntity, organization } from './tenancy.js';

/**
 * FX rates are tenant-scoped so that a manual override stays inside the tenant
 * that made it and I8 needs no exception. The region pack's fxSource fills them.
 */
export const fxRate = pgTable(
  'fx_rate',
  {
    id: pk(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'restrict' }),
    asOfDate: date('as_of_date').notNull(),
    baseCurrency: currencyCode('base_currency').notNull(),
    quoteCurrency: currencyCode('quote_currency').notNull(),
    /** Units of quote per one unit of base. */
    rate: rate('rate').notNull(),
    /** e.g. the region pack's fxSource id, or 'manual'. */
    source: text('source').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('fx_rate_org_date_pair_source_uq').on(
      t.orgId,
      t.asOfDate,
      t.baseCurrency,
      t.quoteCurrency,
      t.source,
    ),
    index('fx_rate_org_pair_date_idx').on(t.orgId, t.baseCurrency, t.quoteCurrency, t.asOfDate),
    check('fx_rate_positive_ck', sql`rate > 0`),
    check('fx_rate_distinct_currencies_ck', sql`base_currency <> quote_currency`),
  ],
);

/** I2: nothing may be written into a period at or before `locked_through_date`. */
export const periodLock = pgTable(
  'period_lock',
  {
    id: pk(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'restrict' }),
    legalEntityId: uuid('legal_entity_id')
      .notNull()
      .references(() => legalEntity.id, { onDelete: 'restrict' }),
    lockedThroughDate: date('locked_through_date').notNull(),
    lockedAt: timestamp('locked_at', { withTimezone: true }).notNull().defaultNow(),
    lockedBy: uuid('locked_by').references(() => appUser.id, { onDelete: 'restrict' }),
    note: text('note'),
  },
  (t) => [
    unique('period_lock_entity_uq').on(t.orgId, t.legalEntityId),
    index('period_lock_org_idx').on(t.orgId),
  ],
);

/** Append-only; never updated or deleted (enforced by trigger). */
export const auditLog = pgTable(
  'audit_log',
  {
    id: pk(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'restrict' }),
    actorId: uuid('actor_id').references(() => appUser.id, { onDelete: 'restrict' }),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id'),
    before: jsonb('before'),
    after: jsonb('after'),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_log_org_at_idx').on(t.orgId, t.at),
    index('audit_log_org_entity_idx').on(t.orgId, t.entityType, t.entityId),
    check('audit_log_action_ck', sql`length(btrim(action)) > 0`),
  ],
);
