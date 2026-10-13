import { sql } from 'drizzle-orm';
import { char, numeric, timestamp, uuid } from 'drizzle-orm/pg-core';

const moneyColumn = (name: string) => numeric(name, { precision: 20, scale: 4 }).$type<string>();
const rateColumn = (name: string) => numeric(name, { precision: 20, scale: 10 }).$type<string>();
const currencyColumn = (name: string) => char(name, { length: 3 });
const pkColumn = () =>
  uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`);
const createdAtColumn = () =>
  timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export type MoneyColumn = ReturnType<typeof moneyColumn>;
export type RateColumn = ReturnType<typeof rateColumn>;
export type CurrencyColumn = ReturnType<typeof currencyColumn>;
export type PkColumn = ReturnType<typeof pkColumn>;
export type CreatedAtColumn = ReturnType<typeof createdAtColumn>;

/**
 * Money: numeric(20,4) (invariant I7). Read back as an exact decimal *string*,
 * never a JS number — the caller wraps it in Money/Decimal.
 */
export const money = (name: string): MoneyColumn => moneyColumn(name);

/** FX rate: numeric(20,10). Also a decimal string. */
export const rate = (name: string): RateColumn => rateColumn(name);

/** ISO-4217 code, stored fixed-width. */
export const currencyCode = (name: string): CurrencyColumn => currencyColumn(name);

export const pk = (): PkColumn => pkColumn();

export const createdAt = (): CreatedAtColumn => createdAtColumn();
