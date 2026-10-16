import type { JSX, ReactNode } from 'react';
import Link from 'next/link';
import { LANGUAGES, type Language, type Translate } from '@/lib/language';

export interface ShellProps {
  readonly language: Language;
  readonly translate: Translate;
  readonly active: 'cashFlow' | 'pnl' | 'balanceSheet' | 'checks';
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
  title,
  subtitle,
  controls,
  children,
}: ShellProps): JSX.Element {
  return (
    <div className="shell">
      <nav className="shell__nav">
        <div className="shell__brand">FinCore</div>
        <div className="shell__links">
          {NAV.map((item) => (
            <Link
              key={item.key}
              href={`${item.href}?lang=${language}`}
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
