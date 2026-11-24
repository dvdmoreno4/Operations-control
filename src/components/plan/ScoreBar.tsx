import { MAX_ACTIVITY_BONUS } from '../../lib/activities';
import { centralScore, SCORE_SEGMENTS, totalScore, type KpiValues } from '../../lib/kpis';

const pct = (value: number) => `${Math.round(value * 10) / 10}`;
const BONUS_COLOR = '#8b5cf6';

/** Total score as one bar: the weighted central segments plus the activities bonus on top. */
export function ScoreBar({ values }: { values: KpiValues }) {
  const central = centralScore(values);
  const total = totalScore(values);
  const bonus = Math.max(0, Math.round((total - central) * 10) / 10);
  const penalty = Math.max(0, Math.round((central - total) * 10) / 10);
  const extra = values.scoreExtra ?? 0;
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] font-mono uppercase tracking-wider text-ink/60">Calificación total</span>
        <span className="text-2xl font-semibold tabular-nums">
          {pct(total)}
          <span className="text-sm text-ink/50"> / 100</span>
        </span>
      </div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-border/60" role="img" aria-label={`Calificación total ${pct(total)} de 100`}>
        {SCORE_SEGMENTS.map((segment) => (
          <div
            key={segment.key}
            className="h-full transition-[width] duration-300"
            style={{ width: `${values[segment.key] * segment.weight}%`, backgroundColor: segment.color }}
          />
        ))}
        {bonus > 0 && <div className="h-full transition-[width] duration-300" style={{ width: `${bonus}%`, backgroundColor: BONUS_COLOR }} />}
      </div>
      <p className="text-[11px] text-ink/60">
        KPI central {pct(central)}
        {bonus > 0 && <span className="font-semibold" style={{ color: BONUS_COLOR }}> + {pct(bonus)} plus de actividades</span>}
        {penalty > 0 && <span className="font-semibold text-danger"> − {pct(penalty)} por conversatorios no realizados</span>}
      </p>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {SCORE_SEGMENTS.map((segment) => (
          <li key={segment.key} className="rounded-lg border border-border px-3 py-2">
            <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-ink/60">
              <span className="size-2 rounded-sm" style={{ backgroundColor: segment.color }} />
              {segment.label}
            </div>
            <div className="mt-1 text-sm font-semibold tabular-nums">
              {pct(values[segment.key])}
              <span className="text-xs font-normal text-ink/50"> · peso {Math.round(segment.weight * 1000) / 10}%</span>
            </div>
          </li>
        ))}
        <li className="rounded-lg border border-border px-3 py-2">
          <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-ink/60">
            <span className="size-2 rounded-sm" style={{ backgroundColor: BONUS_COLOR }} />
            Ajuste actividades extraordinarias
          </div>
          <div className={`mt-1 text-sm font-semibold tabular-nums ${extra < 0 ? 'text-danger' : ''}`}>
            {extra > 0 ? '+' : extra < 0 ? '−' : ''}
            {pct(Math.abs(extra))}
            <span className="text-xs font-normal text-ink/50"> · plus máx. +{MAX_ACTIVITY_BONUS}; conversatorio no realizado resta</span>
          </div>
        </li>
      </ul>
    </div>
  );
}
