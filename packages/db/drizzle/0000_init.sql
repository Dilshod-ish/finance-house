CREATE TABLE "app_user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "legal_entity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"legal_form" text,
	"tax_id" text,
	"functional_currency" char(3) NOT NULL,
	"tax_regime" text,
	"vat_registered" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legal_entity_id_org_uq" UNIQUE("id","org_id")
);
--> statement-breakpoint
CREATE TABLE "membership" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_org_user_uq" UNIQUE("org_id","user_id"),
	CONSTRAINT "membership_role_ck" CHECK (role in ('owner', 'cfo', 'accountant', 'operator', 'head_of_direction', 'viewer', 'auditor'))
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"base_currency" char(3) NOT NULL,
	"country_code" char(2) NOT NULL,
	"region_pack" text NOT NULL,
	"fiscal_year_start" smallint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"currency" char(3) NOT NULL,
	"bank_code" text,
	"iban" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_id_org_uq" UNIQUE("id","org_id"),
	CONSTRAINT "account_kind_ck" CHECK (kind in ('bank', 'cash', 'card', 'ewallet', 'acquiring', 'virtual'))
);
--> statement-breakpoint
CREATE TABLE "article" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"flow_type" text NOT NULL,
	"gl_account_id" uuid NOT NULL,
	"pnl_line_code" text,
	"vat_rate" numeric(5, 2),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "article_id_org_uq" UNIQUE("id","org_id"),
	CONSTRAINT "article_flow_type_ck" CHECK (flow_type in ('revenue', 'cogs', 'opex_variable', 'opex_fixed', 'below_ebitda', 'below_net_profit', 'financing', 'investing', 'transfer')),
	CONSTRAINT "article_no_self_parent_ck" CHECK (parent_id is distinct from id)
);
--> statement-breakpoint
CREATE TABLE "counterparty" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"tax_id" text,
	"kinds" text[] DEFAULT '{}'::text[] NOT NULL,
	"payment_terms_days" integer,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "counterparty_id_org_uq" UNIQUE("id","org_id"),
	CONSTRAINT "counterparty_kinds_ck" CHECK (kinds <@ array['customer', 'supplier', 'employee', 'bank', 'gov', 'owner']::text[])
);
--> statement-breakpoint
CREATE TABLE "direction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "direction_id_org_uq" UNIQUE("id","org_id"),
	CONSTRAINT "direction_no_self_parent_ck" CHECK (parent_id is distinct from id)
);
--> statement-breakpoint
CREATE TABLE "gl_account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"normal_side" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gl_account_org_code_uq" UNIQUE("org_id","code"),
	CONSTRAINT "gl_account_id_org_uq" UNIQUE("id","org_id"),
	CONSTRAINT "gl_account_type_ck" CHECK (type in ('asset', 'liability', 'equity', 'income', 'expense')),
	CONSTRAINT "gl_account_normal_side_ck" CHECK (normal_side in ('D', 'C'))
);
--> statement-breakpoint
CREATE TABLE "journal_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"accrual_date" date NOT NULL,
	"cash_date" date,
	"kind" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" uuid,
	"description" text,
	"reversed_by_id" uuid,
	"reverses_id" uuid,
	"reversal_reason" text,
	"idempotency_key" text,
	"posted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"posted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journal_entry_id_org_uq" UNIQUE("id","org_id"),
	CONSTRAINT "journal_entry_org_idempotency_uq" UNIQUE("org_id","idempotency_key"),
	CONSTRAINT "journal_entry_kind_ck" CHECK (kind in ('cash', 'accrual', 'payroll', 'depreciation', 'tax', 'loan', 'allocation', 'fx_revaluation', 'opening', 'closing', 'manual', 'reversal')),
	CONSTRAINT "journal_entry_no_self_reverse_ck" CHECK (reversed_by_id is distinct from id),
	CONSTRAINT "journal_entry_no_self_reverses_ck" CHECK (reverses_id is distinct from id),
	CONSTRAINT "journal_entry_source_type_ck" CHECK (length(btrim(source_type)) > 0),
	CONSTRAINT "journal_entry_reversal_shape_ck" CHECK ((kind = 'reversal') = (reverses_id is not null))
);
--> statement-breakpoint
CREATE TABLE "journal_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"gl_account_id" uuid NOT NULL,
	"side" text NOT NULL,
	"amount" numeric(20, 4) NOT NULL,
	"currency" char(3) NOT NULL,
	"fx_rate" numeric(20, 10) NOT NULL,
	"amount_functional" numeric(20, 4) NOT NULL,
	"source_type" text NOT NULL,
	"source_id" uuid,
	"account_id" uuid,
	"article_id" uuid,
	"direction_id" uuid,
	"counterparty_id" uuid,
	"deal_id" uuid,
	"project_id" uuid,
	"employee_id" uuid,
	"cost_center_id" uuid,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"memo" text,
	CONSTRAINT "journal_line_side_ck" CHECK (side in ('D', 'C')),
	CONSTRAINT "journal_line_amount_positive_ck" CHECK (amount > 0),
	CONSTRAINT "journal_line_amount_functional_positive_ck" CHECK (amount_functional > 0),
	CONSTRAINT "journal_line_fx_rate_positive_ck" CHECK (fx_rate > 0),
	CONSTRAINT "journal_line_source_type_ck" CHECK (length(btrim(source_type)) > 0)
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_log_action_ck" CHECK (length(btrim(action)) > 0)
);
--> statement-breakpoint
CREATE TABLE "fx_rate" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"as_of_date" date NOT NULL,
	"base_currency" char(3) NOT NULL,
	"quote_currency" char(3) NOT NULL,
	"rate" numeric(20, 10) NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fx_rate_org_date_pair_source_uq" UNIQUE("org_id","as_of_date","base_currency","quote_currency","source"),
	CONSTRAINT "fx_rate_positive_ck" CHECK (rate > 0),
	CONSTRAINT "fx_rate_distinct_currencies_ck" CHECK (base_currency <> quote_currency)
);
--> statement-breakpoint
CREATE TABLE "period_lock" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"locked_through_date" date NOT NULL,
	"locked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_by" uuid,
	"note" text,
	CONSTRAINT "period_lock_entity_uq" UNIQUE("org_id","legal_entity_id")
);
--> statement-breakpoint
ALTER TABLE "legal_entity" ADD CONSTRAINT "legal_entity_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_legal_entity_id_legal_entity_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entity"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article" ADD CONSTRAINT "article_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article" ADD CONSTRAINT "article_parent_id_article_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."article"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article" ADD CONSTRAINT "article_gl_account_id_gl_account_id_fk" FOREIGN KEY ("gl_account_id") REFERENCES "public"."gl_account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "counterparty" ADD CONSTRAINT "counterparty_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direction" ADD CONSTRAINT "direction_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direction" ADD CONSTRAINT "direction_parent_id_direction_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."direction"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gl_account" ADD CONSTRAINT "gl_account_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry" ADD CONSTRAINT "journal_entry_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry" ADD CONSTRAINT "journal_entry_reversed_by_id_journal_entry_id_fk" FOREIGN KEY ("reversed_by_id") REFERENCES "public"."journal_entry"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry" ADD CONSTRAINT "journal_entry_reverses_id_journal_entry_id_fk" FOREIGN KEY ("reverses_id") REFERENCES "public"."journal_entry"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry" ADD CONSTRAINT "journal_entry_posted_by_app_user_id_fk" FOREIGN KEY ("posted_by") REFERENCES "public"."app_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry" ADD CONSTRAINT "journal_entry_legal_entity_fk" FOREIGN KEY ("legal_entity_id","org_id") REFERENCES "public"."legal_entity"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_line" ADD CONSTRAINT "journal_line_entry_fk" FOREIGN KEY ("entry_id","org_id") REFERENCES "public"."journal_entry"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_line" ADD CONSTRAINT "journal_line_gl_account_fk" FOREIGN KEY ("gl_account_id","org_id") REFERENCES "public"."gl_account"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_line" ADD CONSTRAINT "journal_line_account_fk" FOREIGN KEY ("account_id","org_id") REFERENCES "public"."account"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_line" ADD CONSTRAINT "journal_line_article_fk" FOREIGN KEY ("article_id","org_id") REFERENCES "public"."article"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_line" ADD CONSTRAINT "journal_line_direction_fk" FOREIGN KEY ("direction_id","org_id") REFERENCES "public"."direction"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_line" ADD CONSTRAINT "journal_line_counterparty_fk" FOREIGN KEY ("counterparty_id","org_id") REFERENCES "public"."counterparty"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_app_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."app_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fx_rate" ADD CONSTRAINT "fx_rate_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_lock" ADD CONSTRAINT "period_lock_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_lock" ADD CONSTRAINT "period_lock_legal_entity_id_legal_entity_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entity"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_lock" ADD CONSTRAINT "period_lock_locked_by_app_user_id_fk" FOREIGN KEY ("locked_by") REFERENCES "public"."app_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "legal_entity_org_idx" ON "legal_entity" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "membership_user_idx" ON "membership" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "account_org_idx" ON "account" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "account_org_legal_entity_idx" ON "account" USING btree ("org_id","legal_entity_id");--> statement-breakpoint
CREATE INDEX "article_org_idx" ON "article" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "article_org_parent_idx" ON "article" USING btree ("org_id","parent_id");--> statement-breakpoint
CREATE INDEX "counterparty_org_idx" ON "counterparty" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "direction_org_idx" ON "direction" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "journal_entry_org_entity_accrual_idx" ON "journal_entry" USING btree ("org_id","legal_entity_id","accrual_date");--> statement-breakpoint
CREATE INDEX "journal_entry_org_cash_date_idx" ON "journal_entry" USING btree ("org_id","cash_date") WHERE cash_date is not null;--> statement-breakpoint
CREATE INDEX "journal_entry_org_source_idx" ON "journal_entry" USING btree ("org_id","source_type","source_id");--> statement-breakpoint
CREATE INDEX "journal_entry_reverses_idx" ON "journal_entry" USING btree ("reverses_id") WHERE reverses_id is not null;--> statement-breakpoint
CREATE INDEX "journal_line_org_gl_entry_idx" ON "journal_line" USING btree ("org_id","gl_account_id","entry_id");--> statement-breakpoint
CREATE INDEX "journal_line_entry_idx" ON "journal_line" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "journal_line_org_direction_idx" ON "journal_line" USING btree ("org_id","direction_id") WHERE direction_id is not null;--> statement-breakpoint
CREATE INDEX "journal_line_org_account_idx" ON "journal_line" USING btree ("org_id","account_id") WHERE account_id is not null;--> statement-breakpoint
CREATE INDEX "journal_line_org_article_idx" ON "journal_line" USING btree ("org_id","article_id") WHERE article_id is not null;--> statement-breakpoint
CREATE INDEX "journal_line_org_counterparty_idx" ON "journal_line" USING btree ("org_id","counterparty_id") WHERE counterparty_id is not null;--> statement-breakpoint
CREATE INDEX "journal_line_org_source_idx" ON "journal_line" USING btree ("org_id","source_type","source_id");--> statement-breakpoint
CREATE INDEX "audit_log_org_at_idx" ON "audit_log" USING btree ("org_id","at");--> statement-breakpoint
CREATE INDEX "audit_log_org_entity_idx" ON "audit_log" USING btree ("org_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "fx_rate_org_pair_date_idx" ON "fx_rate" USING btree ("org_id","base_currency","quote_currency","as_of_date");--> statement-breakpoint
CREATE INDEX "period_lock_org_idx" ON "period_lock" USING btree ("org_id");