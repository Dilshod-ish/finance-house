/**
 * UI languages. `ru` is first-class, not an afterthought (PRD §4): Russian is
 * still the working language of much of Uzbek business.
 */
export type Language = 'uz' | 'ru' | 'en';

export const LANGUAGES: readonly Language[] = ['uz', 'ru', 'en'];

/**
 * User-facing text is a locale key everywhere — never a localized string in the
 * database (CLAUDE.md §9). Whoever declares a key must translate it into every
 * language in LANGUAGES.
 */
export type Messages = Readonly<Record<Language, Readonly<Record<string, string>>>>;

/**
 * Builds a Messages table from one row per key, in LANGUAGES order. Keeping the
 * translations side by side makes a missing one impossible to overlook.
 */
export function messagesFromRows(
  rows: Readonly<Record<string, readonly [string, string, string]>>,
): Messages {
  const table = (index: 0 | 1 | 2): Record<string, string> =>
    Object.fromEntries(Object.entries(rows).map(([key, values]) => [key, values[index]]));
  return { uz: table(0), ru: table(1), en: table(2) };
}

export interface MissingTranslation {
  readonly language: Language;
  readonly key: string;
}

/** Keys with no translation in some language, and translations nothing uses. */
export function auditMessages(
  messages: Messages,
  keys: readonly string[],
): { readonly missing: MissingTranslation[]; readonly unused: string[] } {
  const missing: MissingTranslation[] = [];
  for (const language of LANGUAGES) {
    const table = messages[language];
    for (const key of keys) {
      if (table[key] === undefined) {
        missing.push({ language, key });
      }
    }
  }
  const declared = new Set(keys);
  const unused = Object.keys(messages.en)
    .filter((key) => !declared.has(key))
    .sort();
  return { missing, unused };
}

/** Deduplicated, sorted, nulls dropped — the key list an audit runs against. */
export function declaredKeys(values: readonly (string | null)[]): string[] {
  return [...new Set(values.filter((value): value is string => value !== null))].sort();
}
