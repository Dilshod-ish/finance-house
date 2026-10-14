import type { Language, Messages } from '@fincore/shared';

/** Looks a key up, or returns the key itself so a gap is visible, not blank. */
export type Translate = (key: string, values?: Readonly<Record<string, string>>) => string;

/**
 * Builds a lookup over one or more message tables — the UI's own chrome and the
 * report labels from `@fincore/reports`. A missing key renders as the key, in
 * brackets: silently blank text is how a missing translation ships.
 */
export function createTranslate(language: Language, ...tables: readonly Messages[]): Translate {
  return (key, values) => {
    for (const table of tables) {
      const text = table[language][key];
      if (text !== undefined) {
        return values === undefined ? text : interpolate(text, values);
      }
    }
    return `[${key}]`;
  };
}

function interpolate(text: string, values: Readonly<Record<string, string>>): string {
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => values[name] ?? whole);
}
