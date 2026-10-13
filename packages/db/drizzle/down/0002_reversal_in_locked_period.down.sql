DROP TRIGGER IF EXISTS journal_entry_period_open_ck ON "journal_entry";
DROP TRIGGER IF EXISTS journal_line_period_open_ck ON "journal_line";
DROP FUNCTION IF EXISTS fincore_assert_period_open();
