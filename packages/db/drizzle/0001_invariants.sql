-- FinCore invariants, enforced in the database (CLAUDE.md §2).
-- Application code is not trusted with any of these.

--------------------------------------------------------------------------------
-- Tenancy helper
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fincore_current_org_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.org_id', true), '')::uuid
$$;
--> statement-breakpoint

COMMENT ON FUNCTION fincore_current_org_id() IS
  'Tenant bound to the current transaction. NULL when unset, so every RLS policy fails closed.';
--> statement-breakpoint

--------------------------------------------------------------------------------
-- I8 — row level security on every tenant-scoped table
--------------------------------------------------------------------------------

ALTER TABLE "organization" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "organization" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "organization_tenant_isolation" ON "organization"
  USING (id = fincore_current_org_id())
  WITH CHECK (id = fincore_current_org_id());
--> statement-breakpoint

ALTER TABLE "legal_entity" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "legal_entity" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "legal_entity_tenant_isolation" ON "legal_entity"
  USING (org_id = fincore_current_org_id()) WITH CHECK (org_id = fincore_current_org_id());
--> statement-breakpoint

ALTER TABLE "membership" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "membership" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "membership_tenant_isolation" ON "membership"
  USING (org_id = fincore_current_org_id()) WITH CHECK (org_id = fincore_current_org_id());
--> statement-breakpoint

ALTER TABLE "account" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "account" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "account_tenant_isolation" ON "account"
  USING (org_id = fincore_current_org_id()) WITH CHECK (org_id = fincore_current_org_id());
--> statement-breakpoint

ALTER TABLE "gl_account" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "gl_account" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "gl_account_tenant_isolation" ON "gl_account"
  USING (org_id = fincore_current_org_id()) WITH CHECK (org_id = fincore_current_org_id());
--> statement-breakpoint

ALTER TABLE "article" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "article" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "article_tenant_isolation" ON "article"
  USING (org_id = fincore_current_org_id()) WITH CHECK (org_id = fincore_current_org_id());
--> statement-breakpoint

ALTER TABLE "direction" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "direction" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "direction_tenant_isolation" ON "direction"
  USING (org_id = fincore_current_org_id()) WITH CHECK (org_id = fincore_current_org_id());
--> statement-breakpoint

ALTER TABLE "counterparty" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "counterparty" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "counterparty_tenant_isolation" ON "counterparty"
  USING (org_id = fincore_current_org_id()) WITH CHECK (org_id = fincore_current_org_id());
--> statement-breakpoint

ALTER TABLE "journal_entry" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "journal_entry" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "journal_entry_tenant_isolation" ON "journal_entry"
  USING (org_id = fincore_current_org_id()) WITH CHECK (org_id = fincore_current_org_id());
--> statement-breakpoint

ALTER TABLE "journal_line" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "journal_line" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "journal_line_tenant_isolation" ON "journal_line"
  USING (org_id = fincore_current_org_id()) WITH CHECK (org_id = fincore_current_org_id());
--> statement-breakpoint

ALTER TABLE "fx_rate" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "fx_rate" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "fx_rate_tenant_isolation" ON "fx_rate"
  USING (org_id = fincore_current_org_id()) WITH CHECK (org_id = fincore_current_org_id());
--> statement-breakpoint

ALTER TABLE "period_lock" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "period_lock" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "period_lock_tenant_isolation" ON "period_lock"
  USING (org_id = fincore_current_org_id()) WITH CHECK (org_id = fincore_current_org_id());
--> statement-breakpoint

ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_log" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "audit_log_tenant_isolation" ON "audit_log"
  USING (org_id = fincore_current_org_id()) WITH CHECK (org_id = fincore_current_org_id());
--> statement-breakpoint

-- app_user is intentionally NOT tenant-scoped: one human, many organizations.
COMMENT ON TABLE "app_user" IS
  'Not tenant-scoped by design (no org_id, no RLS). Tenant access is expressed by membership.';
--> statement-breakpoint

--------------------------------------------------------------------------------
-- I1 — every entry balances in functional currency, checked at COMMIT
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fincore_assert_entry_balanced() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_entry uuid;
  v_lines integer;
  v_delta numeric(20,4);
BEGIN
  IF TG_TABLE_NAME = 'journal_entry' THEN
    v_entry := NEW.id;
  ELSE
    v_entry := NEW.entry_id;
  END IF;

  SELECT count(*),
         coalesce(sum(CASE WHEN side = 'D' THEN amount_functional ELSE -amount_functional END), 0)
    INTO v_lines, v_delta
    FROM journal_line
   WHERE entry_id = v_entry;

  IF v_lines < 2 THEN
    RAISE EXCEPTION 'I1: journal_entry % has % line(s); a double entry needs at least two',
      v_entry, v_lines USING ERRCODE = 'FI001';
  END IF;

  IF v_delta <> 0 THEN
    RAISE EXCEPTION 'I1: journal_entry % is out of balance by % in functional currency',
      v_entry, v_delta USING ERRCODE = 'FI001';
  END IF;

  RETURN NULL;
END
$$;
--> statement-breakpoint

CREATE CONSTRAINT TRIGGER journal_entry_balanced_ck
  AFTER INSERT ON "journal_entry"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION fincore_assert_entry_balanced();
--> statement-breakpoint

CREATE CONSTRAINT TRIGGER journal_line_balanced_ck
  AFTER INSERT ON "journal_line"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION fincore_assert_entry_balanced();
--> statement-breakpoint

--------------------------------------------------------------------------------
-- I2 — no writes into a locked period
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fincore_assert_period_open() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_row record;
  v_org uuid;
  v_entity uuid;
  v_date date;
  v_locked date;
BEGIN
  IF TG_OP = 'DELETE' THEN v_row := OLD; ELSE v_row := NEW; END IF;

  IF TG_TABLE_NAME = 'journal_entry' THEN
    v_org := v_row.org_id;
    v_entity := v_row.legal_entity_id;
    v_date := v_row.accrual_date;
  ELSE
    SELECT e.org_id, e.legal_entity_id, e.accrual_date
      INTO v_org, v_entity, v_date
      FROM journal_entry e
     WHERE e.id = v_row.entry_id;
  END IF;

  SELECT pl.locked_through_date INTO v_locked
    FROM period_lock pl
   WHERE pl.org_id = v_org AND pl.legal_entity_id = v_entity;

  IF v_locked IS NOT NULL AND v_date <= v_locked THEN
    RAISE EXCEPTION
      'I2: period is locked through % for legal entity %; % dated % is refused. Post a reversal in an open period instead',
      v_locked, v_entity, TG_OP, v_date USING ERRCODE = 'FI002';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint

CREATE TRIGGER journal_entry_period_open_ck
  BEFORE INSERT OR UPDATE OR DELETE ON "journal_entry"
  FOR EACH ROW EXECUTE FUNCTION fincore_assert_period_open();
--> statement-breakpoint

CREATE TRIGGER journal_line_period_open_ck
  BEFORE INSERT OR UPDATE OR DELETE ON "journal_line"
  FOR EACH ROW EXECUTE FUNCTION fincore_assert_period_open();
--> statement-breakpoint

--------------------------------------------------------------------------------
-- I4 — the ledger is append-only; corrections are reversals
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fincore_journal_entry_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'I4: journal_entry is append-only; DELETE of % is refused. Post a reversal',
      OLD.id USING ERRCODE = 'FI004';
  END IF;

  -- The single permitted mutation: stamping reversed_by_id once, from NULL.
  IF OLD.reversed_by_id IS NOT NULL THEN
    RAISE EXCEPTION 'I4: journal_entry % is already reversed by %', OLD.id, OLD.reversed_by_id
      USING ERRCODE = 'FI004';
  END IF;

  IF NEW.reversed_by_id IS NULL THEN
    RAISE EXCEPTION
      'I4: journal_entry is append-only; the only permitted UPDATE is setting reversed_by_id (entry %)',
      OLD.id USING ERRCODE = 'FI004';
  END IF;

  IF (NEW.id, NEW.org_id, NEW.legal_entity_id, NEW.accrual_date, NEW.cash_date, NEW.kind,
      NEW.source_type, NEW.source_id, NEW.description, NEW.reverses_id, NEW.reversal_reason,
      NEW.idempotency_key, NEW.posted_at, NEW.posted_by, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.org_id, OLD.legal_entity_id, OLD.accrual_date, OLD.cash_date, OLD.kind,
      OLD.source_type, OLD.source_id, OLD.description, OLD.reverses_id, OLD.reversal_reason,
      OLD.idempotency_key, OLD.posted_at, OLD.posted_by, OLD.created_at) THEN
    RAISE EXCEPTION 'I4: only reversed_by_id may change after posting (entry %)', OLD.id
      USING ERRCODE = 'FI004';
  END IF;

  RETURN NEW;
END
$$;
--> statement-breakpoint

CREATE TRIGGER journal_entry_append_only_ck
  BEFORE UPDATE OR DELETE ON "journal_entry"
  FOR EACH ROW EXECUTE FUNCTION fincore_journal_entry_append_only();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION fincore_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '%: % is append-only; % is refused',
    CASE TG_TABLE_NAME WHEN 'journal_line' THEN 'I4' ELSE 'audit' END,
    TG_TABLE_NAME, TG_OP USING ERRCODE = 'FI004';
END
$$;
--> statement-breakpoint

CREATE TRIGGER journal_line_append_only_ck
  BEFORE UPDATE OR DELETE ON "journal_line"
  FOR EACH ROW EXECUTE FUNCTION fincore_append_only();
--> statement-breakpoint

CREATE TRIGGER audit_log_append_only_ck
  BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION fincore_append_only();
--> statement-breakpoint

--------------------------------------------------------------------------------
-- Least-privilege application role. Tests SET ROLE to it, because a superuser
-- and a table owner without FORCE would silently bypass every policy above.
--------------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fincore_app') THEN
    RAISE EXCEPTION
      'Role fincore_app is missing. Provision it first (docker/initdb/01-roles.sql); RLS is untestable without a non-owner role';
  END IF;

  GRANT USAGE ON SCHEMA public TO fincore_app;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO fincore_app;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO fincore_app;
END
$$;
