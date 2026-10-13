ALTER TABLE "gl_account" DROP CONSTRAINT IF EXISTS "gl_account_role_ck";
DROP INDEX IF EXISTS "gl_account_org_role_idx";
ALTER TABLE "gl_account" DROP COLUMN IF EXISTS "role";
