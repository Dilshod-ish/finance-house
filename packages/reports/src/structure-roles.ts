import type { GlAccountRole } from '@fincore/shared';

/** What one line contributes to a drill-down: its own roles, or other lines. */
export interface RoleSource {
  readonly roles: readonly GlAccountRole[];
  readonly components: readonly string[];
}

/**
 * The roles behind one report line, for drill-down. The caller passes a line
 * code and gets the roles the structure itself claims for it — a client must
 * never choose roles, or it could read lines the report never showed it.
 *
 * Shared by the P&L and the balance sheet: both are trees of lines over the
 * same role vocabulary, and two copies of this traversal would drift.
 */
export function rolesForLine<S extends { readonly code: string }>(
  code: string,
  specs: readonly S[],
  expand: (spec: S) => RoleSource,
  describeMissing: (code: string) => string,
): readonly GlAccountRole[] {
  const specByCode = new Map(specs.map((spec) => [spec.code, spec]));
  const roles = new Set<GlAccountRole>();
  const seen = new Set<string>();

  const visit = (at: string): void => {
    // Two lines can claim the same component — a margin's numerator and
    // denominator overlap — so this is dedupe, and cycle protection too.
    if (seen.has(at)) {
      return;
    }
    seen.add(at);
    const spec = specByCode.get(at);
    if (spec === undefined) {
      throw new Error(describeMissing(at));
    }
    const source = expand(spec);
    for (const role of source.roles) {
      roles.add(role);
    }
    for (const component of source.components) {
      visit(component);
    }
  };

  visit(code);
  return [...roles];
}
