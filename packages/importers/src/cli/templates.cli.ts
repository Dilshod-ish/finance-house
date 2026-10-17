import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { uzRegionPack } from '@fincore/region-pack-uz';
import { LANGUAGES, type Language } from '@fincore/shared';
import { TEMPLATES } from '../templates/index.js';
import { buildTemplate } from '../workbook.js';

const outDir = process.argv[2] ?? 'templates';
const requested = process.argv[3];
const languages: readonly Language[] =
  requested === undefined ? ['uz'] : requested === 'all' ? LANGUAGES : [requested as Language];

await mkdir(outDir, { recursive: true });

for (const language of languages) {
  for (const template of TEMPLATES) {
    const buffer = await buildTemplate(template, uzRegionPack, language);
    const name =
      languages.length > 1 ? `${template.file}.${language}.xlsx` : `${template.file}.xlsx`;
    const path = join(outDir, name);
    await writeFile(path, Buffer.from(buffer));
    process.stdout.write(`${path}\n`);
  }
}
