import { redirect } from 'next/navigation';

export default function Home(): never {
  // The P&L is the screen a financier opens first; the KPI home screen of
  // PRD §7.4 is not built yet, so there is nothing to land on before it.
  redirect('/reports/pnl');
}
