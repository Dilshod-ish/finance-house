import { describe, expect, it } from 'vitest';
import { readEnv, type Env } from '../../src/config/env.js';
import { ORG_HEADER, headerOrgContext } from '../../src/org-context/org-context.js';
import { resolveOrgContext } from '../../src/org-context/resolve.js';

const env = (over: Partial<Env> = {}): Env => ({
  nodeEnv: 'development',
  port: 3001,
  databaseUrl: 'postgres://localhost/fincore',
  insecureOrgHeader: false,
  corsOrigins: [],
  ...over,
});

describe('resolveOrgContext — the guard that keeps the dev resolver out of production', () => {
  it('refuses production outright, even with the flag set', () => {
    expect(() =>
      resolveOrgContext(env({ nodeEnv: 'production', insecureOrgHeader: true })),
    ).toThrow(/refused in production/);
  });

  it('refuses development without the explicit opt-in', () => {
    expect(() => resolveOrgContext(env())).toThrow(/FINCORE_INSECURE_ORG_HEADER=1/);
  });

  it('builds the header resolver only in development with the flag', () => {
    const context = resolveOrgContext(env({ insecureOrgHeader: true }));
    expect(context.describe).toContain('no authentication');
  });

  it('allows the flag in test, so integration tests can boot the real app', () => {
    expect(() =>
      resolveOrgContext(env({ nodeEnv: 'test', insecureOrgHeader: true })),
    ).not.toThrow();
  });
});

describe('headerOrgContext', () => {
  const context = headerOrgContext();

  it('reads the organization from the header', () => {
    expect(context.resolve({ [ORG_HEADER]: 'org-1' })).toBe('org-1');
  });

  it('trims, because a copied id carries whitespace', () => {
    expect(context.resolve({ [ORG_HEADER]: '  org-1  ' })).toBe('org-1');
  });

  it('takes the first value when the header repeats', () => {
    expect(context.resolve({ [ORG_HEADER]: ['org-1', 'org-2'] })).toBe('org-1');
  });

  it('returns null rather than a default tenant', () => {
    expect(context.resolve({})).toBeNull();
    expect(context.resolve({ [ORG_HEADER]: '   ' })).toBeNull();
    expect(context.resolve({ [ORG_HEADER]: [] })).toBeNull();
  });
});

describe('readEnv', () => {
  it('requires a database url', () => {
    expect(() => readEnv({})).toThrow(/DATABASE_URL/);
  });

  it('names every problem at once, not just the first', () => {
    expect(() => readEnv({ NODE_ENV: 'staging', PORT: 'abc' })).toThrow(/NODE_ENV[\s\S]*PORT/);
  });

  it('defaults to development on port 3001 with the header resolver off', () => {
    const parsed = readEnv({ DATABASE_URL: 'postgres://localhost/x' });
    expect(parsed).toEqual({
      nodeEnv: 'development',
      port: 3001,
      databaseUrl: 'postgres://localhost/x',
      insecureOrgHeader: false,
      corsOrigins: [],
    });
  });

  it('reads the opt-in flag and the CORS list', () => {
    const parsed = readEnv({
      DATABASE_URL: 'postgres://localhost/x',
      FINCORE_INSECURE_ORG_HEADER: '1',
      CORS_ORIGINS: 'http://localhost:3000, http://localhost:3002 ,',
    });
    expect(parsed.insecureOrgHeader).toBe(true);
    expect(parsed.corsOrigins).toEqual(['http://localhost:3000', 'http://localhost:3002']);
  });
});
