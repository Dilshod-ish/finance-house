import { LANGUAGES, type Language, type Messages } from './locale.js';

/** Every `*Key` a pack declares, so the completeness check has one source. */
export function declaredKeys(values: readonly (string | null)[]): string[] {
  return [...new Set(values.filter((value): value is string => value !== null))].sort();
}

export interface MissingTranslation {
  readonly language: Language;
  readonly key: string;
}

/** Keys with no translation in some language, and keys nothing declares. */
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
