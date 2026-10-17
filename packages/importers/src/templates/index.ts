import { BANK_STATEMENT_TEMPLATE } from './bank-statement.js';
import { ONBOARDING_TEMPLATE } from './onboarding.js';
import { OPERATIONS_TEMPLATE } from './operations.js';
import type { TemplateSpec } from './types.js';

/** Every file FinCore accepts, in the order a new client fills them. */
export const TEMPLATES: readonly TemplateSpec[] = [
  ONBOARDING_TEMPLATE,
  OPERATIONS_TEMPLATE,
  BANK_STATEMENT_TEMPLATE,
];

export function templateByFile(file: string): TemplateSpec {
  const found = TEMPLATES.find((candidate) => candidate.file === file);
  if (found === undefined) {
    throw new Error(`no template named ${file}; have ${TEMPLATES.map((t) => t.file).join(', ')}`);
  }
  return found;
}

export { BANK_STATEMENT_TEMPLATE, ONBOARDING_TEMPLATE, OPERATIONS_TEMPLATE };
export * from './types.js';
