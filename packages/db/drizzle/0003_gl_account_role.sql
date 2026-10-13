-- `gl_account.role` is what a report groups by: cash, receivable, loan,
-- retained_earnings and so on. Adding it is not a plain backfill — the role
-- decides which balance-sheet line an account lands on, and the database holds
-- no signal that would let us derive it. A wrong guess moves money across the
-- balance sheet silently, so this migration refuses to guess.

ALTER TABLE "gl_account" ADD COLUMN "role" text;--> statement-breakpoint

-- The guard below has to see every tenant's rows. Under FORCE row level
-- security even the table owner sees none unless app.org_id is set, so the
-- count would come back zero and the guard would pass on a database full of
-- unroled accounts. Dropped for the length of this transaction only: if the
-- guard raises, this is rolled back with it.
ALTER TABLE "gl_account" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint

DO $$
DECLARE
  v_rows bigint;
BEGIN
  SELECT count(*) INTO v_rows FROM gl_account WHERE role IS NULL;
  IF v_rows > 0 THEN
    RAISE EXCEPTION
      'gl_account.role cannot be derived from the database: % account(s) need one. In development run `pnpm db:reset`; otherwise backfill each account from its organization region pack template before applying this migration',
      v_rows
      USING ERRCODE = 'FI005';
  END IF;
END
$$;
--> statement-breakpoint

ALTER TABLE "gl_account" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

ALTER TABLE "gl_account" ALTER COLUMN "role" SET NOT NULL;--> statement-breakpoint

-- §5.3: every balance-sheet and P&L grouping starts from (org_id, role).
CREATE INDEX "gl_account_org_role_idx" ON "gl_account" USING btree ("org_id","role");--> statement-breakpoint

ALTER TABLE "gl_account" ADD CONSTRAINT "gl_account_role_ck" CHECK (role in ('cash', 'money_in_transit', 'receivable', 'prepaid', 'inventory', 'input_vat', 'fixed_asset', 'accumulated_depreciation', 'payable', 'advance_received', 'payroll_payable', 'loan', 'accrued_interest', 'output_vat', 'tax_payable', 'share_capital', 'retained_earnings', 'owner_draw', 'revenue', 'other_income', 'cost_of_sales', 'expense', 'depreciation', 'interest_expense', 'tax_expense', 'fx_difference'));
