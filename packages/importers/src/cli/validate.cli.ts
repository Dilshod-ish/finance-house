import { readFile } from 'node:fs/promises';
import { uzRegionPack } from '@fincore/region-pack-uz';
import { templateByFile, TEMPLATES } from '../templates/index.js';
import { detectTemplate, packValues, readWorkbook } from '../workbook.js';
import {
  checkDuplicateDocuments,
  checkStatementBalances,
  validateSheet,
  type Problem,
} from '../validate.js';

const file = process.argv[2];
if (file === undefined) {
  process.stderr.write(`usage: validate <file.xlsx> [${TEMPLATES.map((t) => t.file).join('|')}]\n`);
  process.exit(2);
}

const data = await readFile(file);
const named = process.argv[3];
// Named on the command line, otherwise read from the sheets the file carries.
const template =
  named === undefined ? await detectTemplate(data, TEMPLATES) : templateByFile(named);
if (template === null) {
  process.stderr.write(
    `${file}: bu qaysi shablon ekanini aniqlab bo'lmadi. ` +
      `Varaq nomlari mos kelmayapti. Shablonni ko'rsating: ` +
      `${TEMPLATES.map((t) => t.file).join(' | ')}\n`,
  );
  process.exit(2);
}
process.stdout.write(`shablon: ${template.file}\n\n`);
const { sheets, missing } = await readWorkbook(data, template);

const allowed: Record<string, readonly string[]> = {};
for (const spec of template.sheets) {
  for (const column of spec.columns) {
    if (column.values?.from === 'pack') {
      allowed[`${spec.name}.${column.key}`] = packValues(uzRegionPack, column.values.list);
    } else if (column.values?.from === 'literal') {
      allowed[`${spec.name}.${column.key}`] = column.values.values;
    }
  }
}

const problems: Problem[] = [];
const parsed = new Map<string, ReturnType<typeof validateSheet>>();

for (const sheetName of missing) {
  const spec = template.sheets.find((candidate) => candidate.name === sheetName);
  if (spec?.required === true) {
    problems.push({
      severity: 'error',
      sheet: sheetName,
      row: null,
      column: null,
      message: {
        uz: `«${sheetName}» varag'i faylda yo'q`,
        ru: `Лист «${sheetName}» отсутствует в файле`,
        en: `Sheet “${sheetName}” is missing from the file`,
      },
    });
  }
}

for (const { spec, rows } of sheets) {
  const result = validateSheet(spec, rows, { allowedValues: allowed });
  parsed.set(spec.name, result);
  problems.push(...result.problems);
  const documentColumn = spec.columns.find((column) => column.key === 'documentNumber');
  if (documentColumn !== undefined) {
    problems.push(
      ...checkDuplicateDocuments(result.rows, spec.name).map((found) => ({
        ...found,
        column: documentColumn.label.uz,
      })),
    );
  }
}

// The bank statement owes one more thing: its rows must explain its balances.
const header = parsed.get('Hisob')?.rows[0];
const statement = parsed.get('Kochirma');
if (header !== undefined && statement !== undefined) {
  problems.push(...checkStatementBalances(header.values, statement.rows));
}

const errors = problems.filter((p) => p.severity === 'error');
const warnings = problems.filter((p) => p.severity === 'warning');

for (const p of [...errors, ...warnings]) {
  const at = [p.sheet, p.row === null ? null : `${String(p.row)}-qator`, p.column]
    .filter((part) => part !== null)
    .join(' · ');
  const mark = p.severity === 'error' ? 'XATO ' : 'ogoh ';
  process.stdout.write(`${mark} ${at.padEnd(34)} ${p.message.uz}\n`);
}

let rowCount = 0;
parsed.forEach((result) => {
  rowCount += result.rows.length;
});
process.stdout.write(
  `\n${String(rowCount)} qator o'qildi · ${String(errors.length)} xato · ${String(warnings.length)} ogohlantirish\n`,
);
process.exit(errors.length > 0 ? 1 : 0);
