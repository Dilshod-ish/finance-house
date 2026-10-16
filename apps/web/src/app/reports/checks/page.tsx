import type { JSX } from 'react';
import { Amount, EmptyState, Notice } from '@fincore/ui';
import { getReconciliation } from '@/lib/api';
import { readLanguage, translator } from '@/lib/language';
import { formatPeriod, readPeriod } from '@/lib/period';
import { Shell } from '@/components/Shell';
import { readTenant } from '@/lib/tenant';
import { PeriodControls } from '@/components/PeriodControls';

interface PageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const one = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/**
 * The first light of the check screen (PRD §7.5): net profit against the
 * movement in equity. The other reconciliations — cash against the balance
 * sheet, unassigned operations, unrevalued FX accounts — are not built yet, so
 * this screen claims only what it actually checks.
 */
export default async function ChecksPage({ searchParams }: PageProps): Promise<JSX.Element> {
  const params = await searchParams;
  const language = readLanguage(one(params['lang']));
  const translate = translator(language);
  const tenant = await readTenant(one(params['org']));
  const period = readPeriod(one(params['from']), one(params['to']));

  const { checks } = await getReconciliation(
    new URLSearchParams({ from: period.from, to: period.to }),
    tenant.orgId,
  );

  const rows = [
    'netProfit',
    'equityChange',
    'contributions',
    'broughtForward',
    'draws',
    'residual',
  ] as const;

  return (
    <Shell
      language={language}
      translate={translate}
      orgs={tenant.orgs}
      orgId={tenant.orgId}
      active="checks"
      title={translate('check.title')}
      subtitle={formatPeriod(period)}
      controls={
        <PeriodControls
          translate={translate}
          language={language}
          orgId={tenant.orgId}
          from={period.from}
          to={period.to}
        />
      }
    >
      {checks.length === 0 ? (
        <EmptyState translate={translate} />
      ) : (
        checks.map((check) => (
          <section
            key={check.currency}
            style={{ display: 'flex', flexDirection: 'column', gap: 'var(--fc-space-4)' }}
          >
            <Notice tone={check.isReconciled ? 'success' : 'danger'}>
              <strong>{translate(check.isReconciled ? 'check.reconciled' : 'check.failed')}</strong>
              <br />
              {translate('check.residualExplainer')}
            </Notice>

            <table className="fc-table" data-testid="reconciliation">
              <thead>
                <tr>
                  <th scope="col">{translate('check.title')}</th>
                  <th scope="col">{check.currency}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((key) => (
                  <tr key={key} className={key === 'residual' ? 'fc-row--total' : ''}>
                    <th scope="row">{translate(`check.${key}`)}</th>
                    <td data-testid={`check-${key}`}>
                      <Amount value={check[key]} translate={translate} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))
      )}
    </Shell>
  );
}
