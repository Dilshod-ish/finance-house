import type { BatchSummary, ImportResult, InboxRow, OperationsError } from '@fincore/operations';
import { money, type MoneyDto } from '../http/serialize.js';

export interface InboxRowDto {
  readonly id: string;
  readonly accountId: string;
  readonly accountName: string;
  readonly cashDate: string;
  readonly direction: 'in' | 'out';
  readonly amount: MoneyDto;
  readonly counterpartyName: string | null;
  readonly documentNumber: string | null;
  readonly purpose: string | null;
}

export function inboxRowDto(row: InboxRow): InboxRowDto {
  return {
    id: row.id,
    accountId: row.accountId,
    accountName: row.accountName,
    cashDate: row.cashDate,
    direction: row.direction,
    amount: money(row.amount),
    counterpartyName: row.counterpartyName,
    documentNumber: row.documentNumber,
    purpose: row.purpose,
  };
}

export interface BatchSummaryDto {
  readonly id: string;
  readonly fileName: string;
  readonly accountName: string;
  readonly rowCount: number;
  readonly postedCount: number;
  readonly duplicateCount: number;
  readonly status: 'imported' | 'reverted';
  readonly createdAt: string;
}

export function batchSummaryDto(batch: BatchSummary): BatchSummaryDto {
  return {
    id: batch.id,
    fileName: batch.fileName,
    accountName: batch.accountName,
    rowCount: batch.rowCount,
    postedCount: batch.postedCount,
    duplicateCount: batch.duplicateCount,
    status: batch.status,
    createdAt: batch.createdAt.toISOString(),
  };
}

export interface ImportResultDto {
  readonly batchId: string;
  readonly rowCount: number;
  readonly postedCount: number;
  readonly unassignedCount: number;
  readonly unknownArticles: readonly string[];
  readonly duplicates: readonly {
    readonly rowNumber: number | null;
    readonly cashDate: string;
    readonly amount: MoneyDto;
    readonly documentNumber: string | null;
    readonly existingOperationId: string;
  }[];
}

export function importResultDto(result: ImportResult): ImportResultDto {
  return {
    batchId: result.batchId,
    rowCount: result.rowCount,
    postedCount: result.posted.length,
    unassignedCount: result.unassignedCount,
    unknownArticles: result.unknownArticles,
    duplicates: result.duplicates.map((row) => ({
      rowNumber: row.rowNumber,
      cashDate: row.cashDate,
      amount: money(row.amount),
      documentNumber: row.documentNumber,
      existingOperationId: row.existingOperationId,
    })),
  };
}

/**
 * A refusal on the wire. The validator's findings travel with it: a 422 that
 * only says "invalid file" leaves the person with no way to fix the file, and
 * the sheet, row and column are the whole value of the check.
 */
export interface OperationsErrorDto {
  readonly error: string;
  readonly message: string;
  readonly problems?: readonly {
    readonly severity: 'error' | 'warning';
    readonly sheet: string;
    readonly row: number | null;
    readonly column: string | null;
    readonly message: { readonly uz: string; readonly ru: string; readonly en: string };
  }[];
}

export function operationsErrorDto(error: OperationsError): OperationsErrorDto {
  return {
    error: error.code,
    message: error.message,
    ...(error.problems === undefined
      ? {}
      : {
          problems: error.problems.map((problem) => ({
            severity: problem.severity,
            sheet: problem.sheet,
            row: problem.row,
            column: problem.column,
            message: problem.message,
          })),
        }),
  };
}
