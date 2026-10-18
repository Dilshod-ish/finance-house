import { NextResponse } from 'next/server';
import { apiPost } from '@/lib/api';
import { activeOrgId } from '@/lib/config';

/**
 * Proxies the three operation writes — import, assign, revert — so the browser
 * never carries the tenant header. That header is today's stand-in for
 * authentication (ADR-0007); keeping it server-side means the browser gains
 * nothing it could replay.
 *
 * A refusal is passed through with its status and its findings intact: the
 * person needs the sheet, row and column, not a generic failure.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const orgId = activeOrgId(url.searchParams.get('org') ?? undefined);
  const action = url.searchParams.get('action');

  if (action === 'import') {
    const bytes = await request.arrayBuffer();
    const fileName = url.searchParams.get('fileName') ?? 'statement.xlsx';
    const result = await apiPost(
      '/v1/operations/import',
      orgId,
      bytes,
      'application/octet-stream',
      { 'x-fincore-file-name': encodeURIComponent(fileName) },
    );
    return result.ok
      ? NextResponse.json(result.value)
      : NextResponse.json(result.error, { status: result.status });
  }

  if (action === 'assign') {
    const operationId = url.searchParams.get('id') ?? '';
    const body = await request.text();
    const result = await apiPost(
      `/v1/operations/${encodeURIComponent(operationId)}/assign`,
      orgId,
      body,
      'application/json',
    );
    return result.ok
      ? NextResponse.json(result.value)
      : NextResponse.json(result.error, { status: result.status });
  }

  if (action === 'revert') {
    const batchId = url.searchParams.get('id') ?? '';
    const body = await request.text();
    const result = await apiPost(
      `/v1/operations/batches/${encodeURIComponent(batchId)}/revert`,
      orgId,
      body,
      'application/json',
    );
    return result.ok
      ? NextResponse.json(result.value)
      : NextResponse.json(result.error, { status: result.status });
  }

  return NextResponse.json(
    { error: 'unknown_action', message: 'action must be import, assign or revert' },
    { status: 400 },
  );
}
