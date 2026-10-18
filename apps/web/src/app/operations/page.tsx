import type { JSX } from 'react';
import { getArticles, getBatches, getInbox } from '@/lib/api';
import { readLanguage, translator } from '@/lib/language';
import { readTenant } from '@/lib/tenant';
import { Shell } from '@/components/Shell';
import { ImportBatches } from '@/components/ImportBatches';
import { OperationsInbox } from '@/components/OperationsInbox';
import { StatementUpload } from '@/components/StatementUpload';

interface PageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const one = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/**
 * M2's screen: upload a statement, then classify what it could not classify
 * itself. The three panels are in the order the work happens — the file, the
 * queue it left behind, and the undo for when the file was the wrong one.
 *
 * Everything here reads through the API; the page computes nothing.
 */
export default async function OperationsPage({ searchParams }: PageProps): Promise<JSX.Element> {
  const params = await searchParams;
  const language = readLanguage(one(params['lang']));
  const translate = translator(language);
  const tenant = await readTenant(one(params['org']));

  const [{ operations }, { batches }, { articles }] = await Promise.all([
    getInbox(tenant.orgId),
    getBatches(tenant.orgId),
    getArticles(tenant.orgId),
  ]);

  return (
    <Shell
      language={language}
      translate={translate}
      orgs={tenant.orgs}
      orgId={tenant.orgId}
      active="operations"
      title={translate('ops.title')}
      subtitle={translate('ops.subtitle')}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--fc-space-5)' }}>
        <section className="shell__card">
          <h2>{translate('ops.upload.title')}</h2>
          <StatementUpload language={language} orgId={tenant.orgId} />
        </section>

        <section className="shell__card">
          <h2>
            {translate('ops.inbox.title')} ({operations.length})
          </h2>
          <OperationsInbox
            language={language}
            orgId={tenant.orgId}
            operations={operations}
            articles={articles}
          />
        </section>

        <section className="shell__card">
          <h2>{translate('ops.batches.title')}</h2>
          <ImportBatches language={language} orgId={tenant.orgId} batches={batches} />
        </section>
      </div>
    </Shell>
  );
}
