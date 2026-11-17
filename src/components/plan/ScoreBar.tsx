import { SCORE_SEGMENTS, totalScore, type KpiValues } from '../../lib/kpis';

const pct = (value: number) => `${Math.round(value * 10) / 10}`;

/** Total score as one bar split into its weighted segments. */
export function ScoreBar({ values }: { values: KpiValues }) {
  const total = totalScore(values);
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] font-mono uppercase tracking-wider text-ink/60">Calificación total</span>
        <span className="text-2xl font-semibold tabular-nums">
          {pct(total)}
          <span className="text-sm text-ink/50"> / 100</span>
        </span>
      </div>
      <div
        className="flex h-3 w-full overflow-hidden rounded-full bg-border/60"
        role="img"
        aria-label={`Calificación total ${pct(total)} de 100`}
      >
        {SCORE_SEGMENTS.map((segment) => (
          <div
            key={segment.key}
            className="h-full transition-[width] duration-300"
            style={{ width: `${values[segment.key] * segment.weight}%`, backgroundColor: segment.color }}
          />
        ))}
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {SCORE_SEGMENTS.map((segment) => (
          <li key={segment.key} className="rounded-lg border border-border px-3 py-2">
            <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-ink/60">
              <span className="size-2 rounded-sm" style={{ backgroundColor: segment.color }} />
              {segment.label}
            </div>
            <div className="mt-1 text-sm font-semibold tabular-nums">
              {pct(values[segment.key])}
              <span className="text-xs font-normal text-ink/50"> · peso {Math.round(segment.weight * 100)}%</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
