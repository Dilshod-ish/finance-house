import {
  amountColumn,
  articleColumn,
  column,
  counterpartyColumn,
  currencyColumn,
  directionColumn,
  noteColumn,
  required,
} from './columns.js';
import type { TemplateSpec } from './types.js';

/**
 * The bank statement, which is the file that arrives every month.
 *
 * It is two sheets on purpose. `Hisob` carries what the statement is *for* —
 * which account, which period, and the bank's own opening and closing
 * balances. `Ko'chirma` carries the rows. The balances are not decoration:
 * the validator adds the rows up and refuses the file when
 * `opening + receipts − payments ≠ closing`, which catches a truncated export
 * or a missed page before any of it reaches the ledger.
 */
export const BANK_STATEMENT_TEMPLATE: TemplateSpec = {
  file: 'bank-kochirma',
  title: {
    uz: 'Bank ko‘chirmasi',
    ru: 'Банковская выписка',
    en: 'Bank statement',
  },
  intro: {
    uz: [
      'Bitta fayl — bitta hisob va bitta davr. Ikki hisobingiz bo‘lsa, ikkita fayl.',
      '«Hisob» varag‘ini to‘ldiring, so‘ng «Ko‘chirma» varag‘iga operatsiyalarni qo‘ying.',
      'Qoldiqlar muhim: tizim qatorlarni qo‘shib, boshlang‘ich va yakuniy qoldiq bilan solishtiradi. Mos kelmasa, fayl qabul qilinmaydi — ko‘chirma to‘liq emas degani.',
      'Kirim va chiqim alohida ustunlarda. Bitta qatorda ikkalasi ham bo‘lmaydi.',
      'Sanani YYYY-MM-DD ko‘rinishida yozing yoki Excel’ning sana formatidan foydalaning.',
    ],
    ru: [
      'Один файл — один счёт и один период. Два счёта — два файла.',
      'Заполните лист «Hisob», затем перенесите операции на лист «Ko‘chirma».',
      'Остатки важны: система складывает строки и сверяет с начальным и конечным остатком. Не сошлось — файл не принимается, значит выписка неполная.',
      'Приход и расход в разных колонках. В одной строке только одно из двух.',
      'Дату пишите как YYYY-MM-DD или используйте формат даты Excel.',
    ],
    en: [
      'One file, one account, one period. Two accounts means two files.',
      'Fill in the Hisob sheet, then put the operations on Ko‘chirma.',
      'The balances matter: the rows are added up and checked against the opening and closing figures. If they disagree the file is refused, because the statement is incomplete.',
      'Receipts and payments are separate columns. A row never carries both.',
      'Write dates as YYYY-MM-DD, or use a real Excel date cell.',
    ],
  },
  sheets: [
    {
      name: 'Hisob',
      title: { uz: 'Hisob va davr', ru: 'Счёт и период', en: 'Account and period' },
      purpose: {
        uz: 'Ko‘chirma qaysi hisob va qaysi davr uchun ekanini aytadi.',
        ru: 'Говорит, за какой счёт и период выписка.',
        en: 'Says which account and which period this statement covers.',
      },
      singleRow: true,
      required: true,
      columns: [
        column(
          'accountName',
          ['Hisob nomi', 'Название счёта', 'Account name'],
          'text',
          'Bank · USD',
          [
            '«Hisoblar» varag‘idagi nom bilan bir xil bo‘lsin.',
            'Должно совпадать с названием на листе «Счета».',
            'Must match the name on the Accounts sheet.',
          ],
          required({ width: 24 }),
        ),
        column(
          'accountNumber',
          ['Hisob raqami', 'Номер счёта', 'Account number'],
          'text',
          '2020 8000 1234 5678 901',
          [
            'Bankdagi raqam. Ixtiyoriy, lekin bir xil nomli ikki hisobni ajratadi.',
            'Номер в банке. Необязательно, но различает два счёта с одним названием.',
            'The number at the bank. Optional, but it tells two same-named accounts apart.',
          ],
          { width: 26 },
        ),
        column(
          'bank',
          ['Bank', 'Банк', 'Bank'],
          'text',
          'Meridian Bank',
          ['Bank nomi.', 'Название банка.', 'The bank’s name.'],
          { width: 20 },
        ),
        currencyColumn(),
        column(
          'from',
          ['Davr boshi', 'Начало периода', 'Period from'],
          'date',
          '2026-01-01',
          [
            'Ko‘chirma qamrab olgan birinchi kun.',
            'Первый день, который покрывает выписка.',
            'The first day the statement covers.',
          ],
          required({ width: 14 }),
        ),
        column(
          'to',
          ['Davr oxiri', 'Конец периода', 'Period to'],
          'date',
          '2026-01-31',
          ['Oxirgi kun.', 'Последний день.', 'The last day.'],
          required({ width: 14 }),
        ),
        amountColumn(
          'openingBalance',
          ['Boshlang‘ich qoldiq', 'Начальный остаток', 'Opening balance'],
          [
            'Davr boshidagi qoldiq, bank aytganicha. Manfiy bo‘lsa minus bilan.',
            'Остаток на начало по данным банка. Отрицательный — со знаком минус.',
            'The balance at the start, as the bank states it. Minus sign if overdrawn.',
          ],
          required({ width: 20 }),
        ),
        amountColumn(
          'closingBalance',
          ['Yakuniy qoldiq', 'Конечный остаток', 'Closing balance'],
          [
            'Davr oxiridagi qoldiq. Tizim qatorlardan hisoblab, shu raqam bilan solishtiradi.',
            'Остаток на конец. Система считает по строкам и сверяет с этим числом.',
            'The balance at the end. The rows are added up and checked against it.',
          ],
          required({ width: 20 }),
        ),
      ],
    },
    {
      name: 'Kochirma',
      title: { uz: 'Operatsiyalar', ru: 'Операции', en: 'Operations' },
      purpose: {
        uz: 'Har bir bank operatsiyasi — bitta qator.',
        ru: 'Каждая банковская операция — одна строка.',
        en: 'One row per bank operation.',
      },
      singleRow: false,
      required: true,
      columns: [
        column(
          'date',
          ['Sana', 'Дата', 'Date'],
          'date',
          '2026-01-09',
          [
            'Pul haqiqatan harakat qilgan kun. Hisob-faktura sanasi emas.',
            'День, когда деньги реально прошли. Не дата счёта.',
            'The day the money actually moved. Not the invoice date.',
          ],
          required({ width: 13 }),
        ),
        column(
          'documentNumber',
          ['Hujjat raqami', 'Номер документа', 'Document no'],
          'text',
          '000142',
          [
            'Bankdagi hujjat raqami. Bir xil faylni ikki marta yuklasangiz, takrorlanishni shu ushlaydi.',
            'Номер документа в банке. Защищает от повторной загрузки того же файла.',
            'The bank’s document number. It is what stops the same file loading twice.',
          ],
          { width: 16 },
        ),
        amountColumn(
          'receipt',
          ['Kirim', 'Приход', 'Receipt'],
          [
            'Hisobga tushgan summa. Chiqim bo‘lsa, bu yerni bo‘sh qoldiring.',
            'Сумма, поступившая на счёт. Если это расход — оставьте пустым.',
            'Money in. Leave empty when the row is a payment.',
          ],
        ),
        amountColumn(
          'payment',
          ['Chiqim', 'Расход', 'Payment'],
          [
            'Hisobdan chiqqan summa. Kirim bo‘lsa, bu yerni bo‘sh qoldiring.',
            'Сумма, списанная со счёта. Если это приход — оставьте пустым.',
            'Money out. Leave empty when the row is a receipt.',
          ],
        ),
        counterpartyColumn(),
        column(
          'counterpartyTaxId',
          ['Kontragent STIR', 'ИНН контрагента', 'Counterparty tax id'],
          'text',
          '301234567',
          [
            'Ixtiyoriy. Bir xil nomli ikki kontragentni ajratadi.',
            'Необязательно. Различает двух контрагентов с одинаковым названием.',
            'Optional. It tells two same-named counterparties apart.',
          ],
          { width: 16 },
        ),
        column(
          'purpose',
          ['To‘lov maqsadi', 'Назначение платежа', 'Payment purpose'],
          'text',
          'Shartnoma 12/26 bo‘yicha xizmat uchun',
          [
            'Bankdagi matn. Qoldiring — keyin qoidalar shu matndan moddani o‘zi topadi.',
            'Текст из банка. Оставьте — правила потом сами определят статью по этому тексту.',
            'The bank’s own text. Keep it: the rules will later read the article out of it.',
          ],
          { width: 42 },
        ),
        articleColumn(),
        directionColumn(),
        noteColumn(),
      ],
    },
  ],
};
