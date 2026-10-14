import type { JSX, ReactNode } from 'react';

export interface FigureProps {
  readonly label: string;
  readonly value: ReactNode;
  readonly aside?: ReactNode;
}

/** A headline figure: the number is the hero, the chrome stays quiet (§7.1). */
export function Figure({ label, value, aside }: FigureProps): JSX.Element {
  return (
    <div className="figure">
      <p className="figure__label">{label}</p>
      <div className="figure__value fc-num">{value}</div>
      {aside === undefined ? null : <p className="figure__aside">{aside}</p>}
    </div>
  );
}
