import { BadRequestException } from '@nestjs/common';
import { isoDate, type IsoDate } from '@fincore/shared';
import { z } from 'zod';

/** An ISO date, rejected rather than coerced. I6 depends on exact dates. */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), 'not a real date')
  .transform((value): IsoDate => isoDate(value));

export const uuidSchema = z.uuid();

/** Repeatable query parameters arrive as a string or an array of strings. */
export const idListSchema = z
  .union([uuidSchema, z.array(uuidSchema)])
  .optional()
  .transform((value) => (value === undefined ? undefined : Array.isArray(value) ? value : [value]));

/**
 * Validates one query object, or fails with a 400 naming every problem. No
 * defaults are invented for a missing period: a report over the wrong dates is
 * worse than an error.
 */
export function parseQuery<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new BadRequestException({
      error: 'invalid_query',
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }
  return parsed.data;
}
