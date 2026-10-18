-- Dropping the two tables is safe: they hold source documents, and the ledger
-- entries they produced stand on their own (`source_type`/`source_id` simply
-- stop resolving). Narrowing the role list is not safe, so it refuses rather
-- than failing on the constraint with a message about a check violation.

DROP TABLE IF EXISTS "cash_operation";
DROP TABLE IF EXISTS "import_batch";

ALTER TABLE "gl_account" NO FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  v_rows bigint;
BEGIN
  SELECT count(*) INTO v_rows FROM gl_account WHERE role = 'suspense';
  IF v_rows > 0 THEN
    RAISE EXCEPTION
      'cannot drop the suspense role: % account(s) still carry it. Reclassify or remove them first; in development run `pnpm db:reset`',
      v_rows
      USING ERRCODE = 'FI006';
  END IF;
END
$$;

ALTER TABLE "gl_account" FORCE ROW LEVEL SECURITY;

ALTER TABLE "gl_account" DROP CONSTRAINT IF EXISTS "gl_account_role_ck";
ALTER TABLE "gl_account" ADD CONSTRAINT "gl_account_role_ck" CHECK (role in ('cash', 'money_in_transit', 'receivable', 'prepaid', 'inventory', 'input_vat', 'fixed_asset', 'accumulated_depreciation', 'payable', 'advance_received', 'payroll_payable', 'loan', 'accrued_interest', 'output_vat', 'tax_payable', 'share_capital', 'retained_earnings', 'owner_draw', 'revenue', 'other_income', 'cost_of_sales', 'expense', 'depreciation', 'interest_expense', 'tax_expense', 'fx_difference'));
