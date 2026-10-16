import { z } from 'zod';
import { idListSchema, isoDateSchema } from '../http/query.js';

export const balanceSheetQuerySchema = z.object({
  asOf: isoDateSchema,
  legalEntityId: idListSchema,
});

export const pnlQuerySchema = z.object({
  from: isoDateSchema,
  to: isoDateSchema,
  legalEntityId: idListSchema,
  grouping: z.enum(['none', 'article', 'direction', 'direction_article']).default('none'),
  /** `prior` asks the server for the comparable previous period. */
  compareTo: z.enum(['none', 'prior']).default('none'),
});

export const reconciliationQuerySchema = z.object({
  from: isoDateSchema,
  to: isoDateSchema,
  legalEntityId: idListSchema,
  accountId: idListSchema,
});

export const cashFlowQuerySchema = z.object({
  from: isoDateSchema,
  to: isoDateSchema,
  legalEntityId: idListSchema,
  accountId: idListSchema,
  grouping: z.enum(['none', 'article', 'direction', 'counterparty', 'account']).default('none'),
});

export const drilldownQuerySchema = z.object({
  /** Which report the line belongs to — it decides how `line` is resolved. */
  report: z.enum(['pnl', 'balance-sheet', 'cash-flow']),
  /** A line code from that report's structure. Never a list of roles. */
  line: z.string().min(1),
  /** Omitted for a balance-sheet line, which is cumulative. */
  from: isoDateSchema.optional(),
  to: isoDateSchema,
  legalEntityId: idListSchema,
  articleId: z.uuid().optional(),
  directionId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(2000).default(500),
});

export type BalanceSheetQueryDto = z.output<typeof balanceSheetQuerySchema>;
export type PnlQueryDto = z.output<typeof pnlQuerySchema>;
export type ReconciliationQueryDto = z.output<typeof reconciliationQuerySchema>;
export type CashFlowQueryDto = z.output<typeof cashFlowQuerySchema>;
export type DrilldownQueryDto = z.output<typeof drilldownQuerySchema>;
