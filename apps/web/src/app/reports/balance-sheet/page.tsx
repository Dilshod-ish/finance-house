import type { JSX } from 'react';
import { Amount, EmptyState, Notice } from '@fincore/ui';
import { getBalanceSheet } from '@/lib/api';
import { readLanguage, translator } from '@/lib/language';
import { formatDate, readAsOf } from '@/lib/period';
import { Shell } from '@/components/Shell';
import { readTenant } from '@/lib/tenant';
import { BalanceSheetTable } from '@/components/BalanceSheetTable';
import { AsOfControls } from '@/components/PeriodControls';

interface PageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const one = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

export default async function BalanceSheetPage({ searchParams }: PageProps): Promise<JSX.Element> {
  const params = await searchParams;
  const language = readLanguage(one(params['lang']));
  const translate = translator(language);
  const tenant = await readTenant(one(params['org']));
  const asOf = readAsOf(one(params['asOf']));

  const { reports } = await getBalanceSheet(new URLSearchParams({ asOf }), tenant.orgId);

  return (
    <Shell
      language={language}
      translate={translate}
      orgs={tenant.orgs}
      orgId={tenant.orgId}
      active="balanceSheet"
      title={translate('nav.balanceSheet')}
      subtitle={formatDate(asOf)}
      controls={
        <AsOfControls translate={translate} language={language} orgId={tenant.orgId} asOf={asOf} />
      }
    >
      {reports.length === 0 ? (
        <EmptyState translate={translate} />
      ) : (
        reports.map((report) => (
          <section
            key={report.currency}
            style={{ display: 'flex', flexDirection: 'column', gap: 'var(--fc-space-4)' }}
          >
            {/*
              Stated either way. A balance sheet that does not tie is the
              loudest signal this product has, so it is never left implicit.
            */}
            <Notice tone={report.isBalanced ? 'success' : 'danger'}>
              {translate(report.isBalanced ? 'balance.balanced' : 'balance.unbalanced')}
              {report.isBalanced ? null : (
                <>
                  {' · '}
                  <Amount value={report.difference} translate={translate} />
                </>
              )}
            </Notice>

            <div
              style={{
                display: 'grid',
                gap: 'var(--fc-space-4)',
                gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
              }}
            >
              <BalanceSheetTable
                report={report}
                language={language}
                orgId={tenant.orgId}
                side="assets"
              />
              <BalanceSheetTable
                report={report}
                language={language}
                orgId={tenant.orgId}
                side="liabilities_and_equity"
              />
            </div>
          </section>
        ))
      )}
    </Shell>
  );
}
