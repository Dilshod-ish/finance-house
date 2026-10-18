/**
 * Every tenant-scoped table (I8). `app_user` is absent on purpose: a human can
 * belong to several organizations, so it carries no `org_id`.
 */
export const TENANT_SCOPED_TABLES = [
  'legal_entity',
  'membership',
  'account',
  'gl_account',
  'article',
  'direction',
  'counterparty',
  'journal_entry',
  'journal_line',
  'fx_rate',
  'period_lock',
  'audit_log',
  'import_batch',
  'cash_operation',
] as const;

export type TenantScopedTable = (typeof TENANT_SCOPED_TABLES)[number];

/** `organization` is scoped by its own `id` rather than an `org_id` column. */
export const ORG_ROOT_TABLE = 'organization';
