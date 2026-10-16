import type { JSX, ReactNode } from 'react';
import Link from 'next/link';
import { LANGUAGES, type Language, type Translate } from '@/lib/language';

export interface OrgOption {
  readonly id: string;
  readonly name: string;
}

export interface ShellProps {
  readonly language: Language;
  readonly translate: Translate;
  readonly active: 'cashFlow' | 'pnl' | 'balanceSheet' | 'checks';
  readonly orgs: readonly OrgOption[];
  readonly orgId: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly controls?: ReactNode;
  readonly children: ReactNode;
}

const NAV = [
  { key: 'cashFlow', href: '/reports/cash-flow', labelKey: 'nav.cashFlow' },
  { key: 'pnl', href: '/reports/pnl', labelKey: 'nav.pnl' },
  { key: 'balanceSheet', href: '/reports/balance-sheet', labelKey: 'nav.balanceSheet' },
  { key: 'checks', href: '/reports/checks', labelKey: 'nav.checks' },
] as const;

export function Shell({
  language,
  translate,
  active,
  orgs,
  orgId,
  title,
  subtitle,
  controls,
  children,
}: ShellProps): JSX.Element {
  return (
    <div className="shell">
      <nav className="shell__nav">
        <div className="shell__brand">FinCore</div>
        {/*
          Switching organization is a plain GET form, like everything else
          here: the tenant lives in the URL, so a view is shareable and the
          back button works. The server only honours an id it was configured
          for — see `activeOrgId`.
        */}
        <form method="get" className="fc-field" style={{ width: '100%' }}>
          <span>{translate('org.label')}</span>
          <select name="org" defaultValue={orgId} className="fc-control" style={{ width: '100%' }}>
            {orgs.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
          <input type="hidden" name="lang" value={language} />
          <noscript>
            <button type="submit" className="fc-button">
              OK
            </button>
          </noscript>
        </form>

        <div className="shell__links">
          {NAV.map((item) => (
            <Link
              key={item.key}
              href={`${item.href}?lang=${language}&org=${orgId}`}
              className="shell__link"
              aria-current={item.key === active ? 'page' : undefined}
            >
              {translate(item.labelKey)}
            </Link>
          ))}
        </div>
        <form method="get" className="fc-field" style={{ marginTop: 'auto' }}>
          <span>{translate('language.label')}</span>
          <select name="lang" defaultValue={language} className="fc-control">
            {LANGUAGES.map((option) => (
              <option key={option} value={option}>
                {option.toUpperCase()}
              </option>
            ))}
          </select>
          <noscript>
            <button type="submit" className="fc-button">
              OK
            </button>
          </noscript>
        </form>
      </nav>

      <main className="shell__main">
        <header className="shell__head">
          <div>
            <h1 className="shell__title">{title}</h1>
            {subtitle === undefined ? null : <p className="shell__subtitle">{subtitle}</p>}
          </div>
          {controls}
        </header>
        {children}
      </main>
    </div>
  );
}
