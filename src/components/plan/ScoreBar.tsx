import { MAX_ACTIVITY_BONUS } from '../../lib/activities';
import { centralScore, SCORE_SEGMENTS, totalScore, type KpiValues } from '../../lib/kpis';
import { MAX_COLLAB_BONUS } from '../../lib/projects';

const pct = (value: number) => `${Math.round(value * 10) / 10}`;
const signed = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${pct(Math.abs(value))}`;
const BONUS_COLOR = '#8b5cf6';
const COLLAB_COLOR = '#0ea5e9';

/** Total score as one bar: the weighted central segments plus the activities and collaboration bonuses on top. */
export function ScoreBar({ values }: { values: KpiValues & { scoreCollab?: number } }) {
  const central = centralScore(values);
  const total = totalScore(values);
  const extra = values.scoreExtra ?? 0;
  const collab = values.scoreCollab ?? 0;
  // Bar widths: what each bonus actually adds once the total is capped at 100.
  const room = Math.max(0, 100 - central);
  const extraWidth = Math.min(Math.max(0, extra), room);
  const collabWidth = Math.min(collab, Math.max(0, room - extraWidth));
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
        {extraWidth > 0 && <div className="h-full" style={{ width: `${extraWidth}%`, backgroundColor: BONUS_COLOR }} />}
        {collabWidth > 0 && <div className="h-full" style={{ width: `${collabWidth}%`, backgroundColor: COLLAB_COLOR }} />}
      </div>
      <p className="text-[11px] text-ink/60">
        KPI central {pct(central)}
        {extra > 0 && <span className="font-semibold" style={{ color: BONUS_COLOR }}> + {pct(extra)} actividades</span>}
        {extra < 0 && <span className="font-semibold text-danger"> − {pct(-extra)} por conversatorios no realizados</span>}
        {collab > 0 && <span className="font-semibold" style={{ color: COLLAB_COLOR }}> + {pct(collab)} colaboración en proyectos</span>}
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
            Actividades extraordinarias
          </div>
          <div className={`mt-1 text-sm font-semibold tabular-nums ${extra < 0 ? 'text-danger' : ''}`}>
            {signed(extra)}
            <span className="text-xs font-normal text-ink/50"> · plus máx. +{MAX_ACTIVITY_BONUS}; conversatorio no realizado resta</span>
          </div>
        </li>
        <li className="rounded-lg border border-border px-3 py-2">
          <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-ink/60">
            <span className="size-2 rounded-sm" style={{ backgroundColor: COLLAB_COLOR }} />
            Colaboración en proyectos
          </div>
          <div className="mt-1 text-sm font-semibold tabular-nums">
            {signed(collab)}
            <span className="text-xs font-normal text-ink/50"> · plus máx. +{MAX_COLLAB_BONUS}</span>
          </div>
        </li>
      </ul>
    </div>
  );
}
