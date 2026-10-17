import { describe, expect, it } from 'vitest';
import { uzRegionPack } from '@fincore/region-pack-uz';
import { BANK_STATEMENT_TEMPLATE, TEMPLATES } from '../../src/templates/index.js';
import type { ColumnSpec } from '../../src/templates/types.js';
import { exampleFor, packValues } from '../../src/workbook.js';
import { checkStatementBalances, validateSheet, type RawRow } from '../../src/validate.js';

/**
 * The NAMUNA row is the only instruction most people will read. If it breaks
 * a rule the validator enforces, everyone who copies it inherits the error —
 * so every template's own example set has to pass its own validator.
 */

/** The example values as a sheet row. An empty example means an empty cell. */
const exampleRow = (columns: readonly ColumnSpec[]): RawRow =>
  Object.fromEntries(
    columns.map((column) => {
      const example = exampleFor(column, uzRegionPack);
      return [column.key, example === '' ? null : example];
    }),
  );

/** Mirrors validate.cli.ts: pack and literal lists, nothing else is knowable. */
const allowedValues = (
  sheets: readonly { name: string; columns: readonly { key: string; values?: unknown }[] }[],
): Record<string, readonly string[]> => {
  const allowed: Record<string, readonly string[]> = {};
  for (const sheet of sheets) {
    for (const column of sheet.columns) {
      const source = column.values as
        { from: string; list: string; values: readonly string[] } | undefined;
      if (source?.from === 'pack') {
        allowed[`${sheet.name}.${column.key}`] = packValues(uzRegionPack, source.list);
      } else if (source?.from === 'literal') {
        allowed[`${sheet.name}.${column.key}`] = source.values;
      }
    }
  }
  return allowed;
};

describe.each(TEMPLATES.map((template) => [template.file, template] as const))(
  '%s example row',
  (_file, template) => {
    const allowed = allowedValues(template.sheets);

    it.each(template.sheets.map((sheet) => [sheet.name, sheet] as const))(
      '%s validates clean',
      (_name, sheet) => {
        const result = validateSheet(sheet, [exampleRow(sheet.columns)], {
          allowedValues: allowed,
        });
        expect(result.problems).toEqual([]);
      },
    );

    it.each(template.sheets.map((sheet) => [sheet.name, sheet] as const))(
      '%s fills every required column',
      (_name, sheet) => {
        const empty = sheet.columns.filter(
          (column) => column.required && exampleFor(column, uzRegionPack).trim() === '',
        );
        expect(empty.map((column) => column.key)).toEqual([]);
      },
    );
  },
);

it('bank statement example balances', () => {
  const [account, statement] = BANK_STATEMENT_TEMPLATE.sheets;
  if (account === undefined || statement === undefined) {
    throw new Error('the bank statement template lost a sheet');
  }
  const cells = (columns: readonly ColumnSpec[]): Record<string, string | null> =>
    Object.fromEntries(
      columns.map((column) => {
        const example = exampleFor(column, uzRegionPack);
        return [column.key, example === '' ? null : example];
      }),
    );
  const header = cells(account.columns);
  const rows = [{ row: 3, values: cells(statement.columns) }];
  expect(checkStatementBalances(header, rows, statement.name)).toEqual([]);
});
