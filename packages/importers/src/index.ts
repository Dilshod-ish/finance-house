/**
 * @fincore/importers — the files FinCore accepts, and what makes one valid.
 *
 * The column contract is declared once (`templates/`) and drives both halves:
 * the workbooks handed to a client are generated from it, and a filled
 * workbook is read back against the same definition. Pure functions either
 * side of one `exceljs` boundary; nothing here writes to a ledger.
 */
export * from './templates/index.js';
export {
  checkDuplicateDocuments,
  checkStatementBalances,
  parseAmount,
  parseDate,
  validateSheet,
  type CellValue,
  type ParsedRow,
  type Problem,
  type RawRow,
  type Severity,
  type SheetResult,
  type ValidateOptions,
} from './validate.js';
export { buildTemplate, packValues, readWorkbook, type ReadSheet } from './workbook.js';
