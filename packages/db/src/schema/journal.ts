import { sql } from 'drizzle-orm';
import {
  check,
  date,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { createdAt, currencyCode, money, pk, rate } from './columns.js';
import { ENTRY_KINDS, SIDES, inList, type EntryKind, type Side } from './domain.js';
import { account, article, counterparty, direction, glAccount } from './reference.js';
import { appUser, legalEntity, organization } from './tenancy.js';

/**
 * The ledger. Append-only (I4): the only permitted mutation is setting
 * `reversed_by_id` once, from NULL, when a reversal is posted. Enforced by
 * trigger, not convention — see the invariants migration.
 */
export const journalEntry = pgTable(
  'journal_entry',
  {
    id: pk(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'restrict' }),
    legalEntityId: uuid('legal_entity_id').notNull(),

    /**
     * I6: two distinct dates with distinct meanings.
     * `accrual_date` is when the economic event belongs (P&L, period lock).
     * `cash_date` is when money actually moved; NULL for pure accruals.
     */
    accrualDate: date('accrual_date').notNull(),
    cashDate: date('cash_date'),

    kind: text('kind').$type<EntryKind>().notNull(),

    /** I3: mandatory provenance. Mirrored onto every line for drill-down. */
    sourceType: text('source_type').notNull(),
    sourceId: uuid('source_id'),

    description: text('description'),

    /** Set once, from NULL, when this entry is reversed. */
    reversedById: uuid('reversed_by_id').references((): AnyPgColumn => journalEntry.id, {
      onDelete: 'restrict',
    }),
    /** Set at insert on a reversal entry, pointing at what it reverses. */
    reversesId: uuid('reverses_id').references((): AnyPgColumn => journalEntry.id, {
      onDelete: 'restrict',
    }),
    reversalReason: text('reversal_reason'),

    /** Makes postEntry idempotent; unique per organization when present. */
    idempotencyKey: text('idempotency_key'),

    postedAt: timestamp('posted_at', { withTimezone: true }).notNull().defaultNow(),
    postedBy: uuid('posted_by').references(() => appUser.id, { onDelete: 'restrict' }),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: 'journal_entry_legal_entity_fk',
      columns: [t.legalEntityId, t.orgId],
      foreignColumns: [legalEntity.id, legalEntity.orgId],
    }).onDelete('restrict'),
    unique('journal_entry_id_org_uq').on(t.id, t.orgId),
    unique('journal_entry_org_idempotency_uq').on(t.orgId, t.idempotencyKey),

    // §5.3: trial balance and P&L scan by entity and accrual date.
    index('journal_entry_org_entity_accrual_idx').on(t.orgId, t.legalEntityId, t.accrualDate),
    // §5.3: cash flow and the payment calendar scan by cash date only.
    index('journal_entry_org_cash_date_idx')
      .on(t.orgId, t.cashDate)
      .where(sql`cash_date is not null`),
    // I3: three-click drill-down from a report figure to its source document.
    index('journal_entry_org_source_idx').on(t.orgId, t.sourceType, t.sourceId),
    index('journal_entry_reverses_idx')
      .on(t.reversesId)
      .where(sql`reverses_id is not null`),

    check('journal_entry_kind_ck', sql.raw(`kind in (${inList(ENTRY_KINDS)})`)),
    check('journal_entry_no_self_reverse_ck', sql`reversed_by_id is distinct from id`),
    check('journal_entry_no_self_reverses_ck', sql`reverses_id is distinct from id`),
    check('journal_entry_source_type_ck', sql`length(btrim(source_type)) > 0`),
    // A reversal entry must say what it reverses, and only a reversal may.
    check('journal_entry_reversal_shape_ck', sql`(kind = 'reversal') = (reverses_id is not null)`),
  ],
);

export const journalLine = pgTable(
  'journal_line',
  {
    id: pk(),
    orgId: uuid('org_id').notNull(),
    entryId: uuid('entry_id').notNull(),

    glAccountId: uuid('gl_account_id').notNull(),
    side: text('side').$type<Side>().notNull(),

    /** As transacted. Always positive; direction lives in `side`. */
    amount: money('amount').notNull(),
    currency: currencyCode('currency').notNull(),
    fxRate: rate('fx_rate').notNull(),
    /** I1 is checked on this column, in the legal entity's functional currency. */
    amountFunctional: money('amount_functional').notNull(),

    /** I3, denormalised onto the line so drill-down needs no join. */
    sourceType: text('source_type').notNull(),
    sourceId: uuid('source_id'),

    // Dimensions (§2.2).
    accountId: uuid('account_id'),
    articleId: uuid('article_id'),
    directionId: uuid('direction_id'),
    counterpartyId: uuid('counterparty_id'),
    dealId: uuid('deal_id'),
    projectId: uuid('project_id'),
    employeeId: uuid('employee_id'),
    costCenterId: uuid('cost_center_id'),
    tags: text('tags')
      .array()
      .$type<string[]>()
      .notNull()
      .default(sql`'{}'::text[]`),
    memo: text('memo'),
  },
  (t) => [
    // Composite FKs: a line can never point at another tenant's rows.
    foreignKey({
      name: 'journal_line_entry_fk',
      columns: [t.entryId, t.orgId],
      foreignColumns: [journalEntry.id, journalEntry.orgId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'journal_line_gl_account_fk',
      columns: [t.glAccountId, t.orgId],
      foreignColumns: [glAccount.id, glAccount.orgId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'journal_line_account_fk',
      columns: [t.accountId, t.orgId],
      foreignColumns: [account.id, account.orgId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'journal_line_article_fk',
      columns: [t.articleId, t.orgId],
      foreignColumns: [article.id, article.orgId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'journal_line_direction_fk',
      columns: [t.directionId, t.orgId],
      foreignColumns: [direction.id, direction.orgId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'journal_line_counterparty_fk',
      columns: [t.counterpartyId, t.orgId],
      foreignColumns: [counterparty.id, counterparty.orgId],
    }).onDelete('restrict'),

    // §5.3 access patterns.
    index('journal_line_org_gl_entry_idx').on(t.orgId, t.glAccountId, t.entryId),
    index('journal_line_entry_idx').on(t.entryId),
    index('journal_line_org_direction_idx')
      .on(t.orgId, t.directionId)
      .where(sql`direction_id is not null`),
    index('journal_line_org_account_idx')
      .on(t.orgId, t.accountId)
      .where(sql`account_id is not null`),
    index('journal_line_org_article_idx')
      .on(t.orgId, t.articleId)
      .where(sql`article_id is not null`),
    index('journal_line_org_counterparty_idx')
      .on(t.orgId, t.counterpartyId)
      .where(sql`counterparty_id is not null`),
    index('journal_line_org_source_idx').on(t.orgId, t.sourceType, t.sourceId),

    check('journal_line_side_ck', sql.raw(`side in (${inList(SIDES)})`)),
    check('journal_line_amount_positive_ck', sql`amount > 0`),
    check('journal_line_amount_functional_positive_ck', sql`amount_functional > 0`),
    check('journal_line_fx_rate_positive_ck', sql`fx_rate > 0`),
    check('journal_line_source_type_ck', sql`length(btrim(source_type)) > 0`),
  ],
);
