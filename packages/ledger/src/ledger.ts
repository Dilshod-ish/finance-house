import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import {
  glAccount,
  journalEntry,
  journalLine,
  legalEntity,
  periodLock,
  type Database,
  type EntryKind,
  type Side,
} from '@fincore/db';
import {
  Money,
  compareIsoDate,
  currency as toCurrency,
  err,
  isoDate,
  ok,
  type CurrencyCode,
  type IsoDate,
  type Result,
} from '@fincore/shared';
import type { PostingError } from './errors.js';
import { prepareEntry, type EntryContext } from './validate.js';
import type {
  JournalEntryRecord,
  PostEntryInput,
  PreparedLine,
  ReverseEntryOptions,
  TrialBalanceQuery,
  TrialBalanceRow,
} from './types.js';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

interface EntryRow {
  id: string;
  orgId: string;
  legalEntityId: string;
  accrualDate: string;
  cashDate: string | null;
  kind: EntryKind;
  sourceType: string;
  sourceId: string | null;
  description: string | null;
  reversedById: string | null;
  reversesId: string | null;
  reversalReason: string | null;
  idempotencyKey: string | null;
  postedBy: string | null;
}

function toRecord(row: EntryRow, deduplicated: boolean): JournalEntryRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    legalEntityId: row.legalEntityId,
    accrualDate: isoDate(row.accrualDate),
    cashDate: row.cashDate === null ? null : isoDate(row.cashDate),
    kind: row.kind,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    description: row.description,
    reversedById: row.reversedById,
    reversesId: row.reversesId,
    reversalReason: row.reversalReason,
    idempotencyKey: row.idempotencyKey,
    postedBy: row.postedBy,
    deduplicated,
  };
}

function flip(side: Side): Side {
  return side === 'D' ? 'C' : 'D';
}

export interface Ledger {
  postEntry(input: PostEntryInput): Promise<Result<JournalEntryRecord, PostingError>>;
  /**
   * `orgId` comes first because row level security needs the tenant before the
   * first read: without it the lookup returns nothing rather than the entry.
   */
  reverseEntry(
    orgId: string,
    entryId: string,
    reason: string,
    actor: string | null,
    options?: ReverseEntryOptions,
  ): Promise<Result<JournalEntryRecord, PostingError>>;
  getTrialBalance(query: TrialBalanceQuery): Promise<TrialBalanceRow[]>;
}

/**
 * The only writer of `journal_entry` and `journal_line` (CLAUDE.md §4).
 * Expected failures come back as `Err`; anything thrown is a bug or an
 * infrastructure fault and is left to propagate.
 */
export function createLedger(db: Database): Ledger {
  /** Binds the transaction to one tenant so RLS applies to every statement. */
  async function bind(tx: Tx, orgId: string): Promise<void> {
    await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
  }

  /** Latest locked date for a legal entity, or null when nothing is locked. */
  async function loadLock(tx: Tx, orgId: string, legalEntityId: string): Promise<IsoDate | null> {
    const locks = await tx
      .select({ lockedThrough: periodLock.lockedThroughDate })
      .from(periodLock)
      .where(and(eq(periodLock.orgId, orgId), eq(periodLock.legalEntityId, legalEntityId)))
      .limit(1);
    const lock = locks[0];
    return lock === undefined ? null : isoDate(lock.lockedThrough);
  }

  async function loadContext(
    tx: Tx,
    orgId: string,
    legalEntityId: string,
  ): Promise<Result<EntryContext, PostingError>> {
    const entities = await tx
      .select({ functionalCurrency: legalEntity.functionalCurrency })
      .from(legalEntity)
      .where(and(eq(legalEntity.orgId, orgId), eq(legalEntity.id, legalEntityId)))
      .limit(1);

    const entity = entities[0];
    if (entity === undefined) {
      return err({
        code: 'LEGAL_ENTITY_NOT_FOUND',
        message: `Legal entity ${legalEntityId} does not exist in this organization`,
        legalEntityId,
      });
    }

    return ok({
      functionalCurrency: toCurrency(entity.functionalCurrency.trim()),
      lockedThrough: await loadLock(tx, orgId, legalEntityId),
    });
  }

  async function insertLines(
    tx: Tx,
    orgId: string,
    entryId: string,
    lines: readonly PreparedLine[],
  ): Promise<void> {
    await tx.insert(journalLine).values(
      lines.map((line) => ({
        orgId,
        entryId,
        glAccountId: line.glAccountId,
        side: line.side,
        amount: line.amount.toStorage(),
        currency: line.amount.currency,
        fxRate: line.fxRate,
        amountFunctional: line.amountFunctional.toStorage(),
        sourceType: line.sourceType,
        sourceId: line.sourceId,
        accountId: line.dimensions.accountId,
        articleId: line.dimensions.articleId,
        directionId: line.dimensions.directionId,
        counterpartyId: line.dimensions.counterpartyId,
        dealId: line.dimensions.dealId,
        projectId: line.dimensions.projectId,
        employeeId: line.dimensions.employeeId,
        costCenterId: line.dimensions.costCenterId,
        tags: [...line.dimensions.tags],
        memo: line.dimensions.memo,
      })),
    );
  }

  async function findByIdempotencyKey(
    tx: Tx,
    orgId: string,
    key: string,
  ): Promise<EntryRow | undefined> {
    const rows = await tx
      .select()
      .from(journalEntry)
      .where(and(eq(journalEntry.orgId, orgId), eq(journalEntry.idempotencyKey, key)))
      .limit(1);
    return rows[0];
  }

  async function postEntry(
    input: PostEntryInput,
  ): Promise<Result<JournalEntryRecord, PostingError>> {
    const key = input.idempotencyKey ?? null;
    return db.transaction(async (tx) => {
      await bind(tx, input.orgId);

      if (key !== null) {
        // A replay — the same statement imported twice — returns the original
        // entry. A genuinely concurrent duplicate hits the unique index and
        // raises: nothing is double-posted, and the caller retries.
        const existing = await findByIdempotencyKey(tx, input.orgId, key);
        if (existing !== undefined) {
          return ok(toRecord(existing, true));
        }
      }

      const context = await loadContext(tx, input.orgId, input.legalEntityId);
      if (!context.ok) {
        return context;
      }

      // Nothing is written until the entry balances in functional currency.
      const prepared = prepareEntry(input, context.value);
      if (!prepared.ok) {
        return prepared;
      }

      const values = {
        orgId: input.orgId,
        legalEntityId: input.legalEntityId,
        accrualDate: input.accrualDate,
        cashDate: input.cashDate ?? null,
        kind: input.kind,
        sourceType: input.sourceType,
        sourceId: input.sourceId ?? null,
        description: input.description ?? null,
        idempotencyKey: key,
        postedBy: input.postedBy ?? null,
      };

      const inserted = await tx.insert(journalEntry).values(values).returning();
      const row = inserted[0] as EntryRow;
      await insertLines(tx, input.orgId, row.id, prepared.value.lines);
      return ok(toRecord(row, false));
    });
  }

  async function reverseEntry(
    orgId: string,
    entryId: string,
    reason: string,
    actor: string | null,
    options: ReverseEntryOptions = {},
  ): Promise<Result<JournalEntryRecord, PostingError>> {
    return db.transaction(async (tx) => {
      await bind(tx, orgId);

      const originals = await tx
        .select()
        .from(journalEntry)
        .where(and(eq(journalEntry.orgId, orgId), eq(journalEntry.id, entryId)))
        .limit(1);

      const original = originals[0] as EntryRow | undefined;
      if (original === undefined) {
        return err({
          code: 'ENTRY_NOT_FOUND',
          message: `Journal entry ${entryId} does not exist in this organization`,
          entryId,
        });
      }

      if (original.reversedById !== null) {
        return err({
          code: 'ALREADY_REVERSED',
          message: `Journal entry ${entryId} was already reversed by ${original.reversedById}`,
          entryId,
          reversedById: original.reversedById,
        });
      }

      const accrualDate = options.accrualDate ?? isoDate(original.accrualDate);
      // The entity always exists (foreign key), so only the lock is read here.
      const lockedThrough = await loadLock(tx, orgId, original.legalEntityId);
      if (lockedThrough !== null && compareIsoDate(accrualDate, lockedThrough) <= 0) {
        return err({
          code: 'PERIOD_LOCKED',
          message: `Period is locked through ${lockedThrough}; pass an open accrualDate to reverse entry ${entryId} (I2)`,
          lockedThrough,
          attemptedDate: accrualDate,
          legalEntityId: original.legalEntityId,
        });
      }

      const lines = await tx.select().from(journalLine).where(eq(journalLine.entryId, entryId));

      const reversal = await tx
        .insert(journalEntry)
        .values({
          orgId,
          legalEntityId: original.legalEntityId,
          accrualDate,
          cashDate: original.cashDate,
          kind: 'reversal',
          sourceType: original.sourceType,
          sourceId: original.sourceId,
          description: options.description ?? null,
          reversesId: entryId,
          reversalReason: reason,
          idempotencyKey: options.idempotencyKey ?? null,
          postedBy: actor,
        })
        .returning();

      const reversalRow = reversal[0] as EntryRow;

      await tx.insert(journalLine).values(
        lines.map((line) => ({
          orgId,
          entryId: reversalRow.id,
          glAccountId: line.glAccountId,
          // The whole of a reversal: same amounts, same dimensions, other side.
          side: flip(line.side),
          amount: line.amount,
          currency: line.currency,
          fxRate: line.fxRate,
          amountFunctional: line.amountFunctional,
          sourceType: line.sourceType,
          sourceId: line.sourceId,
          accountId: line.accountId,
          articleId: line.articleId,
          directionId: line.directionId,
          counterpartyId: line.counterpartyId,
          dealId: line.dealId,
          projectId: line.projectId,
          employeeId: line.employeeId,
          costCenterId: line.costCenterId,
          tags: line.tags,
          memo: line.memo,
        })),
      );

      // The one mutation I4 permits, and the trigger enforces it is the only one.
      await tx
        .update(journalEntry)
        .set({ reversedById: reversalRow.id })
        .where(and(eq(journalEntry.orgId, orgId), eq(journalEntry.id, entryId)));

      return ok(toRecord(reversalRow, false));
    });
  }

  async function getTrialBalance(query: TrialBalanceQuery): Promise<TrialBalanceRow[]> {
    return db.transaction(async (tx) => {
      await bind(tx, query.orgId);

      const conditions = [eq(journalLine.orgId, query.orgId)];
      if (query.legalEntityIds !== undefined) {
        conditions.push(inArray(journalEntry.legalEntityId, [...query.legalEntityIds]));
      }
      if (query.from !== undefined) {
        conditions.push(gte(journalEntry.accrualDate, query.from));
      }
      if (query.to !== undefined) {
        conditions.push(lte(journalEntry.accrualDate, query.to));
      }

      const rows = await tx
        .select({
          glAccountId: journalLine.glAccountId,
          code: glAccount.code,
          name: glAccount.name,
          currency: legalEntity.functionalCurrency,
          debit: sql<string>`sum(case when ${journalLine.side} = 'D' then ${journalLine.amountFunctional} else 0 end)`,
          credit: sql<string>`sum(case when ${journalLine.side} = 'C' then ${journalLine.amountFunctional} else 0 end)`,
        })
        .from(journalLine)
        .innerJoin(journalEntry, eq(journalEntry.id, journalLine.entryId))
        .innerJoin(glAccount, eq(glAccount.id, journalLine.glAccountId))
        .innerJoin(legalEntity, eq(legalEntity.id, journalEntry.legalEntityId))
        .where(and(...conditions))
        .groupBy(
          journalLine.glAccountId,
          glAccount.code,
          glAccount.name,
          legalEntity.functionalCurrency,
        )
        .orderBy(glAccount.code, journalLine.glAccountId);

      return rows.map((row) => {
        const rowCurrency: CurrencyCode = toCurrency(row.currency.trim());
        const debit = Money.of(row.debit, rowCurrency);
        const credit = Money.of(row.credit, rowCurrency);
        return {
          glAccountId: row.glAccountId,
          code: row.code,
          name: row.name,
          currency: rowCurrency,
          debit,
          credit,
          balance: debit.minus(credit),
        };
      });
    });
  }

  return { postEntry, reverseEntry, getTrialBalance };
}
