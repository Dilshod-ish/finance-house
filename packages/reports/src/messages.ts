import { messagesFromRows, type Messages } from '@fincore/shared';

/**
 * Report line labels, one row per key in `uz, ru, en` order (CLAUDE.md §7.6).
 * These are product strings, not country-specific ones, so they live here
 * rather than in a region pack.
 */
const ROWS = {
  'bs.assets': ['AKTIVLAR', 'АКТИВЫ', 'ASSETS'],
  'bs.assets.current': ['Aylanma aktivlar', 'Оборотные активы', 'Current assets'],
  'bs.assets.cash': ['Pul mablag‘lari', 'Денежные средства', 'Cash and equivalents'],
  'bs.assets.receivable': ['Debitorlik qarzi', 'Дебиторская задолженность', 'Receivables'],
  'bs.assets.prepaid': ['Berilgan avanslar', 'Выданные авансы', 'Prepayments made'],
  'bs.assets.inventory': ['Zaxiralar', 'Запасы', 'Inventory'],
  // Named generically on purpose: "input VAT" is one country's name for what a
  // balance sheet carries as a recoverable tax asset, and the region boundary
  // (CLAUDE.md §4) keeps country tax terms inside the packs.
  'bs.assets.recoverableTax': [
    'Qaytariladigan soliqlar',
    'Возмещаемые налоги',
    'Recoverable taxes',
  ],
  'bs.assets.noncurrent': [
    'Aylanmadan tashqari aktivlar',
    'Внеоборотные активы',
    'Non-current assets',
  ],
  'bs.assets.fixedAssets': [
    'Asosiy vositalar (sof)',
    'Основные средства (нетто)',
    'Fixed assets, net',
  ],

  'bs.liabilitiesAndEquity': ['PASSIVLAR', 'ПАССИВЫ', 'LIABILITIES AND EQUITY'],
  'bs.liabilities': ['Jami majburiyatlar', 'Итого обязательства', 'Total liabilities'],
  'bs.liabilities.current': [
    'Qisqa muddatli majburiyatlar',
    'Краткосрочные обязательства',
    'Current liabilities',
  ],
  'bs.liabilities.payable': ['Kreditorlik qarzi', 'Кредиторская задолженность', 'Trade payables'],
  'bs.liabilities.advances': ['Olingan avanslar', 'Полученные авансы', 'Prepayments received'],
  'bs.liabilities.payroll': [
    'Ish haqi bo‘yicha qarz',
    'Задолженность по заработной плате',
    'Payroll payable',
  ],
  'bs.liabilities.taxes': ['Soliqlar bo‘yicha qarz', 'Задолженность по налогам', 'Taxes payable'],
  'bs.liabilities.interest': ['Hisoblangan foizlar', 'Начисленные проценты', 'Accrued interest'],
  'bs.liabilities.noncurrent': [
    'Uzoq muddatli majburiyatlar',
    'Долгосрочные обязательства',
    'Non-current liabilities',
  ],
  'bs.liabilities.loans': ['Kreditlar va lizing', 'Кредиты и лизинг', 'Loans and leases'],

  'bs.equity': ['Kapital', 'Капитал', 'Equity'],
  'bs.equity.shareCapital': ['Ustav kapitali', 'Уставный капитал', 'Share capital'],
  'bs.equity.retained': ['Taqsimlanmagan foyda', 'Нераспределённая прибыль', 'Retained earnings'],
  'bs.equity.result': [
    'Joriy davr natijasi',
    'Результат текущего периода',
    'Result for the period',
  ],
  'bs.equity.ownerDraw': [
    'Dividendlar va egasining chiqimlari',
    'Дивиденды и изъятия собственника',
    'Dividends and owner draws',
  ],
} as const satisfies Record<string, readonly [string, string, string]>;

export type ReportMessageKey = keyof typeof ROWS;

export const REPORT_MESSAGES: Messages = messagesFromRows(ROWS);

export const REPORT_MESSAGE_KEYS: readonly string[] = Object.keys(ROWS);
