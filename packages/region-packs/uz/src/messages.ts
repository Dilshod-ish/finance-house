import { LANGUAGES, type Language, type Messages } from '@fincore/region-pack-contract';

/**
 * One row per key, in the order `uz, ru, en`. Keeping the three languages side
 * by side makes a missing translation impossible to overlook, and CLAUDE.md
 * §7.6 requires all three for every user-facing string.
 */
const TRIPLES = {
  'legalForm.mchj': [
    "Mas'uliyati cheklangan jamiyat (MCHJ)",
    'Общество с ограниченной ответственностью',
    'Limited liability company',
  ],
  'legalForm.yatt': [
    'Yakka tartibdagi tadbirkor (YaTT)',
    'Индивидуальный предприниматель',
    'Individual entrepreneur',
  ],
  'legalForm.xk': ['Xususiy korxona (XK)', 'Частное предприятие', 'Private enterprise'],

  'taxRegime.aylanma1': ['Aylanma solig‘i 1%', 'Налог с оборота 1%', 'Turnover tax 1%'],
  'taxRegime.aylanma1.description': [
    'Yakka tartibdagi tadbirkorlar uchun soddalashtirilgan rejim',
    'Упрощённый режим для индивидуальных предпринимателей',
    'Simplified regime for individual entrepreneurs',
  ],
  'taxRegime.aylanma4': ['Aylanma solig‘i 4%', 'Налог с оборота 4%', 'Turnover tax 4%'],
  'taxRegime.aylanma4.description': [
    'Yuridik shaxslar uchun soddalashtirilgan rejim',
    'Упрощённый режим для юридических лиц',
    'Simplified regime for legal entities',
  ],
  'taxRegime.qqsFoyda': ['QQS va foyda solig‘i', 'НДС и налог на прибыль', 'VAT and profit tax'],
  'taxRegime.qqsFoyda.description': [
    'Umumiy rejim: QQS 12% va foyda solig‘i 15%',
    'Общий режим: НДС 12% и налог на прибыль 15%',
    'General regime: 12% VAT and 15% profit tax',
  ],

  'taxBase.turnover': ['Yillik aylanma', 'Годовой оборот', 'Annual turnover'],
  'taxBase.addedValue': ['Qo‘shilgan qiymat', 'Добавленная стоимость', 'Added value'],
  'taxBase.taxableProfit': [
    'Soliq solinadigan foyda',
    'Налогооблагаемая прибыль',
    'Taxable profit',
  ],
  'taxBase.grossSalary': ['Yalpi ish haqi', 'Валовая заработная плата', 'Gross salary'],
  'taxBase.payrollFund': ['Ish haqi fondi', 'Фонд оплаты труда', 'Payroll fund'],

  'gl.1010': ['Bank hisob raqami', 'Расчётный счёт', 'Bank current account'],
  'gl.1020': ['Kassa', 'Касса', 'Cash on hand'],
  'gl.1030': ['Korporativ karta', 'Корпоративная карта', 'Corporate card'],
  'gl.1040': ['Elektron hamyon', 'Электронный кошелёк', 'E-wallet'],
  'gl.1090': ['Yo‘ldagi pul', 'Деньги в пути', 'Money in transit'],
  'gl.1200': ['Xaridorlar qarzi', 'Дебиторская задолженность покупателей', 'Trade receivables'],
  'gl.1210': ['Berilgan avanslar', 'Выданные авансы', 'Prepayments made'],
  'gl.1300': ['Zaxiralar', 'Запасы', 'Inventory'],
  'gl.1400': ['Kiruvchi QQS', 'Входящий НДС', 'Input VAT'],
  'gl.1500': ['Asosiy vositalar', 'Основные средства', 'Fixed assets'],
  'gl.1510': ['Jamlangan amortizatsiya', 'Накопленная амортизация', 'Accumulated depreciation'],

  'gl.2010': [
    'Yetkazib beruvchilar qarzi',
    'Кредиторская задолженность поставщиков',
    'Trade payables',
  ],
  'gl.2020': ['Olingan avanslar', 'Полученные авансы', 'Prepayments received'],
  'gl.2100': ['Ish haqi bo‘yicha qarz', 'Задолженность по заработной плате', 'Payroll payable'],
  'gl.2200': ['Kreditlar va lizing', 'Кредиты и лизинг', 'Loans and leases'],
  'gl.2210': ['Hisoblangan foizlar', 'Начисленные проценты', 'Accrued interest'],
  'gl.2300': ['Chiquvchi QQS', 'Исходящий НДС', 'Output VAT'],
  'gl.2400': [
    'Boshqa soliqlar bo‘yicha qarz',
    'Задолженность по прочим налогам',
    'Other taxes payable',
  ],

  'gl.3010': ['Ustav kapitali', 'Уставный капитал', 'Share capital'],
  'gl.3020': ['Taqsimlanmagan foyda', 'Нераспределённая прибыль', 'Retained earnings'],
  'gl.3030': [
    'Dividendlar va egasining chiqimlari',
    'Дивиденды и изъятия собственника',
    'Dividends and owner draws',
  ],

  'gl.4010': ['Xizmatlardan tushum', 'Выручка от услуг', 'Service revenue'],
  'gl.4020': ['Tovarlardan tushum', 'Выручка от товаров', 'Goods revenue'],
  'gl.4900': ['Boshqa daromadlar', 'Прочие доходы', 'Other income'],

  'gl.5010': ['Xizmatlar tannarxi', 'Себестоимость услуг', 'Cost of services'],
  'gl.5100': ['Marketing va reklama', 'Маркетинг и реклама', 'Marketing and advertising'],
  'gl.5110': ['Ekvayring komissiyasi', 'Комиссия эквайринга', 'Acquiring commission'],
  'gl.5200': ['Ma’muriy ish haqi', 'Административная заработная плата', 'Administrative payroll'],
  'gl.5300': [
    'Ijara va kommunal xarajatlar',
    'Аренда и коммунальные расходы',
    'Rent and utilities',
  ],
  'gl.5400': [
    'Aloqa va professional xizmatlar',
    'Связь и профессиональные услуги',
    'Communications and professional services',
  ],
  'gl.5500': ['Ofis xarajatlari', 'Офисные расходы', 'Office expenses'],
  'gl.5600': ['Amortizatsiya', 'Амортизация', 'Depreciation'],
  'gl.5700': ['Foiz xarajatlari', 'Процентные расходы', 'Interest expense'],
  'gl.5800': ['Soliq xarajatlari', 'Расходы по налогам', 'Tax expense'],
  'gl.5900': ['Kurs farqi', 'Курсовая разница', 'FX difference'],

  'industry.services': ['Xizmatlar', 'Услуги', 'Services'],

  'article.svc.revenue': ['Tushum', 'Выручка', 'Revenue'],
  'article.svc.revenue.projects': ['Loyihalardan tushum', 'Выручка от проектов', 'Project revenue'],
  'article.svc.revenue.retainer': ['Abonent to‘lovi', 'Абонентская плата', 'Retainer revenue'],
  'article.svc.revenue.other': ['Boshqa tushum', 'Прочая выручка', 'Other revenue'],

  'article.svc.cogs': ['Xizmat tannarxi', 'Себестоимость услуг', 'Cost of delivery'],
  'article.svc.cogs.payroll': [
    'Loyiha jamoasi ish haqi',
    'Зарплата проектной команды',
    'Delivery team payroll',
  ],
  'article.svc.cogs.contractors': ['Subpudratchilar', 'Субподрядчики', 'Subcontractors'],
  'article.svc.cogs.software': [
    'Loyiha uchun dasturiy ta’minot',
    'Программное обеспечение для проектов',
    'Project software',
  ],

  'article.svc.opexVar': ['O‘zgaruvchan xarajatlar', 'Переменные расходы', 'Variable expenses'],
  'article.svc.opexVar.marketing': [
    'Marketing va reklama',
    'Маркетинг и реклама',
    'Marketing and advertising',
  ],
  'article.svc.opexVar.commission': [
    'Ekvayring komissiyasi',
    'Комиссия эквайринга',
    'Acquiring commission',
  ],
  'article.svc.opexVar.travel': ['Xizmat safarlari', 'Командировки', 'Business travel'],

  'article.svc.opexFix': ['Doimiy xarajatlar', 'Постоянные расходы', 'Fixed expenses'],
  'article.svc.opexFix.adminPayroll': [
    'Ma’muriy ish haqi',
    'Административная зарплата',
    'Administrative payroll',
  ],
  'article.svc.opexFix.rent': ['Ijara', 'Аренда', 'Rent'],
  'article.svc.opexFix.utilities': ['Kommunal xarajatlar', 'Коммунальные расходы', 'Utilities'],
  'article.svc.opexFix.communications': [
    'Aloqa va internet',
    'Связь и интернет',
    'Communications and internet',
  ],
  'article.svc.opexFix.professional': [
    'Buxgalteriya va yuridik xizmatlar',
    'Бухгалтерские и юридические услуги',
    'Accounting and legal services',
  ],
  'article.svc.opexFix.office': ['Ofis xarajatlari', 'Офисные расходы', 'Office expenses'],

  'article.svc.belowEbitda.depreciation': ['Amortizatsiya', 'Амортизация', 'Depreciation'],
  'article.svc.belowEbitda.interest': [
    'Kredit foizlari',
    'Проценты по кредитам',
    'Interest expense',
  ],
  'article.svc.belowEbitda.tax': ['Soliqlar', 'Налоги', 'Taxes'],
  'article.svc.belowEbitda.fx': ['Kurs farqi', 'Курсовая разница', 'FX difference'],
  'article.svc.belowNet.dividends': [
    'Dividendlar va egasining chiqimlari',
    'Дивиденды и изъятия собственника',
    'Dividends and owner draws',
  ],

  'article.svc.financing.loanIn': ['Kredit olish', 'Получение кредита', 'Loan received'],
  'article.svc.financing.loanOut': ['Kreditni qaytarish', 'Погашение кредита', 'Loan repayment'],
  'article.svc.investing.equipment': ['Jihoz xaridi', 'Покупка оборудования', 'Equipment purchase'],
  'article.svc.transfer.internal': [
    'Hisoblar o‘rtasida o‘tkazma',
    'Перевод между счетами',
    'Transfer between accounts',
  ],

  'bank.tbc': ['TBC Bank', 'TBC Bank', 'TBC Bank'],
  'bank.anor': ['Anor Bank', 'Anor Bank', 'Anor Bank'],
  'bank.kapital': ['Kapitalbank', 'Капиталбанк', 'Kapitalbank'],
  'bank.uzum': ['Uzum Bank', 'Uzum Bank', 'Uzum Bank'],
  'bank.nbu': [
    'O‘zbekiston Milliy banki',
    'Национальный банк Узбекистана',
    'National Bank of Uzbekistan',
  ],
  'bank.ipoteka': ['Ipoteka Bank', 'Ипотека Банк', 'Ipoteka Bank'],

  'parser.1cExchange': ['1C almashinuv fayli', 'Файл обмена 1С', '1C exchange file'],
  'parser.xlsx': ['Excel ko‘chirmasi', 'Выписка Excel', 'Excel statement'],
  'parser.csv': ['CSV ko‘chirmasi', 'Выписка CSV', 'CSV statement'],
  'parser.pdfOcr': ['PDF ko‘chirmasi (OCR)', 'Выписка PDF (OCR)', 'PDF statement (OCR)'],

  'einvoice.didox': ['Didox', 'Didox', 'Didox'],
  'einvoice.faktura': ['Faktura.uz', 'Faktura.uz', 'Faktura.uz'],
  'taxAuthority.soliq': ['Soliq qo‘mitasi', 'Налоговый комитет', 'Tax Committee'],
  'fxSource.cbu': [
    'O‘zbekiston Markaziy banki',
    'Центральный банк Узбекистана',
    'Central Bank of Uzbekistan',
  ],

  'preset.cashFlowMonthly': ['Pul oqimi, oylik', 'Денежный поток, помесячно', 'Cash flow, monthly'],
  'preset.pnlMonthly': [
    'Daromad va xarajatlar, oylik',
    'Доходы и расходы, помесячно',
    'Profit and loss, monthly',
  ],
  'preset.balanceSheet': ['Balans', 'Баланс', 'Balance sheet'],
  'preset.paymentCalendar': ['To‘lov kalendari', 'Платёжный календарь', 'Payment calendar'],
} as const satisfies Record<string, readonly [string, string, string]>;

export type MessageKey = keyof typeof TRIPLES;

function tableFor(index: 0 | 1 | 2): Record<string, string> {
  return Object.fromEntries(Object.entries(TRIPLES).map(([key, values]) => [key, values[index]]));
}

export const MESSAGES: Messages = {
  uz: tableFor(0),
  ru: tableFor(1),
  en: tableFor(2),
};

/** Guards the triple table against drift if LANGUAGES ever grows. */
export const TRANSLATED_LANGUAGES: readonly Language[] = LANGUAGES;
