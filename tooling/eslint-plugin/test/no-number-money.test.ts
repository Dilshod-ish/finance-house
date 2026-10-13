import { RuleTester } from '@typescript-eslint/rule-tester';
import { afterAll, describe, it } from 'vitest';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { noNumberMoney } from '../src/no-number-money.js';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixture');

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      projectService: { allowDefaultProject: ['*.ts*'] },
      tsconfigRootDir: fixture,
    },
  },
});

ruleTester.run('no-number-money', noNumberMoney, {
  valid: [
    // Money represented properly.
    { code: 'declare class Decimal {}\nconst amount: Decimal = new Decimal();' },
    { code: 'const amountRaw: string = "12.5000";' },
    // Names that are not monetary.
    { code: 'const quantity: number = 3;' },
    { code: 'const lineCount: number = 3;' },
    // Explicitly allowed by configuration.
    {
      code: 'const totalCount: number = 3;',
      options: [{ allow: ['totalCount'] }],
    },
    // Non-identifier / computed keys are ignored.
    { code: 'const key = "amount"; const o = { [key]: 1 };' },
    { code: 'const [amount] = ["x"] as const;' },
    { code: 'function f(...rest: string[]) { return rest; }' },
    { code: 'class C { 1 = 2; }' },
    { code: 'class C { ["amount"]() { return 1; } }' },
    { code: 'function noAnnotation(total) { return total; }' },
    { code: 'interface I { method(): void }' },
    { code: 'declare function g(): void;' },
  ],
  invalid: [
    {
      code: 'const amount: number = 1;',
      errors: [{ messageId: 'numberMoney', data: { name: 'amount' } }],
    },
    {
      code: 'let runningBalance = 0;',
      errors: [{ messageId: 'numberMoney' }],
    },
    {
      code: 'const priceOrNothing: number | null = null;',
      errors: [{ messageId: 'numberMoney' }],
    },
    {
      code: 'function f(unitPrice: number) { return unitPrice; }',
      errors: [{ messageId: 'numberMoney' }],
    },
    {
      code: 'function f(cost: number = 0) { return cost; }',
      errors: [{ messageId: 'numberMoney' }],
    },
    {
      code: 'const f = function (revenue: number) { return revenue; };',
      errors: [{ messageId: 'numberMoney' }],
    },
    {
      code: 'const f = (grossTotal: number) => grossTotal;',
      errors: [{ messageId: 'numberMoney' }],
    },
    {
      code: 'type F = (sumOfLines: number) => void;',
      errors: [{ messageId: 'numberMoney' }],
    },
    {
      code: 'function totalOwed(): number { return 1; }',
      errors: [{ messageId: 'numberMoney' }],
    },
    {
      code: 'declare function costOf(): number;',
      errors: [{ messageId: 'numberMoney' }],
    },
    {
      code: 'class C { totalDue: number = 1; }',
      errors: [{ messageId: 'numberMoney' }],
    },
    {
      code: 'class C { get balance(): number { return 1; } }',
      errors: [{ messageId: 'numberMoney' }],
    },
    {
      code: 'interface I { amountFunctional: number }',
      errors: [{ messageId: 'numberMoney' }],
    },
    {
      code: 'interface I { totalOf(): number }',
      errors: [{ messageId: 'numberMoney' }],
    },
    {
      code: 'interface I { apply(amount: number): void }',
      errors: [{ messageId: 'numberMoney' }],
    },
    {
      code: 'const o = { "total": 1 };',
      errors: [{ messageId: 'numberMoney' }],
    },
    {
      code: 'const amount = 1; const o = { amount };',
      errors: [{ messageId: 'numberMoney' }, { messageId: 'numberMoney' }],
    },
  ],
});
