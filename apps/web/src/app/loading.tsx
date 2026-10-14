import type { JSX } from 'react';
import { SkeletonTable } from '@fincore/ui';

/** A skeleton, so the figures' space is held and the layout cannot jump. */
export default function Loading(): JSX.Element {
  return (
    <main className="shell__main">
      <SkeletonTable rows={14} columns={2} />
    </main>
  );
}
