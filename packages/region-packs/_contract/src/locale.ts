// The i18n primitives live in @fincore/shared (CLAUDE.md §4); re-exported so
// pack authors have one import site.
export {
  LANGUAGES,
  auditMessages,
  declaredKeys,
  messagesFromRows,
  type Language,
  type Messages,
  type MissingTranslation,
} from '@fincore/shared';

import type { Language } from '@fincore/shared';

export interface LocaleConfig {
  readonly languages: readonly Language[];
  readonly defaultLanguage: Language;
  /** BCP-47 tag used for Intl number and date formatting. */
  readonly numberFormatLocale: string;
  readonly dateFormatLocale: string;
  /** ISO-8601: 1 = Monday. */
  readonly firstDayOfWeek: 1 | 7;
}
