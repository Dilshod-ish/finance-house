import { noNumberMoney } from './no-number-money.js';

export const rules = {
  'no-number-money': noNumberMoney,
};

export const plugin = {
  meta: { name: '@fincore/eslint-plugin', version: '0.0.0' },
  rules,
};

export default plugin;
export { noNumberMoney, MONEY_NAME_PATTERN } from './no-number-money.js';
