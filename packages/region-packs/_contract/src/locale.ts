/**
 * Languages a pack ships. `ru` is first-class in `uz` (PRD §4): Russian is
 * still the working language of much of Uzbek business.
 */
export type Language = 'uz' | 'ru' | 'en';

export const LANGUAGES: readonly Language[] = ['uz', 'ru', 'en'];

/**
 * User-facing text lives here as locale keys, never as localized strings in the
 * database (CLAUDE.md §9). A pack must translate every key it declares into
 * every language it lists.
 */
export type Messages = Readonly<Record<Language, Readonly<Record<string, string>>>>;

export interface LocaleConfig {
  readonly languages: readonly Language[];
  readonly defaultLanguage: Language;
  /** BCP-47 tag used for Intl number and date formatting. */
  readonly numberFormatLocale: string;
  readonly dateFormatLocale: string;
  /** ISO-8601: 1 = Monday. */
  readonly firstDayOfWeek: 1 | 7;
}
