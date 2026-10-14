import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestDatabase, type TestDatabase } from '@fincore/db/testing';
import { seedDemo, type SeedResult } from '@fincore/seed';
import { BALANCE_SHEET, PNL, REPORT_MESSAGES } from '@fincore/reports';
import type { Messages } from '@fincore/shared';
import { AppModule } from '../../src/app.module.js';
import { ORG_HEADER } from '../../src/org-context/org-context.js';
import type { Env } from '../../src/config/env.js';
import type { LegalEntityDto } from '../../src/meta/meta.controller.js';
import type {
  BalanceSheetDto,
  LedgerLineDto,
  PnlDto,
  ReconciliationDto,
} from '../../src/reports/reports.presenter.js';

const FROM = '2026-01-01';
const TO = '2026-03-31';

/** A decimal string with exactly four places — never a JSON number (I7). */
const STORAGE_AMOUNT = /^-?\d+\.\d{4}$/;

interface ApiError {
  readonly error: string;
  readonly message?: string;
  readonly issues?: readonly { readonly path: string; readonly message: string }[];
}

let harness: TestDatabase;
let app: INestApplication;
let seeded: SeedResult;
let orgId: string;
let otherOrgId: string;

beforeAll(async () => {
  harness = await createTestDatabase();
  seeded = await seedDemo(harness.db);
  orgId = seeded.reference.orgId;
  otherOrgId = seeded.otherOrgId;

  const env: Env = {
    nodeEnv: 'test',
    port: 0,
    databaseUrl: harness.url,
    insecureOrgHeader: true,
    corsOrigins: [],
  };
  app = await NestFactory.create(AppModule.forRoot({ env }), { logger: false });
  await app.init();
});

afterAll(async () => {
  await app.close();
  await harness.close();
});

interface Response<T> {
  readonly status: number;
  readonly body: T;
  /** The unparsed payload, for assertions `JSON.parse` would have destroyed. */
  readonly text: string;
}

/**
 * One typed call. `supertest` types the body as `any`, so this is the single
 * place that names a response shape — and it names the API's own DTO types, so
 * these tests check the wire contract rather than restating it.
 */
async function get<T>(path: string, org: string | null = orgId): Promise<Response<T>> {
  const call = request(app.getHttpServer() as Parameters<typeof request>[0]).get(path);
  const response = await (org === null ? call : call.set(ORG_HEADER, org));
  return { status: response.status, body: response.body as T, text: response.text };
}

const netProfitOf = (report: PnlDto): string | null =>
  report.rows.find((row) => row.code === 'netProfit')?.amount?.amount ?? null;

const firstReport = <T>(reports: readonly T[]): T => {
  const [report] = reports;
  if (report === undefined) {
    throw new Error('the API returned no report');
  }
  return report;
};

describe('health', () => {
  it('reports the database, and needs no tenant', async () => {
    const { status, body } = await get<{
      status: string;
      database: string;
      environment: string;
    }>('/health', null);
    expect(status).toBe(200);
    expect(body).toEqual({ status: 'ok', database: 'ok', environment: 'test' });
  });
});

describe('tenant resolution', () => {
  it('refuses a request that carries no organization', async () => {
    const { status, body } = await get<ApiError>(`/v1/reports/pnl?from=${FROM}&to=${TO}`, null);
    expect(status).toBe(401);
    expect(body.error).toBe('no_organization');
  });

  it('shows each tenant only its own ledger (I8)', async () => {
    const mine = await get<{ reports: PnlDto[] }>(`/v1/reports/pnl?from=${FROM}&to=${TO}`);
    const theirs = await get<{ reports: PnlDto[] }>(
      `/v1/reports/pnl?from=${FROM}&to=${TO}`,
      otherOrgId,
    );
    expect(mine.status).toBe(200);
    expect(theirs.status).toBe(200);

    // The seed runs the same generator for both tenants, so the figures match.
    // A query that lost its tenant filter would double one of them.
    const ours = netProfitOf(firstReport(mine.body.reports));
    expect(netProfitOf(firstReport(theirs.body.reports))).toBe(ours);
    expect(ours).toMatch(STORAGE_AMOUNT);
  });
});

describe('GET /v1/reports/pnl', () => {
  it('returns one report per functional currency, with every structure row', async () => {
    const { body } = await get<{ reports: PnlDto[] }>(`/v1/reports/pnl?from=${FROM}&to=${TO}`);
    expect(body.reports.length).toBeGreaterThan(0);
    const report = firstReport(body.reports);
    expect(report.rows.map((row) => row.code)).toEqual(PNL.map((spec) => spec.code));
  });

  it('serializes every amount as a string, never a JSON number (I7)', async () => {
    const { body, text } = await get<{ reports: PnlDto[] }>(
      `/v1/reports/pnl?from=${FROM}&to=${TO}&compareTo=prior`,
    );
    // Asserted on the raw payload: by the time JSON.parse has run, a number
    // would already have been rounded to a double and look plausible.
    expect(text).not.toMatch(/"amount":-?\d/);
    for (const report of body.reports) {
      for (const row of report.rows) {
        if (row.amount !== null) {
          expect(row.amount.amount).toMatch(STORAGE_AMOUNT);
          expect(row.amount.currency).toMatch(/^[A-Z]{3}$/);
        }
      }
    }
  });

  it('adds the comparison period only when asked', async () => {
    const plain = await get<{ reports: PnlDto[] }>(`/v1/reports/pnl?from=${FROM}&to=${TO}`);
    expect(firstReport(plain.body.reports).comparison).toBeNull();

    const compared = await get<{ reports: PnlDto[] }>(
      '/v1/reports/pnl?from=2026-03-01&to=2026-03-31&compareTo=prior',
    );
    expect(firstReport(compared.body.reports).comparison).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    });
  });

  it('groups by article when asked, and not otherwise', async () => {
    const none = await get<{ reports: PnlDto[] }>(`/v1/reports/pnl?from=${FROM}&to=${TO}`);
    const revenueOf = (report: PnlDto) => report.rows.find((row) => row.code === 'revenue');
    expect(revenueOf(firstReport(none.body.reports))?.breakdown).toEqual([]);

    const grouped = await get<{ reports: PnlDto[] }>(
      `/v1/reports/pnl?from=${FROM}&to=${TO}&grouping=article`,
    );
    expect(revenueOf(firstReport(grouped.body.reports))?.breakdown.length).toBeGreaterThan(0);
  });

  it('refuses a malformed period instead of inventing one', async () => {
    const malformed = await get<ApiError>(`/v1/reports/pnl?from=2026-13-01&to=${TO}`);
    expect(malformed.status).toBe(400);
    expect(malformed.body.error).toBe('invalid_query');
    expect(malformed.body.issues).toEqual([{ path: 'from', message: 'not a real date' }]);

    const missing = await get<ApiError>('/v1/reports/pnl');
    expect(missing.status).toBe(400);
  });
});

describe('GET /v1/reports/balance-sheet', () => {
  it('balances, and names every structure line', async () => {
    const { body } = await get<{ reports: BalanceSheetDto[] }>(
      `/v1/reports/balance-sheet?asOf=${TO}`,
    );
    const report = firstReport(body.reports);
    expect(report.lines.map((line) => line.code)).toEqual(BALANCE_SHEET.map((spec) => spec.code));
    expect(report.isBalanced).toBe(true);
    expect(report.difference.amount).toBe('0.0000');
  });

  it('marks totals as not drillable, since they have no lines of their own', async () => {
    const { body } = await get<{ reports: BalanceSheetDto[] }>(
      `/v1/reports/balance-sheet?asOf=${TO}`,
    );
    const { lines } = firstReport(body.reports);
    expect(lines.some((line) => !line.isDrillable)).toBe(true);
    for (const line of lines) {
      expect(line.isDrillable).toBe(!line.isTotal);
    }
  });
});

describe('GET /v1/reports/reconciliation', () => {
  it('ties net profit to the movement in equity', async () => {
    const { body } = await get<{ checks: ReconciliationDto[] }>(
      `/v1/reports/reconciliation?from=${FROM}&to=${TO}`,
    );
    expect(body.checks.length).toBeGreaterThan(0);
    for (const check of body.checks) {
      expect(check.isReconciled).toBe(true);
      expect(check.residual.amount).toBe('0.0000');
    }
  });
});

describe('GET /v1/reports/drilldown', () => {
  it('resolves roles from the structure, so the client never sends them', async () => {
    const { body } = await get<{ lines: LedgerLineDto[] }>(
      `/v1/reports/drilldown?report=pnl&line=revenue&from=${FROM}&to=${TO}`,
    );
    expect(body.lines.length).toBeGreaterThan(0);
    for (const line of body.lines) {
      // I3: the source marker travels with every line.
      expect(line.sourceType.length).toBeGreaterThan(0);
      expect(line.amountFunctional.amount).toMatch(STORAGE_AMOUNT);
      expect(line.accrualDate >= FROM && line.accrualDate <= TO).toBe(true);
    }
  });

  it('reads a balance-sheet line cumulatively, with no lower bound', async () => {
    const cumulative = await get<{ lines: LedgerLineDto[] }>(
      '/v1/reports/drilldown?report=balance-sheet&line=equity&to=2026-02-15&limit=2000',
    );
    const inPeriod = await get<{ lines: LedgerLineDto[] }>(
      '/v1/reports/drilldown?report=balance-sheet&line=equity&from=2026-02-01&to=2026-02-15&limit=2000',
    );
    expect(cumulative.body.lines.length).toBeGreaterThan(inPeriod.body.lines.length);
  });

  it('refuses a line the report does not have', async () => {
    const { status, body } = await get<ApiError>(
      `/v1/reports/drilldown?report=pnl&line=madeUp&from=${FROM}&to=${TO}`,
    );
    expect(status).toBe(400);
    expect(body.error).toBe('unknown_report_line');
  });

  it('refuses a report name it does not know', async () => {
    const { status } = await get<ApiError>(
      `/v1/reports/drilldown?report=cashflow&line=revenue&to=${TO}`,
    );
    expect(status).toBe(400);
  });
});

describe('GET /v1/meta', () => {
  it('lists the calling tenant legal entities only', async () => {
    const mine = await get<{ legalEntities: LegalEntityDto[] }>('/v1/meta/legal-entities');
    const theirs = await get<{ legalEntities: LegalEntityDto[] }>(
      '/v1/meta/legal-entities',
      otherOrgId,
    );
    expect(mine.body.legalEntities.length).toBeGreaterThan(0);
    const ids = new Set(mine.body.legalEntities.map((entity) => entity.id));
    for (const entity of theirs.body.legalEntities) {
      expect(ids.has(entity.id)).toBe(false);
    }
  });

  it('serves every report label in all three languages', async () => {
    const { body } = await get<{ languages: string[]; messages: Messages }>('/v1/meta/messages');
    expect(body.languages).toEqual(['uz', 'ru', 'en']);
    expect(body.messages).toEqual(REPORT_MESSAGES);
  });
});
