'use client';

import type { JSX } from 'react';
import { ErrorState } from '@fincore/ui';
import { translator } from '@/lib/language';

/**
 * The error state every screen owes the reader. It says what happened and what
 * to do; the technical message is not shown (design system §11).
 */
export default function Error({ reset }: { error: Error; reset: () => void }): JSX.Element {
  const translate = translator('uz');
  return (
    <main className="shell__main">
      <ErrorState
        translate={translate}
        action={
          <button type="button" className="fc-button fc-button--accent" onClick={reset}>
            {translate('state.retry')}
          </button>
        }
      />
    </main>
  );
}
