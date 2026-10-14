import type { JSX, ReactNode } from 'react';
import '@fincore/ui/tokens.css';
import '@fincore/ui/components.css';
import './shell.css';

export const metadata = {
  title: 'FinCore',
  description: 'Management accounting over a single double-entry ledger',
};

export default function RootLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <html lang="uz">
      <body>{children}</body>
    </html>
  );
}
