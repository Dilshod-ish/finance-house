import { sql } from 'drizzle-orm';
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, currencyCode, money, pk } from './columns.js';
import {
  CASH_DIRECTIONS,
  IMPORT_BATCH_STATUSES,
  inList,
  type CashDirection,
  type ImportBatchStatus,
} from '@fincore/shared';
import { account, article, counterparty, direction } from './reference.js';
import { appUser, legalEntity, organization } from './tenancy.js';

/**
 * One uploaded file. It exists so that an import is undoable as a unit: the
 * promise is "one click puts it back", and that needs the set of entries one
 * file produced to be nameable.
 */
export const importBatch = pgTable(
  'import_batch',
  {
    id: pk(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'restrict' }),
    legalEntityId: uuid('legal_entity_id').notNull(),
    /** One statement covers one account — the template enforces it too. */
    accountId: uuid('account_id').notNull(),
    /** Which template the file was read as, e.g. `bank-kochirma`. */
    template: text('template').notNull(),
    fileName: text('file_name').notNull(),
    /** sha-256 of the bytes: the same file cannot land twice. */
    fileHash: text('file_hash').notNull(),
    rowCount: integer('row_count').notNull(),
    postedCount: integer('posted_count').notNull(),
    duplicateCount: integer('duplicate_count').notNull(),
    periodFrom: date('period_from'),
    periodTo: date('period_to'),
    openingBalance: money('opening_balance'),
    closingBalance: money('closing_balance'),
    status: text('status').$type<ImportBatchStatus>().notNull(),
    importedBy: uuid('imported_by').references(() => appUser.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    revertedAt: timestamp('reverted_at', { withTimezone: true }),
    revertedBy: uuid('reverted_by').references(() => appUser.id, { onDelete: 'set null' }),
    revertedReason: text('reverted_reason'),
  },
  (t) => [
    foreignKey({
      name: 'import_batch_legal_entity_fk',
      columns: [t.legalEntityId, t.orgId],
      foreignColumns: [legalEntity.id, legalEntity.orgId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'import_batch_account_fk',
      columns: [t.accountId, t.orgId],
      foreignColumns: [account.id, account.orgId],
    }).onDelete('restrict'),
    unique('import_batch_id_org_uq').on(t.id, t.orgId),
    index('import_batch_org_created_idx').on(t.orgId, t.createdAt),
    // Partial, so a file may be re-imported once its batch has been reverted.
    uniqueIndex('import_batch_org_file_hash_uq')
      .on(t.orgId, t.fileHash)
      .where(sql`status = 'imported'`),
    check('import_batch_status_ck', sql.raw(`status in (${inList(IMPORT_BATCH_STATUSES)})`)),
    check(
      'import_batch_counts_ck',
      sql`row_count >= 0 and posted_count >= 0 and duplicate_count >= 0 and posted_count + duplicate_count <= row_count`,
    ),
    check(
      'import_batch_period_order_ck',
      sql`period_from is null or period_to is null or period_from <= period_to`,
    ),
    check('import_batch_reverted_shape_ck', sql`(status = 'reverted') = (reverted_at is not null)`),
  ],
);

/**
 * A movement on a bank account or cash desk, as the statement stated it or as
 * a person typed it.
 *
 * This is a source document, not a second ledger (CLAUDE.md §1). What the
 * movement did to the books lives in `journal_entry` alone, reachable through
 * `source_type = 'cash_operation'` and `source_id` (I3). There is deliberately
 * no `entry_id` here: reassigning an article reverses the entry and posts a new
 * one (I4), so a column naming "the" entry would be a mutable second truth.
 * The live entry is the one with `reversed_by_id is null and kind <> 'reversal'`.
 */
export const cashOperation = pgTable(
  'cash_operation',
  {
    id: pk(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'restrict' }),
    legalEntityId: uuid('legal_entity_id').notNull(),
    accountId: uuid('account_id').notNull(),
    /** Null for an operation entered by hand rather than imported. */
    importBatchId: uuid('import_batch_id'),
    /** Which row of the source file, so a problem points back at the sheet. */
    rowNumber: integer('row_number'),
    /** I6: when the money actually moved. */
    cashDate: date('cash_date').notNull(),
    direction: text('direction').$type<CashDirection>().notNull(),
    amount: money('amount').notNull(),
    currency: currencyCode('currency').notNull(),
    counterpartyId: uuid('counterparty_id'),
    /** Null means unclassified: the inbox, and the suspense account. */
    articleId: uuid('article_id'),
    directionId: uuid('direction_id'),
    documentNumber: text('document_number'),
    purpose: text('purpose'),
    memo: text('memo'),
    /** See `dedupHash` in @fincore/operations: what makes two rows the same. */
    dedupHash: text('dedup_hash').notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'cash_operation_legal_entity_fk',
      columns: [t.legalEntityId, t.orgId],
      foreignColumns: [legalEntity.id, legalEntity.orgId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'cash_operation_account_fk',
      columns: [t.accountId, t.orgId],
      foreignColumns: [account.id, account.orgId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'cash_operation_batch_fk',
      columns: [t.importBatchId, t.orgId],
      foreignColumns: [importBatch.id, importBatch.orgId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'cash_operation_counterparty_fk',
      columns: [t.counterpartyId, t.orgId],
      foreignColumns: [counterparty.id, counterparty.orgId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'cash_operation_article_fk',
      columns: [t.articleId, t.orgId],
      foreignColumns: [article.id, article.orgId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'cash_operation_direction_fk',
      columns: [t.directionId, t.orgId],
      foreignColumns: [direction.id, direction.orgId],
    }).onDelete('restrict'),
    unique('cash_operation_id_org_uq').on(t.id, t.orgId),
    index('cash_operation_org_account_date_idx').on(t.orgId, t.accountId, t.cashDate),
    index('cash_operation_org_dedup_idx').on(t.orgId, t.dedupHash),
    index('cash_operation_org_batch_idx').on(t.orgId, t.importBatchId),
    index('cash_operation_org_unassigned_idx')
      .on(t.orgId, t.cashDate)
      .where(sql`article_id is null`),
    check('cash_operation_direction_ck', sql.raw(`direction in (${inList(CASH_DIRECTIONS)})`)),
    check('cash_operation_amount_ck', sql`amount > 0`),
    check('cash_operation_currency_ck', sql`currency ~ '^[A-Z]{3}$'`),
    check('cash_operation_row_shape_ck', sql`(import_batch_id is null) = (row_number is null)`),
  ],
);
