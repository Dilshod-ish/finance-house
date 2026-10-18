/**
 * Writes the e2e fixture: a real statement workbook, built from the real
 * template, so the browser suite exercises the same path a client's file
 * takes. Checked in alongside the fixture it produces, because a fixture
 * nobody can regenerate is a fixture nobody dares change.
 *
 *   pnpm --filter @fincore/operations fixture <path>
 */
import { writeFile } from 'node:fs/promises';
import { uzRegionPack } from '@fincore/region-pack-uz';
import { statementBytes } from './statement-file.js';

const article =
  uzRegionPack.messages[uzRegionPack.locale.defaultLanguage]['article.svc.revenue.projects'] ?? '';

await writeFile(
  process.argv[2] ?? 'statement.xlsx',
  await statementBytes({
    accountName: 'Company current account',
    currency: 'UZS',
    from: '2026-04-01',
    to: '2026-04-30',
    opening: '0,00',
    closing: '1 500 000,00',
    rows: [
      {
        date: '2026-04-03',
        documentNumber: 'A-1',
        receipt: '1 200 000,00',
        counterparty: 'Northwind Ltd',
        purpose: 'April delivery',
        article,
      },
      {
        date: '2026-04-07',
        documentNumber: 'A-2',
        receipt: '300 000,00',
        counterparty: 'Northwind Ltd',
        purpose: 'unidentified transfer',
      },
    ],
  }),
);
console.log('wrote', process.argv[2]);
