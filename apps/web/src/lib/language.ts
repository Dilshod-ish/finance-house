import { REPORT_MESSAGES } from '@fincore/reports/structure';
import { LANGUAGES, type Language } from '@fincore/shared';
import { UI_MESSAGES, createTranslate, type Translate } from '@fincore/ui';

export const DEFAULT_LANGUAGE: Language = 'uz';

/** Reads `?lang=`, falling back rather than failing on an unknown value. */
export function readLanguage(value: string | undefined): Language {
  return LANGUAGES.includes(value as Language) ? (value as Language) : DEFAULT_LANGUAGE;
}

/**
 * The chrome table first, then the report labels: a screen never writes
 * financial prose of its own, it renders the key the report gave it.
 */
export function translator(language: Language): Translate {
  return createTranslate(language, UI_MESSAGES, REPORT_MESSAGES);
}

export { LANGUAGES };
export type { Language, Translate };
