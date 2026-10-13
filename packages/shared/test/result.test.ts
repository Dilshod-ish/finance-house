import { describe, expect, it } from 'vitest';
import {
  andThen,
  collect,
  err,
  isErr,
  isOk,
  map,
  mapErr,
  ok,
  unwrap,
  unwrapOr,
} from '../src/result.js';

describe('Result', () => {
  it('discriminates ok and err', () => {
    expect(isOk(ok(1))).toBe(true);
    expect(isErr(ok(1))).toBe(false);
    expect(isOk(err('x'))).toBe(false);
    expect(isErr(err('x'))).toBe(true);
  });

  it('maps values and errors independently', () => {
    expect(map(ok(2), (n) => n * 2)).toEqual(ok(4));
    expect(map(err<string>('e'), (n: number) => n * 2)).toEqual(err('e'));
    expect(mapErr(err('e'), (e) => `${e}!`)).toEqual(err('e!'));
    expect(mapErr(ok(1), () => 'unused')).toEqual(ok(1));
  });

  it('chains with andThen', () => {
    expect(andThen(ok(2), (n) => ok(n + 1))).toEqual(ok(3));
    expect(andThen(err<string>('e'), (n: number) => ok(n + 1))).toEqual(err('e'));
  });

  it('unwraps with and without a fallback', () => {
    expect(unwrapOr(ok(1), 9)).toBe(1);
    expect(unwrapOr(err<string>('e'), 9)).toBe(9);
    expect(unwrap(ok(1))).toBe(1);
    expect(() => unwrap(err('boom'))).toThrow(/unwrap\(\) on Err/);
  });

  it('collects, short-circuiting on the first error', () => {
    expect(collect([ok(1), ok(2)])).toEqual(ok([1, 2]));
    expect(collect([ok(1), err('e'), ok(3)])).toEqual(err('e'));
  });
});
