import { messagesFromRows, type Messages } from '@fincore/shared';

/**
 * Interface chrome, one row per key in `uz, ru, en` order (CLAUDE.md §7.6).
 * Report line labels are not here — those come from `@fincore/reports`, so the
 * UI never holds financial vocabulary of its own.
 */
const ROWS = {
  'unit.thousand': ['ming', 'тыс.', 'K'],
  'unit.million': ['mln', 'млн', 'M'],
  'unit.billion': ['mlrd', 'млрд', 'B'],
  'unit.trillion': ['trln', 'трлн', 'T'],

  'nav.pnl': ['Daromad va xarajatlar', 'Доходы и расходы', 'Profit and loss'],
  'nav.cashFlow': ['Pul oqimi', 'Движение денег', 'Cash flow'],
  'nav.balanceSheet': ['Balans', 'Баланс', 'Balance sheet'],
  'nav.checks': ['Tekshiruv', 'Проверка', 'Checks'],

  'period.from': ['Boshi', 'Начало', 'From'],
  'period.to': ['Oxiri', 'Конец', 'To'],
  'period.asOf': ['Sana holatiga', 'На дату', 'As of'],
  'period.comparePrior': [
    'Oldingi davr bilan',
    'С предыдущим периодом',
    'Compare with prior period',
  ],

  'grouping.label': ['Kesim', 'Разрез', 'Breakdown'],
  'grouping.none': ['Kesimsiz', 'Без разреза', 'None'],
  'grouping.article': ['Modda', 'Статья', 'Article'],
  'grouping.direction': ["Yo'nalish", 'Направление', 'Direction'],
  'grouping.counterparty': ['Kontragent', 'Контрагент', 'Counterparty'],
  'grouping.account': ['Hisob', 'Счёт', 'Account'],
  'grouping.direction_article': [
    "Yo'nalish × modda",
    'Направление × статья',
    'Direction × article',
  ],

  'table.total': ['Jami', 'Итого', 'Total'],
  'table.line': ['Ko‘rsatkich', 'Показатель', 'Line'],
  'table.amount': ['Summa', 'Сумма', 'Amount'],
  'table.prior': ['Oldingi davr', 'Пред. период', 'Prior'],
  'table.delta': ["O'zgarish", 'Изменение', 'Change'],
  'table.share': ['Ulush', 'Доля', 'Share'],

  'drilldown.title': ['Qaysi yozuvlardan', 'Из каких проводок', 'Underlying entries'],
  'drilldown.close': ['Yopish', 'Закрыть', 'Close'],
  'drilldown.date': ['Sana', 'Дата', 'Date'],
  'drilldown.source': ['Manba', 'Источник', 'Source'],
  'drilldown.account': ['Hisob', 'Счёт', 'Account'],
  'drilldown.article': ['Modda', 'Статья', 'Article'],
  'drilldown.direction': ["Yo'nalish", 'Направление', 'Direction'],
  'drilldown.amount': ['Summa', 'Сумма', 'Amount'],
  'drilldown.capped': [
    "Faqat birinchi {limit} yozuv ko'rsatildi",
    'Показаны только первые {limit} проводок',
    'Showing the first {limit} entries only',
  ],

  'state.loading': ['Yuklanmoqda', 'Загрузка', 'Loading'],
  'state.empty.title': [
    'Bu davrda yozuv yo‘q',
    'За этот период нет проводок',
    'Nothing in this period',
  ],
  'state.empty.body': [
    'Davrni o‘zgartiring yoki ma’lumot yuklang.',
    'Измените период или загрузите данные.',
    'Change the period, or load some data.',
  ],
  'state.error.title': [
    'Hisobotni olib bo‘lmadi',
    'Не удалось получить отчёт',
    'Could not load the report',
  ],
  'state.error.body': [
    'Qayta urinib ko‘ring. Takrorlansa, server jurnalini tekshirish kerak.',
    'Попробуйте ещё раз. Если повторится — нужно проверить журнал сервера.',
    'Try again. If it keeps happening, the server log needs a look.',
  ],
  'state.retry': ['Qayta urinish', 'Повторить', 'Try again'],

  'check.title': ['Hisobotlarga ishonch', 'Доверие к отчётам', 'Report confidence'],
  'check.reconciled': ['Sverka o‘tdi', 'Сверка пройдена', 'Reconciled'],
  'check.failed': ['Sverka o‘tmadi', 'Сверка не пройдена', 'Not reconciled'],
  'check.netProfit': ['Sof foyda', 'Чистая прибыль', 'Net profit'],
  'check.equityChange': ['Kapital o‘zgarishi', 'Изменение капитала', 'Change in equity'],
  'check.contributions': ['Ustav kapitali', 'Уставный капитал', 'Capital contributed'],
  'check.broughtForward': ['O‘tgan davr foydasi', 'Прибыль прошлых периодов', 'Brought forward'],
  'check.draws': ['Egasining chiqimlari', 'Изъятия собственника', 'Owner draws'],
  'check.residual': ['Qoldiq', 'Остаток', 'Residual'],
  'check.residualExplainer': [
    'Qoldiq nolga teng bo‘lishi shart. Aks holda bu hisobotda emas, daftarda xato.',
    'Остаток должен быть нулевым. Иначе ошибка не в отчёте, а в журнале.',
    'The residual must be zero. If it is not, the bug is in the ledger, not the report.',
  ],
  'balance.balanced': ['Balans teng', 'Баланс сходится', 'Balance sheet ties'],
  'balance.unbalanced': ['Balans teng emas', 'Баланс не сходится', 'Balance sheet does not tie'],

  'entity.all': ['Barcha yuridik shaxslar', 'Все юрлица', 'All legal entities'],
  'org.label': ['Firma', 'Компания', 'Organization'],
  'language.label': ['Til', 'Язык', 'Language'],
} as const;

export const UI_MESSAGES: Messages = messagesFromRows(ROWS);

export type UiMessageKey = keyof typeof ROWS;

export const UI_MESSAGE_KEYS: readonly UiMessageKey[] = Object.keys(ROWS) as UiMessageKey[];
