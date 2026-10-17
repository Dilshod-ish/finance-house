import type { ColumnSpec, EnumSource } from './types.js';

/** Builders, so a column reads as one line and nothing is forgotten. */

type Labels = readonly [uz: string, ru: string, en: string];

const l = ([uz, ru, en]: Labels) => ({ uz, ru, en });

export interface ColumnOptions {
  readonly required?: boolean;
  readonly values?: EnumSource;
  readonly width?: number;
}

export function column(
  key: string,
  label: Labels,
  kind: ColumnSpec['kind'],
  example: string,
  note: Labels,
  options: ColumnOptions = {},
): ColumnSpec {
  return {
    key,
    label: l(label),
    kind,
    required: options.required ?? false,
    example,
    note: l(note),
    ...(options.values === undefined ? {} : { values: options.values }),
    ...(options.width === undefined ? {} : { width: options.width }),
  };
}

export const required = (options: ColumnOptions = {}): ColumnOptions => ({
  ...options,
  required: true,
});

export const oneOf = (...values: readonly string[]): EnumSource => ({
  from: 'literal',
  values,
});

export const fromPack = (list: 'legalForms' | 'taxRegimes' | 'currencies'): EnumSource => ({
  from: 'pack',
  list,
});

export const fromSheet = (sheet: string, col: string): EnumSource => ({
  from: 'sheet',
  sheet,
  column: col,
});

/* ---- Columns that recur across sheets ---------------------------------- */

export const amountColumn = (
  key: string,
  label: Labels,
  note: Labels,
  options: ColumnOptions = {},
): ColumnSpec => column(key, label, 'money', '12 500,00', note, { width: 16, ...options });

export const currencyColumn = (options: ColumnOptions = {}): ColumnSpec =>
  column(
    'currency',
    ['Valyuta', 'Валюта', 'Currency'],
    'enum',
    'USD',
    [
      'Operatsiya valyutasi. Hisobot valyutasi emas — o‘girishni tizim o‘zi qiladi.',
      'Валюта операции. Не валюта отчёта — пересчёт система делает сама.',
      'The currency of the transaction, not of the report. Conversion is ours.',
    ],
    { values: fromPack('currencies'), width: 10, required: true, ...options },
  );

export const counterpartyColumn = (options: ColumnOptions = {}): ColumnSpec =>
  column(
    'counterparty',
    ['Kontragent', 'Контрагент', 'Counterparty'],
    'text',
    'Aurora Freight BV',
    [
      'Kim bilan. Nomi «Kontragentlar» varag‘idagi bilan bir xil bo‘lsin.',
      'С кем. Название должно совпадать с листом «Контрагенты».',
      'Who with. Spell it the same as on the Counterparties sheet.',
    ],
    { width: 26, ...options },
  );

export const articleColumn = (options: ColumnOptions = {}): ColumnSpec =>
  column(
    'article',
    ['Modda', 'Статья', 'Article'],
    'text',
    'Loyihalardan tushum',
    [
      'Boshqaruv moddasi. Bo‘sh qoldirsangiz, operatsiya «taqsimlanmagan» bo‘lib turadi va hisobotda ko‘rinadi.',
      'Управленческая статья. Пустое — операция останется «нераспределённой» и будет видна в отчёте.',
      'The management article. Leave it empty and the operation stays unassigned, and visibly so.',
    ],
    { width: 26, ...options },
  );

export const directionColumn = (options: ColumnOptions = {}): ColumnSpec =>
  column(
    'direction',
    ['Yo‘nalish', 'Направление', 'Direction'],
    'text',
    'Integratsiya loyihalari',
    [
      'Biznes yo‘nalishi yoki obyekt. Ixtiyoriy.',
      'Направление бизнеса или объект. Необязательно.',
      'The business line or site. Optional.',
    ],
    { width: 22, ...options },
  );

export const noteColumn = (): ColumnSpec =>
  column(
    'memo',
    ['Izoh', 'Комментарий', 'Note'],
    'text',
    '',
    [
      'Ixtiyoriy. Hisobotda drill-down oynasida ko‘rinadi.',
      'Необязательно. Видно в окне детализации отчёта.',
      'Optional. It shows in the report’s drill-down panel.',
    ],
    { width: 30 },
  );
