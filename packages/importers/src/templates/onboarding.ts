import { FLOW_TYPES } from '@fincore/shared';
import {
  amountColumn,
  column,
  currencyColumn,
  fromPack,
  fromSheet,
  noteColumn,
  oneOf,
  required,
} from './columns.js';
import type { TemplateSpec } from './types.js';

/**
 * Everything FinCore needs before it can report on anything: who the company
 * is, where it keeps money, what it owned and owed on day one, and the
 * vocabulary it files costs under.
 *
 * Opening balances are the sheet people skip, and the one that decides whether
 * the first balance sheet means anything. Without them the ledger starts from
 * nothing and every report reads as if the business began the day it was
 * entered.
 */
export const ONBOARDING_TEMPLATE: TemplateSpec = {
  file: '1-boshlangich',
  title: {
    uz: 'Boshlang‘ich ma’lumotlar',
    ru: 'Начальные данные',
    en: 'Opening data',
  },
  intro: {
    uz: [
      'Bu fayl bir marta to‘ldiriladi — hisobni boshlashdan oldin.',
      'Varaqlar tartibi bo‘yicha boring: «Firma» → «Hisoblar» → «Kirish qoldiqlari» → qolganlari.',
      '«Kirish qoldiqlari» eng muhim varaq. Usiz birinchi balans ma’nosiz bo‘ladi: tizim biznes shu kuni boshlangan deb o‘ylaydi.',
      'Qoldiqlar bir sanaga bo‘lishi shart — hisobot boshlanadigan kundan oldingi kun.',
      'Moddalar va yo‘nalishlarni hozir to‘liq yozish shart emas: keyin qo‘shish mumkin, lekin birinchi hisobotlar shu ro‘yxat bo‘yicha guruhlanadi.',
    ],
    ru: [
      'Этот файл заполняется один раз — до начала учёта.',
      'Идите по листам по порядку: «Firma» → «Hisoblar» → «Kirish qoldiqlari» → остальные.',
      '«Kirish qoldiqlari» — самый важный лист. Без него первый баланс бессмыслен: система решит, что бизнес начался в этот день.',
      'Остатки должны быть на одну дату — день перед началом отчётного периода.',
      'Статьи и направления можно дополнить позже, но первые отчёты группируются по этому списку.',
    ],
    en: [
      'This file is filled in once, before the books start.',
      'Work through the sheets in order: Firma, then Hisoblar, then Kirish qoldiqlari, then the rest.',
      'Kirish qoldiqlari is the sheet that matters most. Without it the first balance sheet means nothing, because the ledger starts from zero.',
      'All opening balances carry the same date: the day before the reporting period begins.',
      'Articles and directions can be extended later, but the first reports group by this list.',
    ],
  },
  sheets: [
    {
      name: 'Firma',
      title: { uz: 'Firma', ru: 'Компания', en: 'Company' },
      purpose: {
        uz: 'Yuridik shaxs va hisobot valyutasi.',
        ru: 'Юрлицо и валюта отчётности.',
        en: 'The legal entity and the reporting currency.',
      },
      singleRow: true,
      required: true,
      columns: [
        column(
          'name',
          ['Nomi', 'Название', 'Name'],
          'text',
          'Silk Road Systems',
          [
            'Hisobotlarda ko‘rinadigan nom.',
            'Название в отчётах.',
            'The name that shows on reports.',
          ],
          required({ width: 28 }),
        ),
        column(
          'legalForm',
          ['Yuridik shakl', 'Правовая форма', 'Legal form'],
          'enum',
          '',
          ['Ro‘yxatdan tanlang.', 'Выберите из списка.', 'Pick from the list.'],
          required({ values: fromPack('legalForms'), width: 16 }),
        ),
        column(
          'taxId',
          ['STIR', 'ИНН', 'Tax id'],
          'text',
          '301234567',
          [
            'Soliq to‘lovchining identifikatsiya raqami.',
            'Идентификационный номер налогоплательщика.',
            'The taxpayer identification number.',
          ],
          { width: 14 },
        ),
        column(
          'taxRegime',
          ['Soliq rejimi', 'Налоговый режим', 'Tax regime'],
          'enum',
          '',
          [
            'Ro‘yxatdan tanlang. Soliq stavkalari shundan kelib chiqadi.',
            'Выберите из списка. От этого зависят ставки.',
            'Pick from the list; the rates follow from it.',
          ],
          { values: fromPack('taxRegimes'), width: 22 },
        ),
        currencyColumn({ required: true }),
        column(
          'startsOn',
          ['Hisobot boshlanadi', 'Учёт начинается', 'Books start'],
          'date',
          '2026-01-01',
          [
            'Birinchi hisobot davri qaysi kundan boshlanadi.',
            'С какого дня начинается первый отчётный период.',
            'The first day of the first reporting period.',
          ],
          required({ width: 18 }),
        ),
      ],
    },
    {
      name: 'Hisoblar',
      title: { uz: 'Hisoblar va kassalar', ru: 'Счета и кассы', en: 'Accounts and cash desks' },
      purpose: {
        uz: 'Pul qayerda turadi. Har valyuta uchun alohida qator.',
        ru: 'Где лежат деньги. По строке на каждую валюту.',
        en: 'Where the money sits. One row per currency.',
      },
      singleRow: false,
      required: true,
      columns: [
        column(
          'name',
          ['Nomi', 'Название', 'Name'],
          'text',
          'Bank · USD',
          [
            'Siz taniydigan nom. Ko‘chirma faylida ham shu nom yoziladi.',
            'Название, которое вы узнаёте. Его же пишут в файле выписки.',
            'A name you will recognise. The statement file carries the same one.',
          ],
          required({ width: 22 }),
        ),
        column(
          'kind',
          ['Turi', 'Тип', 'Kind'],
          'enum',
          'bank',
          [
            'bank — bank hisobi · kassa — naqd · karta · hamyon — elektron hamyon · ekvayring',
            'bank — счёт · kassa — наличные · karta — карта · hamyon — кошелёк · ekvayring',
            'bank · kassa (cash) · karta (card) · hamyon (e-wallet) · ekvayring (acquiring)',
          ],
          required({ values: oneOf('bank', 'kassa', 'karta', 'hamyon', 'ekvayring'), width: 14 }),
        ),
        currencyColumn(),
        column(
          'bank',
          ['Bank', 'Банк', 'Bank'],
          'text',
          'Meridian Bank',
          [
            'Kassa bo‘lsa bo‘sh qoldiring.',
            'Для кассы оставьте пустым.',
            'Leave empty for a cash desk.',
          ],
          { width: 20 },
        ),
        column(
          'number',
          ['Hisob raqami', 'Номер счёта', 'Account number'],
          'text',
          '2020 8000 1234 5678 901',
          ['Ixtiyoriy.', 'Необязательно.', 'Optional.'],
          { width: 26 },
        ),
      ],
    },
    {
      name: 'Kirish_qoldiqlari',
      title: { uz: 'Kirish qoldiqlari', ru: 'Входящие остатки', en: 'Opening balances' },
      purpose: {
        uz: 'Hisobot boshlanishidan oldingi kundagi holat. Eng muhim varaq.',
        ru: 'Состояние на день перед началом учёта. Самый важный лист.',
        en: 'The position the day before the books start. The sheet that matters most.',
      },
      singleRow: false,
      required: true,
      columns: [
        column(
          'date',
          ['Sana', 'Дата', 'Date'],
          'date',
          '2025-12-31',
          [
            'Hamma qatorda bir xil: hisobot boshlanadigan kundan oldingi kun.',
            'Одинаковая во всех строках: день перед началом учёта.',
            'The same on every row: the day before the books start.',
          ],
          required({ width: 13 }),
        ),
        column(
          'section',
          ['Bo‘lim', 'Раздел', 'Section'],
          'enum',
          'pul',
          [
            'pul · debitorka · kreditorka · zaxira · asosiy_vosita · kredit · soliq_qarzi · oylik_qarzi · ustav_kapitali',
            'pul (деньги) · debitorka · kreditorka · zaxira (запасы) · asosiy_vosita · kredit · soliq_qarzi · oylik_qarzi · ustav_kapitali',
            'pul (cash) · debitorka (receivable) · kreditorka (payable) · zaxira (inventory) · asosiy_vosita (fixed asset) · kredit (loan) · soliq_qarzi (tax) · oylik_qarzi (payroll) · ustav_kapitali (share capital)',
          ],
          required({
            values: oneOf(
              'pul',
              'debitorka',
              'kreditorka',
              'zaxira',
              'asosiy_vosita',
              'kredit',
              'soliq_qarzi',
              'oylik_qarzi',
              'ustav_kapitali',
            ),
            width: 18,
          }),
        ),
        column(
          'subject',
          ['Nimasi', 'Что именно', 'What'],
          'text',
          'Bank · USD',
          [
            'Pul bo‘lsa — hisob nomi. Qarz bo‘lsa — kontragent. Asosiy vosita bo‘lsa — nomi.',
            'Для денег — название счёта. Для долга — контрагент. Для ОС — название.',
            'For cash, the account name. For a debt, the counterparty. For an asset, its name.',
          ],
          required({ width: 26 }),
        ),
        amountColumn(
          'amount',
          ['Summa', 'Сумма', 'Amount'],
          [
            'Musbat son. Qarzlar ham musbat — bo‘lim ularning tomonini aytadi.',
            'Положительное число. Долги тоже положительные — сторону определяет раздел.',
            'A positive number. Debts are positive too; the section says which side they are on.',
          ],
          required(),
        ),
        currencyColumn(),
        noteColumn(),
      ],
    },
    {
      name: 'Moddalar',
      title: { uz: 'Moddalar', ru: 'Статьи', en: 'Articles' },
      purpose: {
        uz: 'Daromad va xarajatlarni nima bo‘yicha guruhlaysiz.',
        ru: 'По чему группируются доходы и расходы.',
        en: 'How income and costs are grouped.',
      },
      singleRow: false,
      required: true,
      columns: [
        column(
          'name',
          ['Nomi', 'Название', 'Name'],
          'text',
          'Loyihalardan tushum',
          [
            'Hisobotda shu nom ko‘rinadi.',
            'Это название видно в отчёте.',
            'The name that shows on the report.',
          ],
          required({ width: 30 }),
        ),
        column(
          'parent',
          ['Ota modda', 'Родительская статья', 'Parent article'],
          'text',
          'Tushum',
          [
            'Iyerarxiya uchun. Bo‘sh — yuqori daraja.',
            'Для иерархии. Пусто — верхний уровень.',
            'For the hierarchy. Empty means top level.',
          ],
          { width: 24 },
        ),
        column(
          'flowType',
          ['Oqim turi', 'Тип потока', 'Flow type'],
          'enum',
          'revenue',
          [
            'Modda ОПиУ va ДДС’da qayerga tushishini belgilaydi. Bu eng muhim ustun.',
            'Определяет, куда статья попадёт в ОПиУ и ДДС. Самая важная колонка.',
            'Decides where the article lands in the P&L and the cash flow. The column that matters.',
          ],
          required({ values: oneOf(...FLOW_TYPES), width: 18 }),
        ),
        noteColumn(),
      ],
    },
    {
      name: 'Yonalishlar',
      title: { uz: 'Yo‘nalishlar', ru: 'Направления', en: 'Directions' },
      purpose: {
        uz: 'Biznes yo‘nalishlari, do‘konlar, obyektlar — nima bo‘yicha kesim kerak bo‘lsa.',
        ru: 'Направления бизнеса, магазины, объекты — по чему нужен разрез.',
        en: 'Business lines, stores, sites — whatever you need a cross-section by.',
      },
      singleRow: false,
      required: false,
      columns: [
        column(
          'name',
          ['Nomi', 'Название', 'Name'],
          'text',
          'Integratsiya loyihalari',
          ['', '', ''],
          required({ width: 30 }),
        ),
        noteColumn(),
      ],
    },
    {
      name: 'Kontragentlar',
      title: { uz: 'Kontragentlar', ru: 'Контрагенты', en: 'Counterparties' },
      purpose: {
        uz: 'Mijozlar va ta’minotchilar. Ko‘chirmadagi nomlar shu ro‘yxatga tushadi.',
        ru: 'Клиенты и поставщики. Имена из выписки сопоставляются с этим списком.',
        en: 'Customers and suppliers. Names in the statement are matched against this list.',
      },
      singleRow: false,
      required: false,
      columns: [
        column(
          'name',
          ['Nomi', 'Название', 'Name'],
          'text',
          'Aurora Freight BV',
          ['', '', ''],
          required({ width: 30 }),
        ),
        column(
          'kind',
          ['Turi', 'Тип', 'Kind'],
          'enum',
          'mijoz',
          [
            'mijoz · taminotchi · ikkalasi · xodim · bank · davlat',
            'mijoz (клиент) · taminotchi (поставщик) · ikkalasi · xodim · bank · davlat',
            'mijoz (customer) · taminotchi (supplier) · ikkalasi (both) · xodim (employee) · bank · davlat (government)',
          ],
          {
            values: oneOf('mijoz', 'taminotchi', 'ikkalasi', 'xodim', 'bank', 'davlat'),
            width: 14,
          },
        ),
        column('taxId', ['STIR', 'ИНН', 'Tax id'], 'text', '301234567', ['', '', ''], {
          width: 14,
        }),
        noteColumn(),
      ],
    },
  ],
};

/** Referenced from the operations template, so the lists stay one list. */
export const ACCOUNT_SHEET = fromSheet('Hisoblar', 'name');
export const ARTICLE_SHEET = fromSheet('Moddalar', 'name');
