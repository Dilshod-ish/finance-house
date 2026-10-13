import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import importX from 'eslint-plugin-import-x';
import fincore from '@fincore/eslint-plugin';

/** Test files: the money-name rule is relaxed, everything else still applies. */
export const TEST_GLOBS = [
  '**/*.test.ts',
  '**/*.spec.ts',
  '**/test/**/*.ts',
  '**/tests/**/*.ts',
  '**/__tests__/**/*.ts',
];

/**
 * Shared flat config. `tsconfigRootDir` must be the package root so that
 * type-aware rules (notably @fincore/no-number-money) can resolve types.
 */
export function fincoreConfig({ tsconfigRootDir, ignores = [] } = {}) {
  return defineConfig(
    {
      ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**', '**/.turbo/**', ...ignores],
    },
    js.configs.recommended,
    ...tseslint.configs.strictTypeChecked,
    ...tseslint.configs.stylisticTypeChecked,
    {
      languageOptions: {
        globals: { ...globals.node },
        parserOptions: {
          projectService: true,
          tsconfigRootDir,
        },
      },
      plugins: {
        '@fincore': fincore,
        'import-x': importX,
      },
      rules: {
        '@fincore/no-number-money': 'error',
        '@typescript-eslint/consistent-type-imports': [
          'error',
          { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
        ],
        '@typescript-eslint/explicit-module-boundary-types': 'error',
        '@typescript-eslint/no-floating-promises': 'error',
        '@typescript-eslint/restrict-template-expressions': [
          'error',
          { allowNumber: true, allowBoolean: false, allowNullish: false },
        ],
        '@typescript-eslint/switch-exhaustiveness-check': 'error',
        'import-x/no-cycle': 'error',
        'no-console': 'error',
        eqeqeq: ['error', 'always'],
      },
    },
    {
      // I9/§9: financial code paths fail loudly; scripts may print.
      files: ['**/scripts/**/*.ts', '**/seed/**/*.ts', '**/*.cli.ts'],
      rules: { 'no-console': 'off' },
    },
    {
      files: TEST_GLOBS,
      rules: {
        '@fincore/no-number-money': 'off',
        '@typescript-eslint/no-non-null-assertion': 'off',
        '@typescript-eslint/explicit-module-boundary-types': 'off',
        'no-console': 'off',
      },
    },
    prettier,
  );
}

export default fincoreConfig;
