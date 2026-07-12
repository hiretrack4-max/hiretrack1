import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * MetricTile — the approved dashboard KPI tile (pitch "Variant B").
 * A separated stat card: mono label + optional delta, a big serif numeral,
 * and a small SVG sparkline. `hot` gives the vermilion border + numeral.
 */
export interface MetricDelta {
  /** Pre-formatted label, e.g. "+2" or "−1". */
  label: string;
  direction?: 'up' | 'down' | 'flat';
}

export interface MetricTileProps {
  label: string;
  value: number | string;
  delta?: MetricDelta;
  /** Sequence of values driving the sparkline (>= 2 points to draw). */
  spark?: number[];
  hot?: boolean;
  className?: string;
}

/** Map raw values to an SVG polyline across a 100×26 viewBox (y inverted). */
function sparkPoints(values: number[]): string {
  if (values.length < 2) return '';
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const stepX = 100 / (values.length - 1);
  const pad = 3; // keep the line off the very top/bottom edge
  return values
    .map((v, i) => {
      const x = i * stepX;
      const y = pad + (1 - (v - min) / span) * (26 - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

/**
 * A single stat card. Must live inside a <MetricRow> (or any `.kB` grid) so it
 * lays out on the shared responsive grid.
 */
export function MetricTile({ label, value, delta, spark, hot = false, className }: MetricTileProps) {
  const points = spark ? sparkPoints(spark) : '';
  return (
    <div className={cn('m', hot && 'hot', className)}>
      <div className="top">
        <span className="k">{label}</span>
        {delta && (
          <span
            className={cn(
              'delta',
              delta.direction === 'down' && 'down',
              delta.direction === 'flat' && 'flat',
            )}
          >
            {delta.label}
          </span>
        )}
      </div>
      <div className="v">{value}</div>
      {points && (
        <svg viewBox="0 0 100 26" preserveAspectRatio="none" aria-hidden>
          <polyline
            fill="none"
            stroke={hot ? 'var(--orange)' : 'var(--dim)'}
            strokeWidth={hot ? 1.8 : 1.5}
            points={points}
          />
        </svg>
      )}
    </div>
  );
}

/** Responsive `.kB` grid that lays out a row of <MetricTile>s. */
export function MetricRow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn('kB', className)}>{children}</div>;
}
