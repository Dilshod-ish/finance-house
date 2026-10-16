import type { JSX } from 'react';
import { Amount, EmptyState, Notice, Percent } from '@fincore/ui';
import { getPnl } from '@/lib/api';
import { readLanguage, translator } from '@/lib/language';
import { readPeriod, formatPeriod } from '@/lib/period';
import { Shell } from '@/components/Shell';
import { readTenant } from '@/lib/tenant';
import { PnlTable } from '@/components/PnlTable';
import { PeriodControls } from '@/components/PeriodControls';
import { Figure } from '@/components/Figures';

interface PageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const one = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

const GROUPINGS = ['none', 'article', 'direction', 'direction_article'];

export default async function PnlPage({ searchParams }: PageProps): Promise<JSX.Element> {
  const params = await searchParams;
  const language = readLanguage(one(params['lang']));
  const translate = translator(language);
  const tenant = await readTenant(one(params['org']));
  const period = readPeriod(one(params['from']), one(params['to']));
  const groupingParam = one(params['grouping']) ?? 'none';
  const grouping = GROUPINGS.includes(groupingParam) ? groupingParam : 'none';
  const compare = one(params['compare']) === '1';

  const search = new URLSearchParams({ from: period.from, to: period.to, grouping });
  if (compare) {
    search.set('compareTo', 'prior');
  }
  const { reports } = await getPnl(search, tenant.orgId);

  return (
    <Shell
      language={language}
      translate={translate}
      orgs={tenant.orgs}
      orgId={tenant.orgId}
      active="pnl"
      title={translate('nav.pnl')}
      subtitle={formatPeriod(period)}
      controls={
        <PeriodControls
          translate={translate}
          language={language}
          orgId={tenant.orgId}
          from={period.from}
          to={period.to}
          grouping={grouping}
          compare={compare}
        />
      }
    >
      {reports.length === 0 ? (
        <EmptyState translate={translate} />
      ) : (
        reports.map((report) => {
          const row = (code: string) => report.rows.find((candidate) => candidate.code === code);
          const unclassified = row('opexUnclassified')?.amount ?? null;
          const hasUnclassified = unclassified !== null && unclassified.amount !== '0.0000';
          return (
            <section
              key={report.currency}
              style={{ display: 'flex', flexDirection: 'column', gap: 'var(--fc-space-4)' }}
            >
              <div className="shell__figures">
                <Figure
                  label={translate('pnl.revenue')}
                  value={
                    <Amount value={row('revenue')?.amount ?? null} translate={translate} compact />
                  }
                />
                <Figure
                  label={translate('pnl.ebitda')}
                  value={
                    <Amount value={row('ebitda')?.amount ?? null} translate={translate} compact />
                  }
                  aside={
                    <>
                      {translate('pnl.ebitdaMargin')}:{' '}
                      <Percent value={row('ebitdaMargin')?.percent ?? null} />
                    </>
                  }
                />
                <Figure
                  label={translate('pnl.netProfit')}
                  value={
                    <Amount
                      value={row('netProfit')?.amount ?? null}
                      translate={translate}
                      compact
                    />
                  }
                  aside={
                    <>
                      {translate('pnl.netMargin')}:{' '}
                      <Percent value={row('netMargin')?.percent ?? null} />
                    </>
                  }
                />
              </div>

              {/*
                The incomplete state the design system calls the one most often
                forgotten: an unclassified cost is shown with the report, never
                hidden and never left unsaid.
              */}
              {hasUnclassified ? (
                <Notice>
                  {translate('pnl.opexUnclassified')}:{' '}
                  <Amount value={unclassified} translate={translate} decimals={0} />
                </Notice>
              ) : null}

              <PnlTable report={report} language={language} orgId={tenant.orgId} />
            </section>
          );
        })
      )}
    </Shell>
  );
}
