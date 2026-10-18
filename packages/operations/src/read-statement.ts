import {
  BANK_STATEMENT_TEMPLATE,
  TEMPLATES,
  checkDuplicateDocuments,
  checkStatementBalances,
  detectTemplate,
  packValues,
  readWorkbook,
  validateSheet,
  type Problem,
} from '@fincore/importers';
import type { RegionPack } from '@fincore/region-pack-contract';
import {
  Money,
  currency,
  err,
  isoDate,
  ok,
  type CashDirection,
  type Result,
} from '@fincore/shared';
import type { CashOperationDraft, OperationsError, StatementHeader } from './types.js';

export interface StatementContents {
  readonly header: StatementHeader;
  readonly drafts: readonly CashOperationDraft[];
  /** Everything the validator said, errors already ruled out by the caller. */
  readonly warnings: readonly Problem[];
}

const text = (value: string | null | undefined): string | null => {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

/**
 * Reads a bank statement workbook into drafts, refusing anything the
 * validator calls an error.
 *
 * Nothing is resolved here and nothing is posted: the file is turned into
 * values, exactly as `@fincore/importers` promises, and the service decides
 * what they mean. A file with one bad cell is refused in full — a statement
 * that is partly loaded cannot be reconciled against its own closing balance,
 * which is the only check that catches a missing page.
 */
export async function readStatement(
  bytes: Uint8Array,
  pack: RegionPack,
): Promise<Result<StatementContents, OperationsError>> {
  const data = Buffer.from(bytes);
  const template = await detectTemplate(data, TEMPLATES);
  if (template === null) {
    return err({
      code: 'unknown_template',
      message: 'Faylning varaq nomlari birorta shablonga mos kelmadi',
    });
  }
  if (template.file !== BANK_STATEMENT_TEMPLATE.file) {
    return err({
      code: 'unknown_template',
      message: `Fayl «${template.file}» shabloniga o'xshaydi, bank ko'chirmasi emas`,
    });
  }

  const { sheets, missing } = await readWorkbook(data, template);
  const problems: Problem[] = [];

  for (const name of missing) {
    const spec = template.sheets.find((candidate) => candidate.name === name);
    if (spec?.required === true) {
      problems.push({
        severity: 'error',
        sheet: name,
        row: null,
        column: null,
        message: {
          uz: `«${name}» varag'i faylda yo'q`,
          ru: `Лист «${name}» отсутствует в файле`,
          en: `Sheet “${name}” is missing from the file`,
        },
      });
    }
  }

  const allowed: Record<string, readonly string[]> = {};
  for (const spec of template.sheets) {
    for (const column of spec.columns) {
      if (column.values?.from === 'pack') {
        allowed[`${spec.name}.${column.key}`] = packValues(pack, column.values.list);
      } else if (column.values?.from === 'literal') {
        allowed[`${spec.name}.${column.key}`] = column.values.values;
      }
    }
  }

  const read = new Map(sheets.map((sheet) => [sheet.spec.name, sheet]));
  const results = new Map<string, ReturnType<typeof validateSheet>>();
  for (const sheet of sheets) {
    const result = validateSheet(sheet.spec, sheet.rows, { allowedValues: allowed });
    results.set(sheet.spec.name, result);
    problems.push(...result.problems);

    const documentColumn = sheet.spec.columns.find((column) => column.key === 'documentNumber');
    if (documentColumn !== undefined) {
      problems.push(
        ...checkDuplicateDocuments(result.rows, sheet.spec.name).map((found) => ({
          ...found,
          column: documentColumn.label.uz,
        })),
      );
    }
  }

  const accountRow = results.get('Hisob')?.rows[0];
  const statement = results.get('Kochirma');
  if (accountRow !== undefined && statement !== undefined) {
    problems.push(...checkStatementBalances(accountRow.values, statement.rows));
  }

  const errors = problems.filter((problem) => problem.severity === 'error');
  if (errors.length > 0) {
    return err({
      code: 'invalid_file',
      message: `Faylda ${String(errors.length)} xato bor; yuklash to'xtatildi`,
      problems,
    });
  }

  // Both sheets are required, so the validator has already refused a file
  // missing either; reading them again here is for the type, not the check.
  if (accountRow === undefined || statement === undefined || read.get('Kochirma') === undefined) {
    return err({ code: 'invalid_file', message: 'Ko‘chirma varaqlari o‘qilmadi', problems });
  }

  const money = (value: string | null): Money | null =>
    value === null ? null : Money.of(value, currency(accountRow.values['currency'] ?? 'USD'));

  const currencyCode = accountRow.values['currency'];
  if (currencyCode === null || currencyCode === undefined) {
    return err({ code: 'invalid_file', message: '«Hisob» varag‘ida valyuta yo‘q', problems });
  }

  const header: StatementHeader = {
    accountName: accountRow.values['accountName'] ?? '',
    accountNumber: text(accountRow.values['accountNumber']),
    currency: currency(currencyCode),
    periodFrom:
      accountRow.values['from'] === null ? null : isoDate(accountRow.values['from'] ?? ''),
    periodTo: accountRow.values['to'] === null ? null : isoDate(accountRow.values['to'] ?? ''),
    openingBalance: money(accountRow.values['openingBalance'] ?? null),
    closingBalance: money(accountRow.values['closingBalance'] ?? null),
  };

  const drafts: CashOperationDraft[] = [];
  for (const row of statement.rows) {
    const receipt = row.values['receipt'] ?? null;
    const payment = row.values['payment'] ?? null;
    // The validator already refused a row carrying both and a row carrying
    // neither has nothing to post.
    const direction: CashDirection | null =
      receipt !== null ? 'in' : payment !== null ? 'out' : null;
    const raw = receipt ?? payment;
    if (direction === null || raw === null) {
      continue;
    }

    drafts.push({
      rowNumber: row.row,
      cashDate: isoDate(row.values['date'] ?? ''),
      direction,
      amount: Money.of(raw, header.currency),
      documentNumber: text(row.values['documentNumber']),
      counterpartyName: text(row.values['counterparty']),
      counterpartyTaxId: text(row.values['counterpartyTaxId']),
      articleName: text(row.values['article']),
      directionName: text(row.values['direction']),
      purpose: text(row.values['purpose']),
      memo: text(row.values['memo']),
    });
  }

  return ok({
    header,
    drafts,
    warnings: problems.filter((problem) => problem.severity === 'warning'),
  });
}
