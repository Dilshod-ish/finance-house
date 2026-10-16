import type { JSX } from 'react';
import { Amount, EmptyState, Notice } from '@fincore/ui';
import { getCashFlow, getCashFlowReconciliation } from '@/lib/api';
import { readLanguage, translator } from '@/lib/language';
import { formatPeriod, readPeriod } from '@/lib/period';
import { Shell } from '@/components/Shell';
import { readTenant } from '@/lib/tenant';
import { CashFlowTable } from '@/components/CashFlowTable';
import { PeriodControls } from '@/components/PeriodControls';
import { Figure } from '@/components/Figures';

interface PageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const one = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

const GROUPINGS = ['none', 'article', 'direction', 'counterparty', 'account'];

export default async function CashFlowPage({ searchParams }: PageProps): Promise<JSX.Element> {
  const params = await searchParams;
  const language = readLanguage(one(params['lang']));
  const translate = translator(language);
  const tenant = await readTenant(one(params['org']));
  const period = readPeriod(one(params['from']), one(params['to']));
  const groupingParam = one(params['grouping']) ?? 'none';
  const grouping = GROUPINGS.includes(groupingParam) ? groupingParam : 'none';

  const search = new URLSearchParams({ from: period.from, to: period.to, grouping });
  const [{ reports }, { checks }] = await Promise.all([
    getCashFlow(search, tenant.orgId),
    getCashFlowReconciliation(
      new URLSearchParams({ from: period.from, to: period.to }),
      tenant.orgId,
    ),
  ]);

  return (
    <Shell
      language={language}
      translate={translate}
      orgs={tenant.orgs}
      orgId={tenant.orgId}
      active="cashFlow"
      title={translate('nav.cashFlow')}
      subtitle={formatPeriod(period)}
      controls={
        <PeriodControls
          translate={translate}
          language={language}
          orgId={tenant.orgId}
          from={period.from}
          to={period.to}
          grouping={grouping}
          groupings={GROUPINGS}
        />
      }
    >
      {reports.length === 0 ? (
        <EmptyState translate={translate} />
      ) : (
        reports.map((report) => {
          const row = (code: string) => report.rows.find((candidate) => candidate.code === code);
          const check = checks.find((candidate) => candidate.currency === report.currency);
          return (
            <section
              key={report.currency}
              style={{ display: 'flex', flexDirection: 'column', gap: 'var(--fc-space-4)' }}
            >
              {/*
                The statement must end where the ledger's cash accounts end.
                Said either way: a cash flow that does not tie is the loudest
                signal this product has.
              */}
              {check === undefined ? null : (
                <Notice tone={check.isReconciled ? 'success' : 'danger'}>
                  {translate(check.isReconciled ? 'check.reconciled' : 'check.failed')}
                  {check.isReconciled ? null : (
                    <>
                      {' · '}
                      <Amount value={check.residual} translate={translate} />
                    </>
                  )}
                </Notice>
              )}

              <div className="shell__figures">
                <Figure
                  label={translate('cf.openingCash')}
                  value={
                    <Amount
                      value={row('openingCash')?.total ?? null}
                      translate={translate}
                      compact
                    />
                  }
                />
                <Figure
                  label={translate('cf.netFlow')}
                  value={
                    <Amount value={row('netFlow')?.total ?? null} translate={translate} compact />
                  }
                  aside={
                    <>
                      {translate('cf.operating')}:{' '}
                      <Amount
                        value={row('operating')?.total ?? null}
                        translate={translate}
                        compact
                      />
                    </>
                  }
                />
                <Figure
                  label={translate('cf.closingCash')}
                  value={
                    <Amount
                      value={row('closingCash')?.total ?? null}
                      translate={translate}
                      compact
                    />
                  }
                />
              </div>

              <CashFlowTable report={report} language={language} orgId={tenant.orgId} />
            </section>
          );
        })
      )}
    </Shell>
  );
}
