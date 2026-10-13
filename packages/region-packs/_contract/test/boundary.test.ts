import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * CLAUDE.md §4: nothing outside `packages/region-packs` may name an Uzbek tax
 * rate, an Uzbek bank, or an Uzbek legal form. Region-specific behaviour
 * resolves through the `RegionPack` interface — violating it is the silent,
 * expensive mistake that turns "expand to the next country" into a rewrite.
 *
 * This is a source scan on purpose: it fails the first time someone crosses the
 * boundary, in the pull request that crosses it, without needing the offending
 * code to be executed.
 */

/** Terms that may only appear inside a region pack, grouped for the message. */
const FORBIDDEN: readonly { readonly reason: string; readonly terms: readonly string[] }[] = [
  {
    reason: 'tax regime code',
    terms: ['aylanma_1', 'aylanma_4', 'qqs_foyda', 'it_park'],
  },
  {
    reason: 'tax term',
    terms: ['QQS', 'JSHDS', 'BHM', 'НДС', 'ЖШДС'],
  },
  {
    reason: 'legal form',
    terms: ['MCHJ', 'YaTT', 'XK'],
  },
  {
    reason: 'bank name',
    terms: [
      'Kapitalbank',
      'Ipoteka Bank',
      'Anor Bank',
      'TBC Bank',
      'Uzum Bank',
      'Hamkorbank',
      'Agrobank',
      'Aloqabank',
      'Turonbank',
      'Trastbank',
      'InFinBank',
      'Asaka Bank',
      'Xalq banki',
      'Orient Finans',
      'Milliy bank',
    ],
  },
  {
    reason: 'country service provider',
    terms: ['didox', 'faktura.uz', 'payme', 'click.uz', 'soliq.uz', 'cbu.uz', 'cbr.ru'],
  },
];

const SCANNED_EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.sql'];
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', 'coverage', '.turbo', '.git', 'docs']);

/** Directories whose contents are allowed to name any of the above. */
const ALLOWED_PREFIXES = [join('packages', 'region-packs')];

async function repoRoot(): Promise<string> {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 10; depth += 1) {
    const entries = await readdir(dir);
    if (entries.includes('pnpm-workspace.yaml')) {
      return dir;
    }
    dir = dirname(dir);
  }
  throw new Error('repository root not found');
}

async function sourceFiles(root: string): Promise<string[]> {
  const found: string[] = [];
  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) {
          await walk(join(dir, entry.name));
        }
        continue;
      }
      if (SCANNED_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
        found.push(join(dir, entry.name));
      }
    }
  }
  await walk(root);
  return found;
}

const SELF = fileURLToPath(import.meta.url);

/**
 * Whole-token match. A plain `includes` would flag `payment_terms_days` for the
 * provider "payme"; the lookarounds also work for Cyrillic terms, which the
 * `\b` escape does not.
 */
function matcher(term: string): RegExp {
  const escaped = term.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
  return new RegExp(`(?<![A-Za-z0-9_])${escaped}(?![A-Za-z0-9_])`, 'i');
}

const PATTERNS = FORBIDDEN.flatMap((group) =>
  group.terms.map((term) => ({ term, reason: group.reason, pattern: matcher(term) })),
);

interface Violation {
  readonly file: string;
  readonly line: number;
  readonly term: string;
  readonly reason: string;
}

describe('region boundary', () => {
  it('keeps Uzbek tax rates, banks and legal forms inside packages/region-packs', async () => {
    const root = await repoRoot();
    const files = (await sourceFiles(root)).filter((file) => file !== SELF);
    expect(files.length).toBeGreaterThan(20);

    const violations: Violation[] = [];
    for (const file of files) {
      const rel = relative(root, file);
      if (ALLOWED_PREFIXES.some((prefix) => rel.startsWith(prefix + sep))) {
        continue;
      }
      const lines = (await readFile(file, 'utf8')).split('\n');
      for (const [index, text] of lines.entries()) {
        for (const { term, reason, pattern } of PATTERNS) {
          if (pattern.test(text)) {
            violations.push({ file: rel, line: index + 1, term, reason });
          }
        }
      }
    }

    // Rendered as strings so a failure names the file, line and term directly.
    expect(violations.map((v) => `${v.file}:${String(v.line)} — ${v.reason} "${v.term}"`)).toEqual(
      [],
    );
  });

  it('actually detects a crossing, so a green run means something', async () => {
    const root = await repoRoot();
    const files = await sourceFiles(root);
    // The pack itself contains the terms; if the scan found none there, the
    // matcher is broken rather than the codebase being clean.
    const packFiles = files.filter((file) =>
      relative(root, file).startsWith(join('packages', 'region-packs') + sep),
    );
    const hits: string[] = [];
    for (const file of packFiles) {
      const content = await readFile(file, 'utf8');
      for (const { term, pattern } of PATTERNS) {
        if (pattern.test(content)) {
          hits.push(term);
        }
      }
    }
    expect(new Set(hits).size).toBeGreaterThanOrEqual(10);
  });
});
