import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import {
  account,
  article,
  cashOperation,
  counterparty,
  direction as directionTable,
  importBatch,
  journalEntry,
  legalEntity,
  type Database,
} from '@fincore/db';
import { createLedger, type Ledger, type PostEntryInput } from '@fincore/ledger';
import type { RegionPack } from '@fincore/region-pack-contract';
import {
  Money,
  currency as toCurrency,
  err,
  isoDate,
  ok,
  type CashDirection,
  type CurrencyCode,
  type IsoDate,
  type Result,
} from '@fincore/shared';
import { dedupHash, fileHash, foldText } from './dedup.js';
import { rateOn } from './fx.js';
import { loadGlResolver } from './gl.js';
import { readStatement } from './read-statement.js';
import type {
  AssignResult,
  DuplicateRow,
  ImportResult,
  ImportedOperation,
  InboxRow,
  OperationsError,
  RevertResult,
} from './types.js';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

export interface ImportStatementInput {
  readonly orgId: string;
  readonly pack: RegionPack;
  readonly fileName: string;
  readonly bytes: Uint8Array;
  readonly actorId?: string | null;
}

export interface AssignArticleInput {
  readonly orgId: string;
  readonly pack: RegionPack;
  readonly operationId: string;
  readonly articleId: string;
  readonly directionId?: string | null;
  readonly actorId?: string | null;
}

export interface RevertBatchInput {
  readonly orgId: string;
  readonly batchId: string;
  readonly reason: string;
  readonly actorId?: string | null;
}

export interface BatchSummary {
  readonly id: string;
  readonly fileName: string;
  readonly accountId: string;
  readonly accountName: string;
  readonly rowCount: number;
  readonly postedCount: number;
  readonly duplicateCount: number;
  readonly status: 'imported' | 'reverted';
  readonly createdAt: Date;
}

export interface Operations {
  /** An uploaded bank statement becomes journal entries, or nothing at all. */
  importBankStatement(input: ImportStatementInput): Promise<Result<ImportResult, OperationsError>>;
  /** Classify an operation: reverse what it posted and post it again (I4). */
  assignArticle(input: AssignArticleInput): Promise<Result<AssignResult, OperationsError>>;
  /** Undo a whole import in one go, by reversal — never by deletion. */
  revertBatch(input: RevertBatchInput): Promise<Result<RevertResult, OperationsError>>;
  /** Everything still waiting for an article (PRD US-2.2). */
  listInbox(orgId: string, limit?: number): Promise<InboxRow[]>;
  listBatches(orgId: string, limit?: number): Promise<BatchSummary[]>;
}

/** A name a person typed matches a reference row on its folded form. */
const byFoldedName = <T extends { name: string }>(rows: readonly T[]): Map<string, T> =>
  new Map(rows.map((row) => [foldText(row.name), row]));

export function createOperations(db: Database): Operations {
  const ledger: Ledger = createLedger(db);

  async function bind(tx: Tx, orgId: string): Promise<void> {
    await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
  }

  /**
   * The entry an operation currently stands on: not a reversal, and not
   * itself reversed. Derived rather than stored — see the note on
   * `cash_operation` in the schema.
   */
  async function liveEntryId(tx: Tx, orgId: string, operationId: string): Promise<string | null> {
    const rows = await tx
      .select({ id: journalEntry.id })
      .from(journalEntry)
      .where(
        and(
          eq(journalEntry.orgId, orgId),
          eq(journalEntry.sourceType, 'cash_operation'),
          eq(journalEntry.sourceId, operationId),
          isNull(journalEntry.reversedById),
          ne(journalEntry.kind, 'reversal'),
        ),
      )
      .limit(1);
    return rows[0]?.id ?? null;
  }

  /**
   * The entry one cash operation posts: the money account on one side, and on
   * the other either the article's own GL account or, when nobody has said
   * what the movement was for, the suspense account (ADR-0009).
   */
  function entryFor(args: {
    readonly orgId: string;
    readonly legalEntityId: string;
    readonly operationId: string;
    readonly accountId: string;
    readonly cashDate: IsoDate;
    readonly direction: CashDirection;
    readonly amount: Money;
    readonly cashGlId: string;
    readonly contraGlId: string;
    readonly fxRate: string | undefined;
    readonly articleId: string | null;
    readonly directionId: string | null;
    readonly counterpartyId: string | null;
    readonly memo: string | null;
    readonly description: string | null;
    readonly idempotencyKey: string;
    readonly actorId: string | null;
  }): PostEntryInput {
    const rate = args.fxRate === undefined ? {} : { fxRate: args.fxRate };
    const cashLeg = {
      glAccountId: args.cashGlId,
      side: args.direction === 'in' ? ('D' as const) : ('C' as const),
      amount: args.amount,
      accountId: args.accountId,
      counterpartyId: args.counterpartyId,
      memo: args.memo,
      ...rate,
    };
    const contraLeg = {
      glAccountId: args.contraGlId,
      side: args.direction === 'in' ? ('C' as const) : ('D' as const),
      amount: args.amount,
      articleId: args.articleId,
      directionId: args.directionId,
      counterpartyId: args.counterpartyId,
      memo: args.memo,
      ...rate,
    };

    return {
      orgId: args.orgId,
      legalEntityId: args.legalEntityId,
      // I6: a bank movement is dated by the day the money moved, on both
      // fields. There is no separate economic event here — the statement is
      // the event.
      accrualDate: args.cashDate,
      cashDate: args.cashDate,
      kind: 'cash',
      sourceType: 'cash_operation',
      sourceId: args.operationId,
      description: args.description,
      idempotencyKey: args.idempotencyKey,
      postedBy: args.actorId,
      lines: [cashLeg, contraLeg],
    };
  }

  async function importBankStatement(
    input: ImportStatementInput,
  ): Promise<Result<ImportResult, OperationsError>> {
    const contents = await readStatement(input.bytes, input.pack);
    if (!contents.ok) {
      return contents;
    }
    const { header, drafts } = contents.value;
    const hash = fileHash(input.bytes);

    const prepared = await db.transaction(
      async (
        tx,
      ): Promise<
        | { readonly ok: false; readonly error: OperationsError }
        | {
            readonly ok: true;
            readonly batchId: string;
            readonly accountId: string;
            readonly legalEntityId: string;
            readonly entries: readonly {
              readonly operation: ImportedOperation;
              readonly input: PostEntryInput;
            }[];
            readonly duplicates: readonly DuplicateRow[];
            readonly unknownArticles: readonly string[];
          }
      > => {
        await bind(tx, input.orgId);

        const standing = await tx
          .select({ id: importBatch.id })
          .from(importBatch)
          .where(
            and(
              eq(importBatch.orgId, input.orgId),
              eq(importBatch.fileHash, hash),
              eq(importBatch.status, 'imported'),
            ),
          )
          .limit(1);
        if (standing[0] !== undefined) {
          return {
            ok: false,
            error: {
              code: 'already_imported',
              message: `Bu fayl allaqachon yuklangan (partiya ${standing[0].id}). Avval uni bekor qiling.`,
            },
          };
        }

        const accounts = await tx
          .select({
            id: account.id,
            name: account.name,
            kind: account.kind,
            currency: account.currency,
            legalEntityId: account.legalEntityId,
          })
          .from(account)
          .where(and(eq(account.orgId, input.orgId), eq(account.isActive, true)));

        const matched = byFoldedName(accounts).get(foldText(header.accountName));
        if (matched === undefined) {
          return {
            ok: false,
            error: {
              code: 'unknown_account',
              message: `«${header.accountName}» nomli hisob bu organizatsiyada yo'q`,
            },
          };
        }
        if (matched.currency !== header.currency) {
          return {
            ok: false,
            error: {
              code: 'currency_mismatch',
              message: `«${matched.name}» hisobi ${matched.currency} da, ko'chirma esa ${header.currency} da`,
            },
          };
        }

        const entities = await tx
          .select({ functionalCurrency: legalEntity.functionalCurrency })
          .from(legalEntity)
          .where(and(eq(legalEntity.orgId, input.orgId), eq(legalEntity.id, matched.legalEntityId)))
          .limit(1);
        const functional = entities[0]?.functionalCurrency;
        if (functional === undefined) {
          return {
            ok: false,
            error: { code: 'unknown_account', message: 'Hisobning yuridik shaxsi topilmadi' },
          };
        }

        const gl = await loadGlResolver(tx, input.orgId, input.pack);
        const cashGlId = gl.cashFor(matched.kind);
        const suspenseGlId = gl.byRole('suspense');
        if (cashGlId === null || suspenseGlId === null) {
          return {
            ok: false,
            error: {
              code: 'missing_gl_account',
              message: `Hisob rejasida ${cashGlId === null ? `«${matched.kind}» turidagi pul` : 'taqsimlanmagan operatsiyalar'} hisobi yo'q`,
            },
          };
        }

        const rate = await rateOn(
          tx,
          input.orgId,
          header.currency,
          toCurrency(functional),
          header.periodTo ?? header.periodFrom ?? isoDate('1970-01-01'),
        );
        if (rate === null) {
          return {
            ok: false,
            error: {
              code: 'missing_fx_rate',
              message: `${header.currency}/${functional} uchun kurs yo'q. Kursni kiriting — taxmin qilinmaydi.`,
            },
          };
        }
        const fxLine = header.currency === functional ? undefined : rate.toFixed(10);

        const articles = byFoldedName(
          await tx
            .select({ id: article.id, name: article.name, glAccountId: article.glAccountId })
            .from(article)
            .where(and(eq(article.orgId, input.orgId), eq(article.isArchived, false))),
        );
        const directions = byFoldedName(
          await tx
            .select({ id: directionTable.id, name: directionTable.name })
            .from(directionTable)
            .where(
              and(eq(directionTable.orgId, input.orgId), eq(directionTable.isArchived, false)),
            ),
        );
        const counterparties = byFoldedName(
          await tx
            .select({ id: counterparty.id, name: counterparty.name })
            .from(counterparty)
            .where(eq(counterparty.orgId, input.orgId)),
        );

        /*
         * A counterparty nobody has set up yet is created rather than
         * refused: a statement names whoever paid, and failing the file over
         * an unseen name would make the first import of every month fail.
         */
        const newCounterparties = new Map<string, { id: string; name: string }>();
        for (const draft of drafts) {
          if (draft.counterpartyName === null) continue;
          const key = foldText(draft.counterpartyName);
          if (counterparties.has(key) || newCounterparties.has(key)) continue;
          newCounterparties.set(key, { id: randomUUID(), name: draft.counterpartyName });
        }
        if (newCounterparties.size > 0) {
          await tx.insert(counterparty).values(
            [...newCounterparties.values()].map((row) => ({
              id: row.id,
              orgId: input.orgId,
              name: row.name,
            })),
          );
          for (const [key, row] of newCounterparties) {
            counterparties.set(key, row);
          }
        }

        const hashes = drafts.map((draft) =>
          dedupHash({
            accountId: matched.id,
            cashDate: draft.cashDate,
            direction: draft.direction,
            amount: draft.amount.toStorage(),
            currency: header.currency,
            documentNumber: draft.documentNumber,
            purpose: draft.purpose,
          }),
        );
        const existing =
          hashes.length === 0
            ? []
            : await tx
                .select({ id: cashOperation.id, dedupHash: cashOperation.dedupHash })
                .from(cashOperation)
                .where(
                  and(
                    eq(cashOperation.orgId, input.orgId),
                    inArray(cashOperation.dedupHash, hashes),
                  ),
                );
        const seen = new Map(existing.map((row) => [row.dedupHash, row.id]));

        const batchId = randomUUID();
        const duplicates: DuplicateRow[] = [];
        const unknownArticles: string[] = [];
        const rows: (typeof cashOperation.$inferInsert)[] = [];
        const entries: { operation: ImportedOperation; input: PostEntryInput }[] = [];

        for (const [index, draft] of drafts.entries()) {
          const rowHash = hashes[index] ?? '';
          const clash = seen.get(rowHash);
          if (clash !== undefined) {
            duplicates.push({
              rowNumber: draft.rowNumber,
              cashDate: draft.cashDate,
              amount: draft.amount,
              documentNumber: draft.documentNumber,
              existingOperationId: clash,
            });
            continue;
          }
          // Two identical rows inside one file are duplicates of each other.
          seen.set(rowHash, 'pending');

          const resolvedArticle =
            draft.articleName === null ? undefined : articles.get(foldText(draft.articleName));
          if (draft.articleName !== null && resolvedArticle === undefined) {
            unknownArticles.push(draft.articleName);
          }
          const resolvedDirection =
            draft.directionName === null
              ? undefined
              : directions.get(foldText(draft.directionName));
          const resolvedCounterparty =
            draft.counterpartyName === null
              ? undefined
              : counterparties.get(foldText(draft.counterpartyName));

          const operationId = randomUUID();
          rows.push({
            id: operationId,
            orgId: input.orgId,
            legalEntityId: matched.legalEntityId,
            accountId: matched.id,
            importBatchId: batchId,
            rowNumber: draft.rowNumber,
            cashDate: draft.cashDate,
            direction: draft.direction,
            amount: draft.amount.toStorage(),
            currency: header.currency,
            counterpartyId: resolvedCounterparty?.id ?? null,
            articleId: resolvedArticle?.id ?? null,
            directionId: resolvedDirection?.id ?? null,
            documentNumber: draft.documentNumber,
            purpose: draft.purpose,
            memo: draft.memo,
            dedupHash: rowHash,
          });

          entries.push({
            operation: {
              id: operationId,
              rowNumber: draft.rowNumber,
              entryId: '',
              cashDate: draft.cashDate,
              direction: draft.direction,
              amount: draft.amount,
              articleId: resolvedArticle?.id ?? null,
            },
            input: entryFor({
              orgId: input.orgId,
              legalEntityId: matched.legalEntityId,
              operationId,
              accountId: matched.id,
              cashDate: draft.cashDate,
              direction: draft.direction,
              amount: draft.amount,
              cashGlId,
              contraGlId: resolvedArticle?.glAccountId ?? suspenseGlId,
              fxRate: fxLine,
              articleId: resolvedArticle?.id ?? null,
              directionId: resolvedDirection?.id ?? null,
              counterpartyId: resolvedCounterparty?.id ?? null,
              memo: draft.memo,
              description: draft.purpose,
              idempotencyKey: `import:${batchId}:${String(draft.rowNumber ?? 0)}`,
              actorId: input.actorId ?? null,
            }),
          });
        }

        await tx.insert(importBatch).values({
          id: batchId,
          orgId: input.orgId,
          legalEntityId: matched.legalEntityId,
          accountId: matched.id,
          template: 'bank-kochirma',
          fileName: input.fileName,
          fileHash: hash,
          rowCount: drafts.length,
          postedCount: rows.length,
          duplicateCount: duplicates.length,
          periodFrom: header.periodFrom,
          periodTo: header.periodTo,
          openingBalance: header.openingBalance?.toStorage() ?? null,
          closingBalance: header.closingBalance?.toStorage() ?? null,
          status: 'imported',
          importedBy: input.actorId ?? null,
        });
        if (rows.length > 0) {
          await tx.insert(cashOperation).values(rows);
        }

        return {
          ok: true,
          batchId,
          accountId: matched.id,
          legalEntityId: matched.legalEntityId,
          entries,
          duplicates,
          unknownArticles,
        };
      },
    );

    if (!prepared.ok) {
      return err(prepared.error);
    }

    /*
     * Posting happens after the rows are committed, because the ledger owns
     * its own transaction and is the only writer of `journal_*` (CLAUDE.md
     * §4). The keys are deterministic, so a retry of the whole import is
     * safe; a refusal part-way through reverts what did post, so the batch is
     * never half-applied.
     */
    const posted: ImportedOperation[] = [];
    for (const entry of prepared.entries) {
      const result = await ledger.postEntry(entry.input);
      if (!result.ok) {
        await revertBatch({
          orgId: input.orgId,
          batchId: prepared.batchId,
          reason: `posting refused: ${result.error.code}`,
          actorId: input.actorId ?? null,
        });
        return err({
          code: 'posting_refused',
          message: `${result.error.code}: ${result.error.message}`,
        });
      }
      posted.push({ ...entry.operation, entryId: result.value.id });
    }

    return ok({
      batchId: prepared.batchId,
      accountId: prepared.accountId,
      rowCount: prepared.entries.length + prepared.duplicates.length,
      posted,
      duplicates: prepared.duplicates,
      unassignedCount: posted.filter((row) => row.articleId === null).length,
      unknownArticles: prepared.unknownArticles,
    });
  }

  async function assignArticle(
    input: AssignArticleInput,
  ): Promise<Result<AssignResult, OperationsError>> {
    const resolved = await db.transaction(async (tx) => {
      await bind(tx, input.orgId);

      const operations = await tx
        .select()
        .from(cashOperation)
        .where(and(eq(cashOperation.orgId, input.orgId), eq(cashOperation.id, input.operationId)))
        .limit(1);
      const operation = operations[0];
      if (operation === undefined) {
        return { found: false as const };
      }

      const articles = await tx
        .select({ id: article.id, glAccountId: article.glAccountId })
        .from(article)
        .where(and(eq(article.orgId, input.orgId), eq(article.id, input.articleId)))
        .limit(1);
      const target = articles[0];

      const accounts = await tx
        .select({ kind: account.kind, currency: account.currency })
        .from(account)
        .where(and(eq(account.orgId, input.orgId), eq(account.id, operation.accountId)))
        .limit(1);
      const entities = await tx
        .select({ functionalCurrency: legalEntity.functionalCurrency })
        .from(legalEntity)
        .where(and(eq(legalEntity.orgId, input.orgId), eq(legalEntity.id, operation.legalEntityId)))
        .limit(1);

      const gl = await loadGlResolver(tx, input.orgId, input.pack);
      const entryId = await liveEntryId(tx, input.orgId, input.operationId);
      const rate = await rateOn(
        tx,
        input.orgId,
        toCurrency(operation.currency),
        toCurrency(entities[0]?.functionalCurrency ?? operation.currency),
        isoDate(operation.cashDate),
      );

      return {
        found: true as const,
        operation,
        target,
        accountKind: accounts[0]?.kind,
        functional: entities[0]?.functionalCurrency,
        cashGlId: accounts[0] === undefined ? null : gl.cashFor(accounts[0].kind),
        entryId,
        rate,
      };
    });

    if (!resolved.found) {
      return err({
        code: 'unknown_operation',
        message: `Operatsiya ${input.operationId} topilmadi`,
      });
    }
    const { operation, target, cashGlId, entryId, functional, rate } = resolved;
    if (target === undefined) {
      return err({ code: 'unknown_article', message: `Modda ${input.articleId} topilmadi` });
    }
    if (cashGlId === null) {
      return err({ code: 'missing_gl_account', message: 'Pul hisobi topilmadi' });
    }
    if (entryId === null) {
      return err({
        code: 'operation_not_live',
        message: 'Operatsiyaning yozuvi qaytarilgan — tayinlash uchun tirik yozuv yo‘q',
      });
    }
    if (rate === null) {
      return err({
        code: 'missing_fx_rate',
        message: `${operation.currency}/${functional ?? '?'} uchun kurs yo'q`,
      });
    }

    const amountCurrency: CurrencyCode = toCurrency(operation.currency);
    const replacement = entryFor({
      orgId: input.orgId,
      legalEntityId: operation.legalEntityId,
      operationId: operation.id,
      accountId: operation.accountId,
      cashDate: isoDate(operation.cashDate),
      direction: operation.direction,
      amount: Money.of(operation.amount, amountCurrency),
      cashGlId,
      contraGlId: target.glAccountId,
      fxRate: operation.currency === functional ? undefined : rate.toFixed(10),
      articleId: target.id,
      directionId: input.directionId ?? operation.directionId,
      counterpartyId: operation.counterpartyId,
      memo: operation.memo,
      description: operation.purpose,
      idempotencyKey: `assign:${operation.id}:${target.id}:${entryId}`,
      actorId: input.actorId ?? null,
    });

    const replaced = await ledger.replaceEntry(
      input.orgId,
      entryId,
      'article assigned',
      input.actorId ?? null,
      replacement,
    );
    if (!replaced.ok) {
      return err({
        code: 'posting_refused',
        message: `${replaced.error.code}: ${replaced.error.message}`,
      });
    }

    await db.transaction(async (tx) => {
      await bind(tx, input.orgId);
      await tx
        .update(cashOperation)
        .set({
          articleId: target.id,
          directionId: input.directionId ?? operation.directionId,
          updatedAt: new Date(),
        })
        .where(and(eq(cashOperation.orgId, input.orgId), eq(cashOperation.id, operation.id)));
    });

    return ok({
      operationId: operation.id,
      reversedEntryId: entryId,
      entryId: replaced.value.replacement.id,
    });
  }

  async function revertBatch(
    input: RevertBatchInput,
  ): Promise<Result<RevertResult, OperationsError>> {
    const found = await db.transaction(async (tx) => {
      await bind(tx, input.orgId);
      const batches = await tx
        .select({ id: importBatch.id, status: importBatch.status })
        .from(importBatch)
        .where(and(eq(importBatch.orgId, input.orgId), eq(importBatch.id, input.batchId)))
        .limit(1);
      const batch = batches[0];
      if (batch === undefined) {
        return { batch: undefined, operationIds: [] as string[] };
      }
      const operations = await tx
        .select({ id: cashOperation.id })
        .from(cashOperation)
        .where(
          and(eq(cashOperation.orgId, input.orgId), eq(cashOperation.importBatchId, input.batchId)),
        );
      return { batch, operationIds: operations.map((row) => row.id) };
    });

    if (found.batch === undefined) {
      return err({ code: 'unknown_batch', message: `Partiya ${input.batchId} topilmadi` });
    }
    if (found.batch.status === 'reverted') {
      return err({
        code: 'batch_already_reverted',
        message: `Partiya ${input.batchId} allaqachon bekor qilingan`,
      });
    }

    const reversedEntryIds: string[] = [];
    for (const operationId of found.operationIds) {
      const entryId = await db.transaction(async (tx) => {
        await bind(tx, input.orgId);
        return liveEntryId(tx, input.orgId, operationId);
      });
      // Already reversed, or never posted because the import failed earlier:
      // either way there is nothing to undo for this row.
      if (entryId === null) {
        continue;
      }
      const reversal = await ledger.reverseEntry(
        input.orgId,
        entryId,
        input.reason,
        input.actorId ?? null,
      );
      if (!reversal.ok) {
        return err({
          code: 'posting_refused',
          message: `${reversal.error.code}: ${reversal.error.message}`,
        });
      }
      reversedEntryIds.push(entryId);
    }

    await db.transaction(async (tx) => {
      await bind(tx, input.orgId);
      await tx
        .update(importBatch)
        .set({
          status: 'reverted',
          revertedAt: new Date(),
          revertedBy: input.actorId ?? null,
          revertedReason: input.reason,
        })
        .where(and(eq(importBatch.orgId, input.orgId), eq(importBatch.id, input.batchId)));
    });

    return ok({ batchId: input.batchId, reversedEntryIds });
  }

  async function listInbox(orgId: string, limit = 200): Promise<InboxRow[]> {
    return db.transaction(async (tx) => {
      await bind(tx, orgId);
      const rows = await tx
        .select({
          id: cashOperation.id,
          accountId: cashOperation.accountId,
          accountName: account.name,
          cashDate: cashOperation.cashDate,
          direction: cashOperation.direction,
          amount: cashOperation.amount,
          currency: cashOperation.currency,
          counterpartyName: counterparty.name,
          documentNumber: cashOperation.documentNumber,
          purpose: cashOperation.purpose,
        })
        .from(cashOperation)
        .innerJoin(
          account,
          and(eq(account.id, cashOperation.accountId), eq(account.orgId, cashOperation.orgId)),
        )
        .leftJoin(
          counterparty,
          and(
            eq(counterparty.id, cashOperation.counterpartyId),
            eq(counterparty.orgId, cashOperation.orgId),
          ),
        )
        // Only rows that still stand in the ledger: a reverted import's rows
        // stay as a record of what was uploaded, but they are not work.
        .innerJoin(
          journalEntry,
          and(
            eq(journalEntry.orgId, cashOperation.orgId),
            eq(journalEntry.sourceId, cashOperation.id),
            eq(journalEntry.sourceType, 'cash_operation'),
            isNull(journalEntry.reversedById),
            ne(journalEntry.kind, 'reversal'),
          ),
        )
        .where(and(eq(cashOperation.orgId, orgId), isNull(cashOperation.articleId)))
        .orderBy(cashOperation.cashDate, cashOperation.createdAt)
        .limit(limit);

      return rows.map((row) => ({
        id: row.id,
        accountId: row.accountId,
        accountName: row.accountName,
        cashDate: isoDate(row.cashDate),
        direction: row.direction,
        amount: Money.of(row.amount, toCurrency(row.currency)),
        counterpartyName: row.counterpartyName,
        documentNumber: row.documentNumber,
        purpose: row.purpose,
      }));
    });
  }

  async function listBatches(orgId: string, limit = 50): Promise<BatchSummary[]> {
    return db.transaction(async (tx) => {
      await bind(tx, orgId);
      const rows = await tx
        .select({
          id: importBatch.id,
          fileName: importBatch.fileName,
          accountId: importBatch.accountId,
          accountName: account.name,
          rowCount: importBatch.rowCount,
          postedCount: importBatch.postedCount,
          duplicateCount: importBatch.duplicateCount,
          status: importBatch.status,
          createdAt: importBatch.createdAt,
        })
        .from(importBatch)
        .innerJoin(
          account,
          and(eq(account.id, importBatch.accountId), eq(account.orgId, importBatch.orgId)),
        )
        .where(eq(importBatch.orgId, orgId))
        .orderBy(desc(importBatch.createdAt))
        .limit(limit);
      return rows;
    });
  }

  return { importBankStatement, assignArticle, revertBatch, listInbox, listBatches };
}
