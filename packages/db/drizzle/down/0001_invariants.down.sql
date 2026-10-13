DROP TRIGGER IF EXISTS audit_log_append_only_ck ON "audit_log";
DROP TRIGGER IF EXISTS journal_line_append_only_ck ON "journal_line";
DROP TRIGGER IF EXISTS journal_entry_append_only_ck ON "journal_entry";
DROP TRIGGER IF EXISTS journal_line_period_open_ck ON "journal_line";
DROP TRIGGER IF EXISTS journal_entry_period_open_ck ON "journal_entry";
DROP TRIGGER IF EXISTS journal_line_balanced_ck ON "journal_line";
DROP TRIGGER IF EXISTS journal_entry_balanced_ck ON "journal_entry";

DROP FUNCTION IF EXISTS fincore_append_only();
DROP FUNCTION IF EXISTS fincore_journal_entry_append_only();
DROP FUNCTION IF EXISTS fincore_assert_period_open();
DROP FUNCTION IF EXISTS fincore_assert_entry_balanced();

DROP POLICY IF EXISTS "audit_log_tenant_isolation" ON "audit_log";
DROP POLICY IF EXISTS "period_lock_tenant_isolation" ON "period_lock";
DROP POLICY IF EXISTS "fx_rate_tenant_isolation" ON "fx_rate";
DROP POLICY IF EXISTS "journal_line_tenant_isolation" ON "journal_line";
DROP POLICY IF EXISTS "journal_entry_tenant_isolation" ON "journal_entry";
DROP POLICY IF EXISTS "counterparty_tenant_isolation" ON "counterparty";
DROP POLICY IF EXISTS "direction_tenant_isolation" ON "direction";
DROP POLICY IF EXISTS "article_tenant_isolation" ON "article";
DROP POLICY IF EXISTS "gl_account_tenant_isolation" ON "gl_account";
DROP POLICY IF EXISTS "account_tenant_isolation" ON "account";
DROP POLICY IF EXISTS "membership_tenant_isolation" ON "membership";
DROP POLICY IF EXISTS "legal_entity_tenant_isolation" ON "legal_entity";
DROP POLICY IF EXISTS "organization_tenant_isolation" ON "organization";

ALTER TABLE "audit_log" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "audit_log" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "period_lock" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "period_lock" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "fx_rate" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "fx_rate" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "journal_line" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "journal_line" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "journal_entry" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "journal_entry" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "counterparty" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "counterparty" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "direction" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "direction" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "article" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "article" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "gl_account" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "gl_account" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "account" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "account" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "membership" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "membership" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "legal_entity" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "legal_entity" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "organization" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "organization" DISABLE ROW LEVEL SECURITY;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM fincore_app;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM fincore_app;
REVOKE USAGE ON SCHEMA public FROM fincore_app;

DROP FUNCTION IF EXISTS fincore_current_org_id();
