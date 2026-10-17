import ExcelJS from 'exceljs';
import type { RegionPack } from '@fincore/region-pack-contract';
import type { Language } from '@fincore/shared';
import {
  EXAMPLE_HINT,
  EXAMPLE_KEY,
  EXAMPLE_MARKER,
  type ColumnSpec,
  type SheetSpec,
  type TemplateSpec,
} from './templates/types.js';
import type { RawRow } from './validate.js';

/**
 * Workbooks in and out. The only module here that touches a file format; the
 * contract and the validator either side of it stay pure.
 */

const INK = 'FF16181D';
const MUTED = 'FF878D9A';
const HEADER_BG = 'FFEEEFF2';
const RULE = 'FFDCDEE3';
const REQUIRED = 'FFB4232C';

/** Country-specific lists come from the pack, never from this package (§4). */
export function packValues(pack: RegionPack, list: string): readonly string[] {
  switch (list) {
    case 'legalForms':
      return pack.legalForms.map((form) => form.code);
    case 'taxRegimes':
      return pack.taxRegimes.map((regime) => regime.code);
    case 'currencies':
      return [pack.currency.default, ...pack.currency.common];
    default:
      throw new Error(`region pack has no list named ${list}`);
  }
}

function allowedFor(column: ColumnSpec, pack: RegionPack): readonly string[] | null {
  if (column.values === undefined) return null;
  switch (column.values.from) {
    case 'literal':
      return column.values.values;
    case 'pack':
      return packValues(pack, column.values.list);
    case 'sheet':
      // Filled in by the client on another sheet; no fixed list to offer.
      return null;
  }
}

function writeInstructions(
  book: ExcelJS.Workbook,
  template: TemplateSpec,
  pack: RegionPack,
  language: Language,
): void {
  const sheet = book.addWorksheet("Ko'rsatma", { properties: { tabColor: { argb: 'FF1F4FD8' } } });
  sheet.columns = [{ width: 26 }, { width: 18 }, { width: 12 }, { width: 76 }];

  let row = 1;
  const put = (text: string, options: Partial<ExcelJS.Font> = {}, indent = 0) => {
    const cell = sheet.getCell(row, 1 + indent);
    cell.value = text;
    cell.font = { name: 'Calibri', size: 11, color: { argb: INK }, ...options };
    cell.alignment = { vertical: 'top', wrapText: true };
    row += 1;
  };

  put(template.title[language], { size: 16, bold: true });
  row += 1;
  for (const line of template.intro[language]) {
    sheet.mergeCells(row, 1, row, 4);
    put(`•  ${line}`, { size: 11 });
  }
  row += 1;

  for (const spec of template.sheets) {
    put(`${spec.name} — ${spec.title[language]}`, { size: 13, bold: true });
    sheet.mergeCells(row, 1, row, 4);
    put(spec.purpose[language], { color: { argb: MUTED } });
    put(
      spec.required
        ? { uz: 'Majburiy varaq', ru: 'Обязательный лист', en: 'Required sheet' }[language]
        : { uz: 'Ixtiyoriy varaq', ru: 'Необязательный лист', en: 'Optional sheet' }[language],
      { color: { argb: spec.required ? REQUIRED : MUTED }, italic: true },
    );

    const header = ['Ustun', 'Turi', 'Majburiy', 'Izoh'];
    header.forEach((label, index) => {
      const cell = sheet.getCell(row, index + 1);
      cell.value = label;
      cell.font = { bold: true, size: 10, color: { argb: MUTED } };
      cell.border = { bottom: { style: 'thin', color: { argb: RULE } } };
    });
    row += 1;

    for (const column of spec.columns) {
      const allowed = allowedFor(column, pack);
      const note = column.note[language];
      const list = allowed === null ? '' : ` [${allowed.join(' · ')}]`;
      const values: [string, string, string, string] = [
        column.label[language],
        column.kind,
        column.required ? 'ha' : '',
        (note === '' ? '' : note) + list,
      ];
      values.forEach((value, index) => {
        const cell = sheet.getCell(row, index + 1);
        cell.value = value;
        cell.font = {
          size: 10,
          color: { argb: index === 2 && column.required ? REQUIRED : INK },
          bold: index === 2 && column.required,
        };
        cell.alignment = { vertical: 'top', wrapText: index === 3 };
      });
      row += 1;
    }
    row += 1;
  }
}

function writeDataSheet(
  book: ExcelJS.Workbook,
  spec: SheetSpec,
  pack: RegionPack,
  language: Language,
): void {
  const sheet = book.addWorksheet(spec.name);
  sheet.columns = spec.columns.map((column) => ({ width: column.width ?? 18 }));

  spec.columns.forEach((column, index) => {
    const cell = sheet.getCell(1, index + 1);
    /*
     * A required column is marked with an asterisk and set in red rather than
     * carried in a cell comment. Comments do not survive a round trip through
     * another spreadsheet program — openpyxl rewrites the relationships in a
     * form exceljs then refuses to load — and a client will always open and
     * save the file somewhere. The rules live on the instructions sheet.
     */
    cell.value = column.required ? `${column.label[language]} *` : column.label[language];
    cell.font = {
      bold: true,
      size: 11,
      color: { argb: column.required ? REQUIRED : INK },
    };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } };
    cell.border = { bottom: { style: 'medium', color: { argb: RULE } } };
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
  sheet.getRow(1).height = 30;

  /*
   * Row 2 shows the shape of every column and is skipped on read. The "delete
   * me" marker goes in the cell after the last column rather than over the
   * first example: the first column is usually the one most worth showing.
   */
  spec.columns.forEach((column, index) => {
    const cell = sheet.getCell(2, index + 1);
    cell.value = column.example;
    cell.font = { size: 10, italic: true, color: { argb: MUTED } };
  });
  const marker = sheet.getCell(2, spec.columns.length + 1);
  marker.value = EXAMPLE_HINT[language];
  marker.font = { size: 10, italic: true, bold: true, color: { argb: REQUIRED } };

  // Dropdowns where the list is known, so a typo cannot happen at all.
  spec.columns.forEach((column, index) => {
    const allowed = allowedFor(column, pack);
    if (allowed === null || allowed.length === 0) return;
    const letter = sheet.getColumn(index + 1).letter;
    const formula = `"${allowed.join(',')}"`;
    if (formula.length > 255) return; // Excel's own limit on an inline list.
    for (let row = 3; row <= 400; row += 1) {
      sheet.getCell(`${letter}${String(row)}`).dataValidation = {
        type: 'list',
        allowBlank: !column.required,
        formulae: [formula],
      };
    }
  });

  sheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: spec.columns.length },
  };
}

/** Builds one template workbook. */
export async function buildTemplate(
  template: TemplateSpec,
  pack: RegionPack,
  language: Language = 'uz',
): Promise<ExcelJS.Buffer> {
  const book = new ExcelJS.Workbook();
  book.creator = 'FinCore';
  book.created = new Date('2026-01-01T00:00:00Z');
  writeInstructions(book, template, pack, language);
  for (const spec of template.sheets) {
    writeDataSheet(book, spec, pack, language);
  }
  return book.xlsx.writeBuffer();
}

/**
 * Which template a workbook is, read from the sheets it carries.
 *
 * The file name is not a reliable signal: a client renames the file to
 * something meaningful to them long before they send it back. The sheet names
 * are the contract, so they are what identifies it.
 */
export async function detectTemplate(
  data: ArrayBuffer | Buffer,
  templates: readonly TemplateSpec[],
): Promise<TemplateSpec | null> {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(data as ArrayBuffer);
  const present = new Set(book.worksheets.map((sheet) => sheet.name));

  let best: { template: TemplateSpec; matched: number } | null = null;
  for (const template of templates) {
    const names = template.sheets.map((sheet) => sheet.name);
    const required = template.sheets.filter((sheet) => sheet.required).map((sheet) => sheet.name);
    if (!required.every((name) => present.has(name))) {
      continue;
    }
    const matched = names.filter((name) => present.has(name)).length;
    if (best === null || matched > best.matched) {
      best = { template, matched };
    }
  }
  return best === null ? null : best.template;
}

/**
 * A cell's text. `exceljs` hands back a union — a string, a number, a date, a
 * formula with its result, rich text — and stringifying the object forms gives
 * `[object Object]`, which would silently match nothing.
 */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object' && 'richText' in value) {
    return value.richText.map((part) => part.text).join('');
  }
  if (typeof value === 'object' && 'result' in value) {
    return cellText(value.result);
  }
  if (typeof value === 'object' && 'text' in value) {
    return value.text;
  }
  return '';
}

export interface ReadSheet {
  readonly spec: SheetSpec;
  readonly rows: readonly RawRow[];
}

/**
 * Reads a filled workbook back into rows keyed by the contract, matching
 * columns by their heading so a reordered or extra column does no harm.
 */
export async function readWorkbook(
  data: ArrayBuffer | Buffer,
  template: TemplateSpec,
  language: Language = 'uz',
): Promise<{ sheets: readonly ReadSheet[]; missing: readonly string[] }> {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(data as ArrayBuffer);

  const sheets: ReadSheet[] = [];
  const missing: string[] = [];

  for (const spec of template.sheets) {
    const worksheet = book.getWorksheet(spec.name);
    if (worksheet === undefined) {
      missing.push(spec.name);
      continue;
    }

    const headerRow = worksheet.getRow(1);
    const byColumn = new Map<number, string>();
    headerRow.eachCell((cell, index) => {
      const label = cellText(cell.value).trim();
      // The heading may carry the required marker, and may be in any of the
      // three languages the template ships in.
      const plain = label.replace(/\s*\*$/, '');
      const column = spec.columns.find((candidate) =>
        Object.values(candidate.label).some((name) => name === plain),
      );
      if (column !== undefined) {
        byColumn.set(index, column.key);
      }
    });

    const rows: RawRow[] = [];
    worksheet.eachRow((row, index) => {
      if (index === 1) return;
      const record: Record<string, unknown> = {};
      byColumn.forEach((key, column) => {
        const value = row.getCell(column).value;
        // A formula cell carries both; the result is what was meant.
        record[key] =
          value !== null && typeof value === 'object' && 'result' in value ? value.result : value;
      });
      /*
       * The example row carries its marker in a cell with no heading, so it
       * is found by scanning rather than by column. Marking it here, instead
       * of skipping row 2 by position, keeps the skip correct after the
       * person deletes the example and everything moves up.
       */
      let isExample = false;
      row.eachCell((cell) => {
        if (cellText(cell.value).startsWith(EXAMPLE_MARKER)) {
          isExample = true;
        }
      });
      record[EXAMPLE_KEY] = isExample;
      rows.push(record as RawRow);
    });

    sheets.push({ spec, rows });
  }

  void language;
  return { sheets, missing };
}
