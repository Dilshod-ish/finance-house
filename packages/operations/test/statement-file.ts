import ExcelJS from 'exceljs';
import { BANK_STATEMENT_TEMPLATE, buildTemplate } from '@fincore/importers';
import { uzRegionPack } from '@fincore/region-pack-uz';

export interface StatementRow {
  readonly date: string;
  readonly documentNumber?: string;
  readonly receipt?: string;
  readonly payment?: string;
  readonly counterparty?: string;
  readonly purpose?: string;
  readonly article?: string;
  readonly direction?: string;
}

export interface StatementFile {
  readonly accountName: string;
  readonly currency: string;
  readonly from: string;
  readonly to: string;
  readonly opening: string;
  readonly closing: string;
  readonly rows: readonly StatementRow[];
}

/**
 * Fills the real generated template rather than hand-building a workbook: a
 * test that writes its own layout would keep passing after the template moved,
 * and the whole point of this path is that one declaration drives both ends.
 */
export async function statementBytes(file: StatementFile): Promise<Uint8Array> {
  const blank = await buildTemplate(BANK_STATEMENT_TEMPLATE, uzRegionPack);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(blank);

  const account = book.getWorksheet('Hisob');
  const statement = book.getWorksheet('Kochirma');
  if (account === undefined || statement === undefined) {
    throw new Error('the bank statement template lost a sheet');
  }

  // Header on row 1, the NAMUNA example on row 2, data from row 3.
  const header = [
    file.accountName,
    '2020 8000 1234 5678 901',
    'Meridian Bank',
    file.currency,
    file.from,
    file.to,
    file.opening,
    file.closing,
  ];
  header.forEach((value, index) => {
    account.getCell(3, index + 1).value = value;
  });

  file.rows.forEach((row, index) => {
    const cells = [
      row.date,
      row.documentNumber ?? '',
      row.receipt ?? '',
      row.payment ?? '',
      row.counterparty ?? '',
      '',
      row.purpose ?? '',
      row.article ?? '',
      row.direction ?? '',
      '',
    ];
    cells.forEach((value, column) => {
      statement.getCell(index + 3, column + 1).value = value;
    });
  });

  const out = await book.xlsx.writeBuffer();
  return new Uint8Array(out);
}
