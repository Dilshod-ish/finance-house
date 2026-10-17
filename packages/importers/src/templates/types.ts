import type { Language } from '@fincore/shared';

/**
 * The column contract for every file FinCore accepts.
 *
 * It is declared once, here, and used for both halves of the job: the
 * workbooks handed to a client are generated from it, and the validator that
 * reads a filled workbook back checks against it. Two copies of a column list
 * drift within a month — one copy cannot.
 */

export type ColumnKind =
  /** Free text. */
  | 'text'
  /** `YYYY-MM-DD`, or a real Excel date cell. */
  | 'date'
  /** An amount. Always positive; direction is a separate column. */
  | 'money'
  /** A rate or a percentage — more decimals than money. */
  | 'decimal'
  /** A whole number. */
  | 'integer'
  /** One of a fixed list. */
  | 'enum'
  /** `ha` / `yo'q`. */
  | 'boolean';

/**
 * Where an enum's allowed values come from. Anything country-specific is
 * resolved from the region pack at generation time — a legal form or a tax
 * regime must never be written into this package (CLAUDE.md §4).
 */
export type EnumSource =
  | { readonly from: 'literal'; readonly values: readonly string[] }
  | { readonly from: 'pack'; readonly list: 'legalForms' | 'taxRegimes' | 'currencies' }
  /** Filled by the client on another sheet of the same workbook. */
  | { readonly from: 'sheet'; readonly sheet: string; readonly column: string };

export interface ColumnSpec {
  /** Stable key the validator uses. Never shown to the person filling it in. */
  readonly key: string;
  /** Column heading, per language. The Uzbek one is what the file carries. */
  readonly label: Readonly<Record<Language, string>>;
  readonly kind: ColumnKind;
  readonly required: boolean;
  readonly values?: EnumSource;
  /** Goes in the example row, so the expected shape is visible in the file. */
  readonly example: string;
  /** One line in the instructions sheet. */
  readonly note: Readonly<Record<Language, string>>;
  readonly width?: number;
}

export interface SheetSpec {
  /** Worksheet name. Also how the validator finds it. */
  readonly name: string;
  readonly title: Readonly<Record<Language, string>>;
  readonly purpose: Readonly<Record<Language, string>>;
  /** A single-row sheet holds one record (a company, a statement header). */
  readonly singleRow: boolean;
  readonly required: boolean;
  readonly columns: readonly ColumnSpec[];
}

export interface TemplateSpec {
  /** File name without the extension. */
  readonly file: string;
  readonly title: Readonly<Record<Language, string>>;
  readonly intro: Readonly<Record<Language, readonly string[]>>;
  readonly sheets: readonly SheetSpec[];
}

/** The row that shows the expected shape, and that the validator ignores. */
export const EXAMPLE_MARKER = 'NAMUNA';

/** Where the reader records that a row was the example, not data. */
export const EXAMPLE_KEY = '__example';

export const EXAMPLE_HINT: Readonly<Record<Language, string>> = {
  uz: `${EXAMPLE_MARKER} — bu qatorni o'chiring`,
  ru: `${EXAMPLE_MARKER} — удалите эту строку`,
  en: `${EXAMPLE_MARKER} — delete this row`,
};
