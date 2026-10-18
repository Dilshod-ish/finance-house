import { z } from 'zod';
import { uuidSchema } from '../http/query.js';

export const assignBodySchema = z.object({
  articleId: uuidSchema,
  directionId: uuidSchema.nullish(),
});

export const revertBodySchema = z.object({
  reason: z.string().min(1, 'a revert needs a reason — it is what the audit trail carries'),
});

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export type AssignBodyDto = z.output<typeof assignBodySchema>;
export type RevertBodyDto = z.output<typeof revertBodySchema>;
export type ListQueryDto = z.output<typeof listQuerySchema>;
