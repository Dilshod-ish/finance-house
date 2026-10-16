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
  'pnl.revenue': ['Tushum', 'Выручка', 'Revenue'],
  'pnl.cogs': ['Sotilgan mahsulot tannarxi', 'Себестоимость продаж', 'Cost of sales'],
  'pnl.grossProfit': ['Yalpi foyda', 'Валовая прибыль', 'Gross profit'],
  'pnl.grossMargin': ['Yalpi marja, %', 'Валовая маржа, %', 'Gross margin, %'],
  'pnl.opexVariable': ['O‘zgaruvchan xarajatlar', 'Переменные расходы', 'Variable costs'],
  'pnl.marginalProfit': ['Marjinal foyda', 'Маржинальная прибыль', 'Marginal profit'],
  'pnl.marginalMargin': [
    'Marjinal daromadlilik, %',
    'Маржинальная рентабельность, %',
    'Marginal margin, %',
  ],
  'pnl.opexFixed': ['Doimiy xarajatlar', 'Постоянные расходы', 'Fixed costs'],
  'pnl.opexUnclassified': [
    'Taqsimlanmagan xarajatlar',
    'Нераспределённые расходы',
    'Unclassified costs',
  ],
  'pnl.ebitda': ['EBITDA', 'EBITDA', 'EBITDA'],
  'pnl.ebitdaMargin': ['EBITDA marjasi, %', 'Маржа EBITDA, %', 'EBITDA margin, %'],
  'pnl.depreciation': ['Amortizatsiya', 'Амортизация', 'Depreciation'],
  'pnl.interest': ['Foizlar', 'Проценты', 'Interest'],
  'pnl.tax': ['Soliqlar', 'Налоги', 'Taxes'],
  'pnl.fxDifference': ['Kurs farqi', 'Курсовая разница', 'FX difference'],
  'pnl.otherIncome': ['Boshqa daromadlar', 'Прочие доходы', 'Other income'],
  'pnl.netProfit': ['Sof foyda', 'Чистая прибыль', 'Net profit'],
  'pnl.netMargin': [
    'Sof rentabellik (ROS), %',
    'Чистая рентабельность (ROS), %',
    'Net margin (ROS), %',
  ],
  'pnl.dividends': [
    'Dividendlar va egasining chiqimlari',
    'Дивиденды и изъятия собственника',
    'Dividends and owner draws',
  ],
  'pnl.retained': ['Taqsimlanmagan foyda', 'Нераспределённая прибыль', 'Retained for the period'],
  // Cash flow (ДДС) — architecture §7.1.
  'cf.openingCash': ['Davr boshiga pul', 'Деньги на начало периода', 'Cash at start of period'],
  'cf.closingCash': ['Davr oxiriga pul', 'Деньги на конец периода', 'Cash at end of period'],
  'cf.operating': ['Operatsion faoliyat', 'Операционная деятельность', 'Operating activities'],
  'cf.operating.in': ['Operatsion tushumlar', 'Операционные поступления', 'Operating receipts'],
  'cf.operating.out': ['Operatsion to‘lovlar', 'Операционные выплаты', 'Operating payments'],
  'cf.investing': ['Investitsion faoliyat', 'Инвестиционная деятельность', 'Investing activities'],
  'cf.investing.in': ['Investitsion tushumlar', 'Инвестиционные поступления', 'Investing receipts'],
  'cf.investing.out': ['Investitsion to‘lovlar', 'Инвестиционные выплаты', 'Investing payments'],
  'cf.financing': ['Moliyaviy faoliyat', 'Финансовая деятельность', 'Financing activities'],
  'cf.financing.in': ['Moliyaviy tushumlar', 'Финансовые поступления', 'Financing receipts'],
  'cf.financing.out': ['Moliyaviy to‘lovlar', 'Финансовые выплаты', 'Financing payments'],
  'cf.netFlow': ['Sof pul oqimi', 'Чистый денежный поток', 'Net cash flow'],
  'cf.transfer': [
    'Hisoblar o‘rtasida o‘tkazmalar',
    'Переводы между счетами',
    'Transfers between own accounts',
  ],
  'cf.transfer.in': ['Kelib tushdi', 'Поступило', 'Transferred in'],
  'cf.transfer.out': ['Yuborildi', 'Отправлено', 'Transferred out'],
  'cf.nonCashChange': [
    'Kurs farqi va boshqa pulsiz o‘zgarishlar',
    'Курсовая разница и прочие неденежные изменения',
    'FX and other non-cash changes',
  ],
} as const satisfies Record<string, readonly [string, string, string]>;

export type ReportMessageKey = keyof typeof ROWS;

export const REPORT_MESSAGES: Messages = messagesFromRows(ROWS);

export const REPORT_MESSAGE_KEYS: readonly string[] = Object.keys(ROWS);
