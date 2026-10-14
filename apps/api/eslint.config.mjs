import { fincoreConfig } from '@fincore/eslint-config';

export default [
  ...fincoreConfig({ tsconfigRootDir: import.meta.dirname }),
  {
    // A NestJS module is a decorated class with no members — that is the
    // framework's declaration syntax, not a class that should have been an
    // object. The rule stays on everywhere else.
    files: ['src/**/*.module.ts'],
    rules: { '@typescript-eslint/no-extraneous-class': 'off' },
  },
];
