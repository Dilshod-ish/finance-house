import { z } from 'zod';

/**
 * Environment, validated once at boot. Anything missing or malformed stops the
 * process — a financial API that starts with half a configuration is worse than
 * one that does not start (CLAUDE.md §9: fail loudly).
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  DATABASE_URL: z.string().min(1),
  /**
   * Opt-in to resolving the tenant from a request header, for development
   * before authentication exists. Refused in production — see
   * `resolveOrgContext`.
   */
  FINCORE_INSECURE_ORG_HEADER: z
    .enum(['0', '1'])
    .default('0')
    .transform((value) => value === '1'),
  /** Comma-separated browser origins allowed to call this API. */
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    ),
});

export interface Env {
  readonly nodeEnv: 'development' | 'test' | 'production';
  readonly port: number;
  readonly databaseUrl: string;
  readonly insecureOrgHeader: boolean;
  readonly corsOrigins: readonly string[];
}

export const ENV = 'FINCORE_ENV';

export function readEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment:\n${problems}`);
  }
  return {
    nodeEnv: parsed.data.NODE_ENV,
    port: parsed.data.PORT,
    databaseUrl: parsed.data.DATABASE_URL,
    insecureOrgHeader: parsed.data.FINCORE_INSECURE_ORG_HEADER,
    corsOrigins: parsed.data.CORS_ORIGINS,
  };
}
