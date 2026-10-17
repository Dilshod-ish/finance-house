import { Decimal, isIsoDate, type IsoDate } from '@fincore/shared';
import { EXAMPLE_KEY, EXAMPLE_MARKER, type ColumnSpec, type SheetSpec } from './templates/types.js';

/**
 * Reading a filled workbook back.
 *
 * Pure: it takes rows that someone else got out of the file and returns either
 * typed values or a list of problems. Nothing here opens a file, and nothing
 * here writes to a ledger — a bad cell has to be a message to the person who
 * filled it in, long before it is a posting.
 */

export type CellValue = string | number | boolean | Date | null | undefined;

/** One row as read from a sheet, keyed by the column's stable key. */
export type RawRow = Readonly<Record<string, CellValue>>;

export type Severity = 'error' | 'warning';

export interface Problem {
  readonly severity: Severity;
  readonly sheet: string;
  /** 1-based, as the spreadsheet numbers it; null for a whole-sheet problem. */
  readonly row: number | null;
  readonly column: string | null;
  readonly message: Readonly<Record<'uz' | 'ru' | 'en', string>>;
}

export interface ParsedRow {
  /** 1-based row number in the sheet, for pointing the person at it. */
  readonly row: number;
  readonly values: Readonly<Record<string, string | null>>;
}

export interface SheetResult {
  readonly sheet: string;
  readonly rows: readonly ParsedRow[];
  readonly problems: readonly Problem[];
}

const problem = (
  severity: Severity,
  sheet: string,
  row: number | null,
  column: string | null,
  uz: string,
  ru: string,
  en: string,
): Problem => ({ severity, sheet, row, column, message: { uz, ru, en } });

/** Excel hands dates back as Date, text as string, numbers as number. */
function asText(value: CellValue): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'boolean') return value ? 'ha' : "yo'q";
  const text = String(value).trim();
  return text === '' ? null : text;
}

/** What a cell said, once it is clear what it said. */
export type AmountResult =
  | { readonly ok: true; readonly value: Decimal }
  /** Not a number at all. */
  | { readonly ok: false; readonly reason: 'unreadable' }
  /** A number, but it could be two different numbers. */
  | { readonly ok: false; readonly reason: 'ambiguous' };

/** Space, no-break space, narrow no-break space, apostrophe: all grouping. */
const GROUPING = /[\s\u00a0\u202f\u2009']/g;

const groupsWell = (digits: string, separator: string): boolean => {
  const parts = digits.split(separator);
  const [first, ...rest] = parts;
  return (
    first !== undefined &&
    first.length >= 1 &&
    first.length <= 3 &&
    rest.every((part) => part.length === 3)
  );
};

/**
 * Money, as a person actually types it.
 *
 * `12 500,00`, `12,500.75`, `12.500,75` and `12500` all read cleanly, because
 * in each the grouping and the decimal mark can be told apart. `12,500`
 * cannot: it is twelve and a half in one convention and twelve thousand five
 * hundred in another, a difference of a thousand times. So it is refused and
 * the person is asked to write it unambiguously, which is the only safe answer
 * when the number is going into a ledger.
 */
export function parseAmount(raw: string): AmountResult {
  const cleaned = raw.replace(GROUPING, '');
  if (cleaned === '' || !/^-?[\d.,]+$/.test(cleaned)) {
    return { ok: false, reason: 'unreadable' };
  }

  const negative = cleaned.startsWith('-');
  const body = negative ? cleaned.slice(1) : cleaned;
  const dots = (body.match(/\./g) ?? []).length;
  const commas = (body.match(/,/g) ?? []).length;

  const decide = (): { whole: string; fraction: string } | null => {
    if (dots === 0 && commas === 0) {
      return { whole: body, fraction: '' };
    }
    if (dots > 0 && commas > 0) {
      // Two different marks: the last one is the decimal, the other groups.
      const decimal = body.lastIndexOf('.') > body.lastIndexOf(',') ? '.' : ',';
      const grouping = decimal === '.' ? ',' : '.';
      const at = body.lastIndexOf(decimal);
      const whole = body.slice(0, at);
      const fraction = body.slice(at + 1);
      if (fraction.includes(grouping) || !groupsWell(whole, grouping)) {
        return null;
      }
      return { whole: whole.split(grouping).join(''), fraction };
    }
    const separator = dots > 0 ? '.' : ',';
    const count = dots > 0 ? dots : commas;
    if (count > 1) {
      // Repeated, so it groups — and then it must group properly.
      return groupsWell(body, separator)
        ? { whole: body.split(separator).join(''), fraction: '' }
        : null;
    }
    const at = body.indexOf(separator);
    const whole = body.slice(0, at);
    const fraction = body.slice(at + 1);
    if (fraction.length === 3 && whole.length <= 3) {
      // `12,500` — grouping or decimals, and no way to tell which.
      return null;
    }
    return { whole, fraction };
  };

  const parts = decide();
  if (parts === null) {
    const singleSeparator = dots + commas === 1;
    return { ok: false, reason: singleSeparator ? 'ambiguous' : 'unreadable' };
  }
  if (!/^\d*$/.test(parts.whole) || !/^\d*$/.test(parts.fraction)) {
    return { ok: false, reason: 'unreadable' };
  }

  const text =
    `${negative ? '-' : ''}${parts.whole === '' ? '0' : parts.whole}` +
    (parts.fraction === '' ? '' : `.${parts.fraction}`);
  const value = new Decimal(text);
  return value.isFinite() ? { ok: true, value } : { ok: false, reason: 'unreadable' };
}

export function parseDate(raw: string): IsoDate | null {
  const text = raw.trim();
  // `09.01.2026` and `09/01/2026` are how a spreadsheet in this region prints.
  const dotted = /^(?<day>\d{2})[./](?<month>\d{2})[./](?<year>\d{4})$/.exec(text);
  const parts = dotted?.groups;
  const normalized =
    parts === undefined
      ? text
      : `${parts['year'] ?? ''}-${parts['month'] ?? ''}-${parts['day'] ?? ''}`;
  return isIsoDate(normalized) ? normalized : null;
}

function checkCell(
  sheet: SheetSpec,
  column: ColumnSpec,
  rowNumber: number,
  raw: string | null,
  allowed: readonly string[] | null,
): { value: string | null; problems: Problem[] } {
  const where = column.label.uz;
  if (raw === null) {
    if (column.required) {
      return {
        value: null,
        problems: [
          problem(
            'error',
            sheet.name,
            rowNumber,
            where,
            `«${where}» to'ldirilmagan`,
            `«${where}» не заполнено`,
            `“${where}” is empty`,
          ),
        ],
      };
    }
    return { value: null, problems: [] };
  }

  switch (column.kind) {
    case 'date': {
      const parsed = parseDate(raw);
      return parsed === null
        ? {
            value: null,
            problems: [
              problem(
                'error',
                sheet.name,
                rowNumber,
                where,
                `«${where}»: sana tushunarsiz — ${raw}. YYYY-MM-DD yozing.`,
                `«${where}»: непонятная дата — ${raw}. Пишите YYYY-MM-DD.`,
                `“${where}”: cannot read the date ${raw}. Write YYYY-MM-DD.`,
              ),
            ],
          }
        : { value: parsed, problems: [] };
    }
    case 'money':
    case 'decimal': {
      const parsed = parseAmount(raw);
      if (!parsed.ok) {
        return parsed.reason === 'ambiguous'
          ? {
              value: null,
              problems: [
                problem(
                  'error',
                  sheet.name,
                  rowNumber,
                  where,
                  `«${where}»: «${raw}» ikki xil o'qiladi. ` +
                    `Minglikni bo'sh joy bilan, kasrni vergul bilan yozing: 12 500,00`,
                  `«${where}»: «${raw}» читается двояко. ` +
                    `Тысячи — пробелом, дробную часть — запятой: 12 500,00`,
                  `“${where}”: “${raw}” reads two ways. ` +
                    `Group with a space and mark decimals with a comma: 12 500,00`,
                ),
              ],
            }
          : {
              value: null,
              problems: [
                problem(
                  'error',
                  sheet.name,
                  rowNumber,
                  where,
                  `«${where}»: son tushunarsiz — ${raw}`,
                  `«${where}»: непонятное число — ${raw}`,
                  `“${where}”: cannot read the number ${raw}`,
                ),
              ],
            };
      }
      if (column.kind === 'money' && parsed.value.isNegative()) {
        return {
          value: parsed.value.toFixed(4),
          problems: [
            problem(
              'warning',
              sheet.name,
              rowNumber,
              where,
              `«${where}» manfiy. Summalar musbat bo'ladi — yo'nalishni ustun belgilaydi.`,
              `«${where}» отрицательная. Суммы положительные — направление задаёт колонка.`,
              `“${where}” is negative. Amounts are positive; the column says the direction.`,
            ),
          ],
        };
      }
      return { value: parsed.value.toFixed(column.kind === 'money' ? 4 : 10), problems: [] };
    }
    case 'integer': {
      if (!/^\d+$/.test(raw)) {
        return {
          value: null,
          problems: [
            problem(
              'error',
              sheet.name,
              rowNumber,
              where,
              `«${where}»: butun son kutilgan — ${raw}`,
              `«${where}»: ожидается целое число — ${raw}`,
              `“${where}”: a whole number was expected, got ${raw}`,
            ),
          ],
        };
      }
      return { value: raw, problems: [] };
    }
    case 'boolean': {
      const yes = ['ha', 'да', 'yes', 'true', '1'];
      const no = ["yo'q", 'yoq', 'нет', 'no', 'false', '0'];
      const lower = raw.toLowerCase();
      if (yes.includes(lower)) return { value: 'ha', problems: [] };
      if (no.includes(lower)) return { value: "yo'q", problems: [] };
      return {
        value: null,
        problems: [
          problem(
            'error',
            sheet.name,
            rowNumber,
            where,
            `«${where}»: «ha» yoki «yo'q» kutilgan — ${raw}`,
            `«${where}»: ожидается «ha» или «yo'q» — ${raw}`,
            `“${where}”: expected “ha” or “yo'q”, got ${raw}`,
          ),
        ],
      };
    }
    case 'enum': {
      if (allowed !== null && allowed.length > 0 && !allowed.includes(raw)) {
        return {
          value: raw,
          problems: [
            problem(
              'error',
              sheet.name,
              rowNumber,
              where,
              `«${where}»: «${raw}» ro'yxatda yo'q. Mumkin: ${allowed.join(', ')}`,
              `«${where}»: «${raw}» нет в списке. Допустимо: ${allowed.join(', ')}`,
              `“${where}”: “${raw}” is not in the list. Allowed: ${allowed.join(', ')}`,
            ),
          ],
        };
      }
      return { value: raw, problems: [] };
    }
    case 'text':
      return { value: raw, problems: [] };
  }
}

export interface ValidateOptions {
  /** Enum values that only the caller can know — pack lists, other sheets. */
  readonly allowedValues?: Readonly<Record<string, readonly string[]>>;
}

/** Reads one sheet against its spec. Rows carrying the example are skipped. */
export function validateSheet(
  sheet: SheetSpec,
  rows: readonly RawRow[],
  options: ValidateOptions = {},
): SheetResult {
  const problems: Problem[] = [];
  const parsed: ParsedRow[] = [];

  /*
   * Two ways a row says it is the example: the reader flagged it, or a cell
   * still carries the marker because the person edited around it. Either is
   * enough — an example row posted as data would be a fictitious entry.
   */
  const dataRows = rows.filter(
    (row) =>
      row[EXAMPLE_KEY] !== true &&
      !sheet.columns.some((column) => asText(row[column.key])?.startsWith(EXAMPLE_MARKER)),
  );

  const filled = dataRows.filter((row) =>
    sheet.columns.some((column) => asText(row[column.key]) !== null),
  );

  if (sheet.required && filled.length === 0) {
    problems.push(
      problem(
        'error',
        sheet.name,
        null,
        null,
        `«${sheet.name}» varag'i bo'sh, lekin u majburiy`,
        `Лист «${sheet.name}» пуст, а он обязателен`,
        `Sheet “${sheet.name}” is empty but required`,
      ),
    );
  }
  if (sheet.singleRow && filled.length > 1) {
    problems.push(
      problem(
        'error',
        sheet.name,
        null,
        null,
        `«${sheet.name}» varag'ida bitta qator bo'lishi kerak, ${filled.length} ta bor`,
        `На листе «${sheet.name}» должна быть одна строка, найдено ${filled.length}`,
        `Sheet “${sheet.name}” takes one row; found ${filled.length}`,
      ),
    );
  }

  filled.forEach((row, index) => {
    // Header on row 1, example on row 2, so the first data row is 3.
    const rowNumber = index + 3;
    const values: Record<string, string | null> = {};
    for (const column of sheet.columns) {
      const allowed = options.allowedValues?.[`${sheet.name}.${column.key}`] ?? null;
      const result = checkCell(sheet, column, rowNumber, asText(row[column.key]), allowed);
      values[column.key] = result.value;
      problems.push(...result.problems);
    }
    parsed.push({ row: rowNumber, values });
  });

  return { sheet: sheet.name, rows: parsed, problems };
}

/**
 * The bank statement's own check: the rows must explain the distance between
 * the two balances the bank itself stated.
 *
 * This is the whole reason the header asks for them. A statement that is
 * missing a page still looks perfectly well-formed row by row; only the total
 * gives it away, and a ledger loaded from a partial statement is wrong in a
 * way nobody notices for months.
 */
export function checkStatementBalances(
  header: Readonly<Record<string, string | null>>,
  rows: readonly ParsedRow[],
  sheetName = 'Kochirma',
): Problem[] {
  const opening = header['openingBalance'] ?? null;
  const closing = header['closingBalance'] ?? null;
  if (opening === null || closing === null) {
    return [];
  }

  let receipts = new Decimal(0);
  let payments = new Decimal(0);
  const twoSided: Problem[] = [];

  for (const row of rows) {
    const inbound = row.values['receipt'];
    const outbound = row.values['payment'];
    if (inbound !== null && inbound !== undefined) receipts = receipts.plus(inbound);
    if (outbound !== null && outbound !== undefined) payments = payments.plus(outbound);
    if (
      inbound !== null &&
      inbound !== undefined &&
      outbound !== null &&
      outbound !== undefined &&
      !new Decimal(inbound).isZero() &&
      !new Decimal(outbound).isZero()
    ) {
      twoSided.push(
        problem(
          'error',
          sheetName,
          row.row,
          null,
          'Bitta qatorda ham kirim, ham chiqim bor. Ularni ikki qatorga ajrating.',
          'В одной строке и приход, и расход. Разделите на две строки.',
          'One row carries both a receipt and a payment. Split it in two.',
        ),
      );
    }
  }

  /*
   * Every ambiguous row, then stop. With a row that is both a receipt and a
   * payment the totals mean nothing, so adding "the rows do not reach the
   * balance" on top would be noise pointing at the wrong thing.
   */
  if (twoSided.length > 0) {
    return twoSided;
  }

  const expected = new Decimal(opening).plus(receipts).minus(payments);
  const actual = new Decimal(closing);
  const gap = expected.minus(actual);
  if (gap.isZero()) {
    return [];
  }

  return [
    problem(
      'error',
      sheetName,
      null,
      null,
      `Qatorlar qoldiqqa to'g'ri kelmayapti. ${opening} + ${receipts.toFixed(2)} − ` +
        `${payments.toFixed(2)} = ${expected.toFixed(2)}, lekin yakuniy qoldiq ${closing}. ` +
        `Farq ${gap.toFixed(2)} — ko'chirma to'liq emas.`,
      `Строки не сходятся с остатком. ${opening} + ${receipts.toFixed(2)} − ` +
        `${payments.toFixed(2)} = ${expected.toFixed(2)}, а конечный остаток ${closing}. ` +
        `Разница ${gap.toFixed(2)} — выписка неполная.`,
      `The rows do not reach the stated balance. ${opening} + ${receipts.toFixed(2)} − ` +
        `${payments.toFixed(2)} = ${expected.toFixed(2)}, but closing is ${closing}. ` +
        `Out by ${gap.toFixed(2)}: the statement is incomplete.`,
    ),
  ];
}

/** Duplicate document numbers inside one file, which is a double paste. */
export function checkDuplicateDocuments(
  rows: readonly ParsedRow[],
  sheetName: string,
  key = 'documentNumber',
): Problem[] {
  const seen = new Map<string, number>();
  const problems: Problem[] = [];
  for (const row of rows) {
    const value = row.values[key];
    if (value === null || value === undefined) continue;
    const first = seen.get(value);
    if (first === undefined) {
      seen.set(value, row.row);
      continue;
    }
    problems.push(
      problem(
        'warning',
        sheetName,
        row.row,
        key,
        `Hujjat raqami «${value}» ${String(first)}-qatorda ham bor`,
        `Номер документа «${value}» уже есть в строке ${String(first)}`,
        `Document number “${value}” also appears on row ${String(first)}`,
      ),
    );
  }
  return problems;
}
