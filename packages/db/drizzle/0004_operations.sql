-- M2, the operations module: the two tables that feed the ledger with cash
-- movements, plus the clearing account role an unclassified movement needs.
--
-- `cash_operation` is a source document, not a second ledger. It records what
-- the statement said and what the person classified it as; what it did to the
-- books is in `journal_entry` alone, found through `source_type`/`source_id`
-- (I3). There is deliberately no `entry_id` column here: reassigning an
-- article reverses the entry and posts a new one (I4), so a pointer would be a
-- mutable second truth about which entry is live. The live entry is the one
-- with `reversed_by_id is null and kind <> 'reversal'`.

-- `suspense`: the other side of a cash movement nobody has classified yet.
ALTER TABLE "gl_account" DROP CONSTRAINT "gl_account_role_ck";--> statement-breakpoint
ALTER TABLE "gl_account" ADD CONSTRAINT "gl_account_role_ck" CHECK (role in ('cash', 'money_in_transit', 'receivable', 'prepaid', 'inventory', 'input_vat', 'fixed_asset', 'accumulated_depreciation', 'suspense', 'payable', 'advance_received', 'payroll_payable', 'loan', 'accrued_interest', 'output_vat', 'tax_payable', 'share_capital', 'retained_earnings', 'owner_draw', 'revenue', 'other_income', 'cost_of_sales', 'expense', 'depreciation', 'interest_expense', 'tax_expense', 'fx_difference'));--> statement-breakpoint

CREATE TABLE "import_batch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"template" text NOT NULL,
	"file_name" text NOT NULL,
	"file_hash" text NOT NULL,
	"row_count" integer NOT NULL,
	"posted_count" integer NOT NULL,
	"duplicate_count" integer NOT NULL,
	"period_from" date,
	"period_to" date,
	"opening_balance" numeric(20, 4),
	"closing_balance" numeric(20, 4),
	"status" text NOT NULL,
	"imported_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reverted_at" timestamp with time zone,
	"reverted_by" uuid,
	"reverted_reason" text,
	CONSTRAINT "import_batch_id_org_uq" UNIQUE("id","org_id"),
	CONSTRAINT "import_batch_status_ck" CHECK (status in ('imported', 'reverted')),
	CONSTRAINT "import_batch_counts_ck" CHECK (row_count >= 0 and posted_count >= 0 and duplicate_count >= 0 and posted_count + duplicate_count <= row_count),
	CONSTRAINT "import_batch_period_order_ck" CHECK (period_from is null or period_to is null or period_from <= period_to),
	-- A reverted batch always says when, and an imported one never does.
	CONSTRAINT "import_batch_reverted_shape_ck" CHECK ((status = 'reverted') = (reverted_at is not null))
);
--> statement-breakpoint

ALTER TABLE "import_batch" ADD CONSTRAINT "import_batch_org_fk" FOREIGN KEY ("org_id") REFERENCES "organization"("id") ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "import_batch" ADD CONSTRAINT "import_batch_legal_entity_fk" FOREIGN KEY ("legal_entity_id","org_id") REFERENCES "legal_entity"("id","org_id") ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "import_batch" ADD CONSTRAINT "import_batch_account_fk" FOREIGN KEY ("account_id","org_id") REFERENCES "account"("id","org_id") ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "import_batch" ADD CONSTRAINT "import_batch_imported_by_fk" FOREIGN KEY ("imported_by") REFERENCES "app_user"("id") ON DELETE set null;--> statement-breakpoint
ALTER TABLE "import_batch" ADD CONSTRAINT "import_batch_reverted_by_fk" FOREIGN KEY ("reverted_by") REFERENCES "app_user"("id") ON DELETE set null;--> statement-breakpoint

CREATE INDEX "import_batch_org_created_idx" ON "import_batch" USING btree ("org_id","created_at");--> statement-breakpoint
-- The same bytes cannot be imported twice while that import still stands.
-- Partial, so a file may be re-imported after its batch has been reverted.
CREATE UNIQUE INDEX "import_batch_org_file_hash_uq" ON "import_batch" USING btree ("org_id","file_hash") WHERE status = 'imported';--> statement-breakpoint

CREATE TABLE "cash_operation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"import_batch_id" uuid,
	"row_number" integer,
	"cash_date" date NOT NULL,
	"direction" text NOT NULL,
	"amount" numeric(20, 4) NOT NULL,
	"currency" char(3) NOT NULL,
	"counterparty_id" uuid,
	"article_id" uuid,
	"direction_id" uuid,
	"document_number" text,
	"purpose" text,
	"memo" text,
	"dedup_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_operation_id_org_uq" UNIQUE("id","org_id"),
	CONSTRAINT "cash_operation_direction_ck" CHECK (direction in ('in', 'out')),
	-- The direction column carries the sign; a negative amount would let the
	-- same movement be expressed two ways and break every sum by direction.
	CONSTRAINT "cash_operation_amount_ck" CHECK (amount > 0),
	CONSTRAINT "cash_operation_currency_ck" CHECK (currency ~ '^[A-Z]{3}$'),
	-- A row that came from a file knows which row it was; a hand-entered one
	-- has neither a batch nor a row number.
	CONSTRAINT "cash_operation_row_shape_ck" CHECK ((import_batch_id is null) = (row_number is null))
);
--> statement-breakpoint

ALTER TABLE "cash_operation" ADD CONSTRAINT "cash_operation_org_fk" FOREIGN KEY ("org_id") REFERENCES "organization"("id") ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "cash_operation" ADD CONSTRAINT "cash_operation_legal_entity_fk" FOREIGN KEY ("legal_entity_id","org_id") REFERENCES "legal_entity"("id","org_id") ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "cash_operation" ADD CONSTRAINT "cash_operation_account_fk" FOREIGN KEY ("account_id","org_id") REFERENCES "account"("id","org_id") ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "cash_operation" ADD CONSTRAINT "cash_operation_batch_fk" FOREIGN KEY ("import_batch_id","org_id") REFERENCES "import_batch"("id","org_id") ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "cash_operation" ADD CONSTRAINT "cash_operation_counterparty_fk" FOREIGN KEY ("counterparty_id","org_id") REFERENCES "counterparty"("id","org_id") ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "cash_operation" ADD CONSTRAINT "cash_operation_article_fk" FOREIGN KEY ("article_id","org_id") REFERENCES "article"("id","org_id") ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "cash_operation" ADD CONSTRAINT "cash_operation_direction_fk" FOREIGN KEY ("direction_id","org_id") REFERENCES "direction"("id","org_id") ON DELETE restrict;--> statement-breakpoint

CREATE INDEX "cash_operation_org_account_date_idx" ON "cash_operation" USING btree ("org_id","account_id","cash_date");--> statement-breakpoint
-- Duplicate detection looks up by hash, not by scanning the account.
CREATE INDEX "cash_operation_org_dedup_idx" ON "cash_operation" USING btree ("org_id","dedup_hash");--> statement-breakpoint
CREATE INDEX "cash_operation_org_batch_idx" ON "cash_operation" USING btree ("org_id","import_batch_id");--> statement-breakpoint
-- The inbox: everything still waiting for an article.
CREATE INDEX "cash_operation_org_unassigned_idx" ON "cash_operation" USING btree ("org_id","cash_date") WHERE article_id IS NULL;--> statement-breakpoint

ALTER TABLE "import_batch" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "import_batch" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "import_batch_tenant_isolation" ON "import_batch"
  USING (org_id = fincore_current_org_id()) WITH CHECK (org_id = fincore_current_org_id());
--> statement-breakpoint

ALTER TABLE "cash_operation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cash_operation" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "cash_operation_tenant_isolation" ON "cash_operation"
  USING (org_id = fincore_current_org_id()) WITH CHECK (org_id = fincore_current_org_id());
