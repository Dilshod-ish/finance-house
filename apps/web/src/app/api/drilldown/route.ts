import { NextResponse } from 'next/server';
import { getDrilldown } from '@/lib/api';

/**
 * Proxies the drill-down to the API so the browser never carries the tenant
 * header. Today that header is the development stand-in for authentication;
 * keeping it server-side means the browser gains nothing it could replay.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const incoming = new URL(request.url).searchParams;
  const search = new URLSearchParams();
  for (const key of ['report', 'line', 'from', 'to', 'articleId', 'directionId', 'limit']) {
    const value = incoming.get(key);
    if (value !== null && value !== '') {
      search.set(key, value);
    }
  }

  const { lines } = await getDrilldown(search);
  return NextResponse.json({ lines });
}
