import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

// Standalone config: this package *is* the plugin, so it cannot depend on
// @fincore/eslint-config without creating a build cycle.
export default defineConfig(
  { ignores: ['dist/**', 'test/fixture/**'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
);
