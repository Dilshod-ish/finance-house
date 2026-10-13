-- A reversal of an entry that sits in a now-locked period was impossible:
-- stamping `reversed_by_id` on the original is an UPDATE whose accrual_date
-- falls inside the lock, so the I2 trigger refused it — and I2's own rule is
-- that corrections ARE made by reversal. The financial correction lands in the
-- open period; only a back-reference touches the locked one.
--
-- The I2 triggers therefore fire on INSERT alone. UPDATE and DELETE are already
-- governed by the I4 triggers, which refuse everything except that one
-- reversed_by_id stamp, so no figure inside a locked period can move.

DROP TRIGGER IF EXISTS journal_entry_period_open_ck ON "journal_entry";--> statement-breakpoint
DROP TRIGGER IF EXISTS journal_line_period_open_ck ON "journal_line";--> statement-breakpoint

CREATE OR REPLACE FUNCTION fincore_assert_period_open() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_org uuid;
  v_entity uuid;
  v_date date;
  v_locked date;
BEGIN
  IF TG_TABLE_NAME = 'journal_entry' THEN
    v_org := NEW.org_id;
    v_entity := NEW.legal_entity_id;
    v_date := NEW.accrual_date;
  ELSE
    SELECT e.org_id, e.legal_entity_id, e.accrual_date
      INTO v_org, v_entity, v_date
      FROM journal_entry e
     WHERE e.id = NEW.entry_id;
  END IF;

  SELECT pl.locked_through_date INTO v_locked
    FROM period_lock pl
   WHERE pl.org_id = v_org AND pl.legal_entity_id = v_entity;

  IF v_locked IS NOT NULL AND v_date <= v_locked THEN
    RAISE EXCEPTION
      'I2: period is locked through % for legal entity %; an entry dated % is refused. Post a reversal in an open period instead',
      v_locked, v_entity, v_date USING ERRCODE = 'FI002';
  END IF;

  RETURN NEW;
END
$$;
--> statement-breakpoint

CREATE TRIGGER journal_entry_period_open_ck
  BEFORE INSERT ON "journal_entry"
  FOR EACH ROW EXECUTE FUNCTION fincore_assert_period_open();
--> statement-breakpoint

CREATE TRIGGER journal_line_period_open_ck
  BEFORE INSERT ON "journal_line"
  FOR EACH ROW EXECUTE FUNCTION fincore_assert_period_open();
