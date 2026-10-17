import { describe, expect, it } from 'vitest';
import { FLOW_TYPES, LANGUAGES } from '@fincore/shared';
import {
  BANK_STATEMENT_TEMPLATE,
  EXAMPLE_KEY,
  EXAMPLE_MARKER,
  TEMPLATES,
  checkDuplicateDocuments,
  checkStatementBalances,
  parseAmount,
  parseDate,
  validateSheet,
  type ParsedRow,
  type RawRow,
  type SheetSpec,
} from '../../src/index.js';

const statementSheet = (name: string): SheetSpec => {
  const sheet = BANK_STATEMENT_TEMPLATE.sheets.find((candidate) => candidate.name === name);
  if (sheet === undefined) throw new Error(`no sheet ${name}`);
  return sheet;
};

describe('parseAmount \u2014 the ways a person writes money', () => {
  const read = (input: string): string | null => {
    const parsed = parseAmount(input);
    return parsed.ok ? parsed.value.toString() : null;
  };

  const readable: readonly [string, string][] = [
    ['12500', '12500'],
    ['12 500,00', '12500'],
    ['12\u202f500,50', '12500.5'],
    ['12,500.75', '12500.75'],
    ['12.500,75', '12500.75'],
    ['1 234 567,8900', '1234567.89'],
    ['-3150,00', '-3150'],
    ['0,0001', '0.0001'],
    ['1 000 000', '1000000'],
  ];

  it.each(readable)('reads %s as %s', (input, expected) => {
    expect(read(input)).toBe(expected);
  });

  const unreadable: readonly string[] = ['', 'salom', '12,50,50', '1.2.3', '12,34.56.78'];

  it.each(unreadable)('refuses %s as unreadable', (input) => {
    const parsed = parseAmount(input);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) throw new Error('expected a refusal');
    expect(parsed.reason).toBe('unreadable');
  });

  it('refuses a number that reads two ways rather than picking one', () => {
    // Twelve and a half, or twelve thousand five hundred \u2014 a thousand times
    // apart. Guessing here is how an importer loses a client's money.
    for (const input of ['12,500', '12.500', '1,000']) {
      const parsed = parseAmount(input);
      expect(parsed.ok, input).toBe(false);
      if (parsed.ok) throw new Error('expected a refusal');
      expect(parsed.reason, input).toBe('ambiguous');
    }
  });

  it('is not confused by a grouped number that also has decimals', () => {
    expect(read('1 000,500')).toBe('1000.5');
    expect(read('1,000.500')).toBe('1000.5');
  });

  it('keeps every digit a numeric(20,4) column can hold', () => {
    const parsed = parseAmount('99999999999999.9999');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error('expected a number');
    expect(parsed.value.toFixed(4)).toBe('99999999999999.9999');
  });
});

describe('parseDate', () => {
  it('reads the ISO form the template asks for', () => {
    expect(parseDate('2026-01-09')).toBe('2026-01-09');
  });

  it('reads the dotted form a local spreadsheet prints', () => {
    expect(parseDate('09.01.2026')).toBe('2026-01-09');
    expect(parseDate('09/01/2026')).toBe('2026-01-09');
  });

  it('refuses what it cannot be sure of', () => {
    // Written out, ambiguous, or simply not a date: better to ask than guess.
    expect(parseDate('14-yanvar')).toBeNull();
    expect(parseDate('2026-13-01')).toBeNull();
    expect(parseDate('')).toBeNull();
  });
});

describe('validateSheet', () => {
  const sheet = statementSheet('Kochirma');
  const row = (over: Partial<Record<string, unknown>> = {}): RawRow => ({
    date: '2026-01-09',
    receipt: '100,00',
    ...over,
  });

  it('reports an empty required cell against its own heading', () => {
    const result = validateSheet(sheet, [row({ date: null })]);
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]?.message.uz).toContain('Sana');
    expect(result.problems[0]?.severity).toBe('error');
  });

  it('points at the spreadsheet row number, not the array index', () => {
    const result = validateSheet(sheet, [row(), row({ date: 'kecha' })]);
    // Header on 1, example on 2, so the second data row is 4.
    expect(result.problems[0]?.row).toBe(4);
  });

  it('skips the example row the reader flagged', () => {
    const result = validateSheet(sheet, [{ [EXAMPLE_KEY]: true, date: 'misol' }, row()]);
    expect(result.problems).toEqual([]);
    expect(result.rows).toHaveLength(1);
  });

  it('skips an example row even when only the marker text survives', () => {
    const marked = { date: `${EXAMPLE_MARKER} — o'chiring` } as RawRow;
    expect(validateSheet(sheet, [marked, row()]).rows).toHaveLength(1);
  });

  it('ignores a row left entirely blank', () => {
    const result = validateSheet(sheet, [row(), {}]);
    expect(result.rows).toHaveLength(1);
    expect(result.problems).toEqual([]);
  });

  it('explains an ambiguous amount instead of picking a reading', () => {
    const result = validateSheet(sheet, [row({ receipt: '12,500' })]);
    expect(result.problems[0]?.message.uz).toContain('ikki xil');
  });

  it('warns rather than refuses when an amount is negative', () => {
    const result = validateSheet(sheet, [row({ receipt: '-100,00' })]);
    expect(result.problems[0]?.severity).toBe('warning');
    expect(result.rows[0]?.values['receipt']).toBe('-100.0000');
  });

  it('refuses a value outside a fixed list, and names what is allowed', () => {
    const header = statementSheet('Hisob');
    const result = validateSheet(
      header,
      [
        {
          accountName: 'Bank',
          from: '2026-01-01',
          to: '2026-01-31',
          openingBalance: '0',
          closingBalance: '0',
          currency: 'GBP',
        },
      ],
      { allowedValues: { 'Hisob.currency': ['UZS', 'USD', 'EUR'] } },
    );
    expect(result.problems.some((p) => p.message.uz.includes('GBP'))).toBe(true);
  });

  it('says so when a required sheet arrives empty', () => {
    const result = validateSheet(sheet, []);
    expect(result.problems.some((p) => p.row === null)).toBe(true);
  });

  it('refuses a second row on a sheet that holds one record', () => {
    const header = statementSheet('Hisob');
    const one = {
      accountName: 'Bank',
      from: '2026-01-01',
      to: '2026-01-31',
      openingBalance: '0',
      closingBalance: '0',
      currency: 'USD',
    } as RawRow;
    const result = validateSheet(header, [one, one]);
    expect(result.problems.some((p) => p.message.uz.includes('bitta qator'))).toBe(true);
  });

  it('normalises a real Excel date cell', () => {
    const result = validateSheet(sheet, [row({ date: new Date('2026-03-04T00:00:00Z') })]);
    expect(result.rows[0]?.values['date']).toBe('2026-03-04');
  });
});

describe('checkStatementBalances — what the opening and closing figures are for', () => {
  const rows = (...pairs: readonly (readonly [string | null, string | null])[]): ParsedRow[] =>
    pairs.map(([receipt, payment], index) => ({
      row: index + 3,
      values: { receipt, payment },
    }));

  const header = (opening: string, closing: string) => ({
    openingBalance: opening,
    closingBalance: closing,
  });

  it('passes when the rows explain the distance between the balances', () => {
    expect(
      checkStatementBalances(header('84000', '92650'), rows(['12500', null], [null, '3850'])),
    ).toEqual([]);
  });

  it('catches a statement missing a page, and says by how much', () => {
    const problems = checkStatementBalances(header('84000', '102450'), rows(['12500', null]));
    expect(problems).toHaveLength(1);
    expect(problems[0]?.message.uz).toContain('5950.00');
  });

  it('refuses a row that is both a receipt and a payment', () => {
    const problems = checkStatementBalances(header('0', '0'), rows(['100', '100']));
    expect(problems[0]?.message.uz).toContain('ikki qatorga');
  });

  it('reports every ambiguous row, not just the first', () => {
    const problems = checkStatementBalances(header('0', '0'), rows(['100', '100'], ['50', '50']));
    expect(problems).toHaveLength(2);
  });

  it('stays quiet when the bank stated no balances', () => {
    expect(checkStatementBalances({}, rows(['100', null]))).toEqual([]);
  });

  /*
   * The template tells people to write `12 500,00`. Decimal rejects that
   * string outright, so a balance check reading raw cell text would throw on
   * a file filled exactly as instructed.
   */
  it('reads amounts the way the template asks for them', () => {
    expect(
      checkStatementBalances(
        header('84 000,00', '92 650,00'),
        rows(['12 500,00', null], [null, '3 850,00']),
      ),
    ).toEqual([]);
  });

  it('states the gap when grouped figures do not tie', () => {
    // 84 000 + 12 500 = 96 500, but the bank says 96 000.
    const problems = checkStatementBalances(
      header('84 000,00', '96 000,00'),
      rows(['12 500,00', null]),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]?.message.uz).toContain('500.00');
  });

  /*
   * An unreadable figure is already reported against its own column, so the
   * arithmetic stands down instead of reporting the same cell twice — and
   * never by throwing. This goes through `validateSheet` because that is how
   * the figures reach this function: an unreadable cell arrives as `null`,
   * indistinguishable from an empty one except by `row.unreadable`.
   */
  it('stands down on a figure it cannot read', () => {
    const sheet = statementSheet('Kochirma');
    const read = validateSheet(sheet, [
      { date: '2026-01-05', receipt: '12,500' },
      { date: '2026-01-14', payment: '4 200,00' },
    ]);
    expect(read.problems.filter((p) => p.severity === 'error')).toHaveLength(1);
    expect(read.rows[0]?.unreadable).toEqual(['receipt']);
    expect(checkStatementBalances(header('18 400,00', '26 700,00'), read.rows)).toEqual([]);
  });

  it('still states the gap once every figure reads', () => {
    const sheet = statementSheet('Kochirma');
    const read = validateSheet(sheet, [
      { date: '2026-01-05', receipt: '12 500,00' },
      { date: '2026-01-14', payment: '4 200,00' },
    ]);
    expect(read.problems).toEqual([]);
    const problems = checkStatementBalances(header('18 400,00', '20 700,00'), read.rows);
    expect(problems).toHaveLength(1);
    expect(problems[0]?.message.uz).toContain('6000.00');
  });
});

describe('checkDuplicateDocuments', () => {
  it('points at the row the number first appeared on', () => {
    const problems = checkDuplicateDocuments(
      [
        { row: 3, values: { documentNumber: '000142' } },
        { row: 4, values: { documentNumber: '000143' } },
        { row: 5, values: { documentNumber: '000142' } },
      ],
      'Kochirma',
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]?.row).toBe(5);
    expect(problems[0]?.message.uz).toContain('3-qator');
  });

  it('says nothing about rows with no document number', () => {
    expect(
      checkDuplicateDocuments(
        [
          { row: 3, values: { documentNumber: null } },
          { row: 4, values: { documentNumber: null } },
        ],
        'Kochirma',
      ),
    ).toEqual([]);
  });
});

describe('the templates themselves', () => {
  it('names every column in all three languages', () => {
    for (const template of TEMPLATES) {
      for (const sheet of template.sheets) {
        for (const column of sheet.columns) {
          for (const language of LANGUAGES) {
            expect(column.label[language], `${sheet.name}.${column.key}`).not.toBe('');
          }
        }
      }
    }
  });

  it('writes every instruction in all three languages', () => {
    for (const template of TEMPLATES) {
      for (const language of LANGUAGES) {
        expect(template.intro[language].length).toBeGreaterThan(0);
        for (const sheet of template.sheets) {
          expect(sheet.title[language]).not.toBe('');
          expect(sheet.purpose[language]).not.toBe('');
        }
      }
    }
  });

  it('keeps column keys unique within a sheet', () => {
    for (const template of TEMPLATES) {
      for (const sheet of template.sheets) {
        const keys = sheet.columns.map((column) => column.key);
        expect(new Set(keys).size, sheet.name).toBe(keys.length);
      }
    }
  });

  it('offers the ledger’s own flow types, not a second list of its own', () => {
    const articles = TEMPLATES.flatMap((template) => template.sheets)
      .flatMap((sheet) => sheet.columns)
      .find((column) => column.key === 'flowType');
    expect(articles?.values?.from).toBe('literal');
    if (articles?.values?.from !== 'literal') throw new Error('flow types are not a literal list');
    expect([...articles.values.values].sort()).toEqual([...FLOW_TYPES].sort());
  });

  it('names no country’s legal forms or tax regimes — those come from the pack', () => {
    for (const template of TEMPLATES) {
      for (const sheet of template.sheets) {
        for (const column of sheet.columns) {
          if (column.key === 'legalForm' || column.key === 'taxRegime') {
            expect(column.values?.from, `${sheet.name}.${column.key}`).toBe('pack');
          }
        }
      }
    }
  });

  it('asks for two dates wherever an accrual and a payment can differ (I6)', () => {
    for (const name of ['Sotuv', 'Xarid']) {
      const sheet = TEMPLATES.flatMap((template) => template.sheets).find(
        (candidate) => candidate.name === name,
      );
      const keys = sheet?.columns.map((column) => column.key) ?? [];
      expect(keys, name).toContain('accrualDate');
      expect(keys, name).toContain('paidDate');
    }
  });
});
