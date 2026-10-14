import { fincoreConfig } from '@fincore/eslint-config';

export default [
  // Build output and the declaration file Next regenerates on every build.
  { ignores: ['.next/**', 'next-env.d.ts'] },
  ...fincoreConfig({ tsconfigRootDir: import.meta.dirname }),
];
