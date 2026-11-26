import { useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import type { MonthlyReturn, NavDay } from '../../../lib/ib/portfolioAnalyst';
import { money, TableFrame, Td, Th } from '../../ui';

// Categorical slots validated with the dataviz validator on the white surface (CVD ΔE 24.7, contrast >= 3:1).
export const SERIES_ACCOUNT = '#2a78d6';
export const SERIES_BENCHMARK = '#eb6834';
const GRID = '#e5e7eb';
const AXIS_TEXT = '#6b7280';

const W = 640;
const H = 220;
const PAD = { top: 12, right: 12, bottom: 24, left: 56 };

const shortDate = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString('es', { day: '2-digit', month: 'short', timeZone: 'UTC' });
const monthLabel = (month: string) => new Date(`${month}-01T00:00:00Z`).toLocaleDateString('es', { month: 'short', year: '2-digit', timeZone: 'UTC' });
const signedPct = (v: number | null) => (v === null ? '-' : `${v > 0 ? '+' : ''}${v.toFixed(2)}%`);

function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) return [min];
  const raw = (max - min) / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? raw;
  const ticks: number[] = [];
  for (let t = Math.ceil(min / step) * step; t <= max + 1e-9; t += step) ticks.push(Math.round(t * 1e6) / 1e6);
  return ticks;
}

function Tooltip({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  // x/y in % of the chart box; flips to the left half past the middle.
  return (
    <div
      className="pointer-events-none absolute z-10 rounded-md border border-border bg-surface px-2.5 py-1.5 text-[11px] shadow-lg"
      style={{ left: `${x}%`, top: `${y}%`, transform: `translate(${x > 60 ? 'calc(-100% - 10px)' : '10px'}, -50%)` }}
    >
      {children}
    </div>
  );
}

function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-ink/60 hover:text-ink">Ver datos</summary>
      <div className="mt-2 max-h-64 overflow-auto">
        <TableFrame>
          <thead>
            <tr className="border-b border-border">
              {head.map((h, i) => (
                <Th key={h} right={i > 0}>
                  {h}
                </Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={String(r[0])} className="border-b border-border last:border-0">
                {r.map((c, i) => (
                  <Td key={i} right={i > 0}>
                    {c}
                  </Td>
                ))}
              </tr>
            ))}
          </tbody>
        </TableFrame>
      </div>
    </details>
  );
}

/** Daily NAV as a single line with a crosshair tooltip. */
export function NavChart({ days, currency }: { days: NavDay[]; currency: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);

  const geometry = useMemo(() => {
    const values = days.map((d) => d.nav);
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const pad = (hi - lo) * 0.08 || hi * 0.02 || 1;
    const ticks = niceTicks(lo - pad, hi + pad);
    const min = Math.min(ticks[0], lo);
    const max = Math.max(ticks.at(-1) ?? hi, hi);
    const x = (i: number) => PAD.left + (i / Math.max(1, days.length - 1)) * (W - PAD.left - PAD.right);
    const y = (v: number) => PAD.top + (1 - (v - min) / (max - min || 1)) * (H - PAD.top - PAD.bottom);
    const path = days.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.nav).toFixed(1)}`).join('');
    return { x, y, ticks, path };
  }, [days]);

  if (days.length < 2) return <p className="text-xs text-ink/60">El informe no trae NAV diario.</p>;

  function onMove(event: PointerEvent<SVGSVGElement>) {
    const box = svg.current?.getBoundingClientRect();
    if (!box) return;
    const px = ((event.clientX - box.left) / box.width) * W;
    const i = Math.round(((px - PAD.left) / (W - PAD.left - PAD.right)) * (days.length - 1));
    setHover(Math.max(0, Math.min(days.length - 1, i)));
  }

  const labelEvery = Math.ceil(days.length / 6);
  const hovered = hover === null ? null : days[hover];

  return (
    <div className="space-y-2">
      <div className="relative">
        <svg
          ref={svg}
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full touch-none"
          role="img"
          aria-label={`NAV diario de ${money(days[0].nav)} a ${money(days.at(-1)!.nav)} ${currency}`}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        >
          {geometry.ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={geometry.y(t)} y2={geometry.y(t)} stroke={GRID} strokeWidth={1} />
              <text x={PAD.left - 6} y={geometry.y(t) + 3} textAnchor="end" fontSize={10} fill={AXIS_TEXT}>
                {Math.round(t).toLocaleString('en-US')}
              </text>
            </g>
          ))}
          {days.map((d, i) =>
            i % labelEvery === 0 ? (
              <text key={d.day} x={geometry.x(i)} y={H - 6} textAnchor="middle" fontSize={10} fill={AXIS_TEXT}>
                {shortDate(d.day)}
              </text>
            ) : null,
          )}
          <path d={geometry.path} fill="none" stroke={SERIES_ACCOUNT} strokeWidth={2} strokeLinejoin="round" />
          {hovered && hover !== null && (
            <g>
              <line x1={geometry.x(hover)} x2={geometry.x(hover)} y1={PAD.top} y2={H - PAD.bottom} stroke={AXIS_TEXT} strokeWidth={1} strokeDasharray="3 3" />
              <circle cx={geometry.x(hover)} cy={geometry.y(hovered.nav)} r={4} fill={SERIES_ACCOUNT} stroke="#fff" strokeWidth={2} />
            </g>
          )}
        </svg>
        {hovered && hover !== null && (
          <Tooltip x={(geometry.x(hover) / W) * 100} y={(geometry.y(hovered.nav) / H) * 100}>
            <div className="text-ink/60">{shortDate(hovered.day)}</div>
            <div className="font-semibold tabular-nums">
              {money(hovered.nav)} {currency}
            </div>
          </Tooltip>
        )}
      </div>
      <DataTable head={['Fecha', `NAV (${currency})`]} rows={days.map((d) => [d.day, money(d.nav)])} />
    </div>
  );
}

/** Monthly returns of the account next to the S&P 500, bars from a zero baseline. */
export function MonthlyReturnsChart({ months }: { months: MonthlyReturn[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const data = months.slice(-12);

  const geometry = useMemo(() => {
    const values = data.flatMap((m) => [m.account, m.benchmarks.SPXTR ?? null]).filter((v): v is number => v !== null);
    const ticks = niceTicks(Math.min(0, ...values), Math.max(0, ...values));
    const min = Math.min(ticks[0], 0);
    const max = Math.max(ticks.at(-1) ?? 0, 0);
    const y = (v: number) => PAD.top + (1 - (v - min) / (max - min || 1)) * (H - PAD.top - PAD.bottom);
    const slot = (W - PAD.left - PAD.right) / Math.max(1, data.length);
    return { y, ticks, slot };
  }, [data]);

  if (data.length === 0) return <p className="text-xs text-ink/60">El informe no trae retornos mensuales.</p>;

  const barW = Math.min(14, geometry.slot / 3);
  const zero = geometry.y(0);
  const bar = (v: number | null, x: number, color: string) => {
    if (v === null) return null;
    const top = Math.min(geometry.y(v), zero);
    const h = Math.max(1, Math.abs(geometry.y(v) - zero));
    return <rect x={x} y={top} width={barW} height={h} rx={Math.min(4, barW / 2)} fill={color} />;
  };
  const hovered = hover === null ? null : data[hover];
  // MetaTrader 5 reports have no benchmark: a single series needs no legend.
  const hasBenchmark = data.some((m) => m.benchmarks.SPXTR != null);

  return (
    <div className="space-y-2">
      {hasBenchmark && (
        <div className="flex flex-wrap gap-4 text-[11px] text-ink/70" aria-hidden>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ backgroundColor: SERIES_ACCOUNT }} />
            Cuenta
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ backgroundColor: SERIES_BENCHMARK }} />
            S&P 500 (SPXTR)
          </span>
        </div>
      )}
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Retorno mensual de la cuenta frente al S&P 500" onPointerLeave={() => setHover(null)}>
          {geometry.ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={geometry.y(t)} y2={geometry.y(t)} stroke={t === 0 ? AXIS_TEXT : GRID} strokeWidth={1} />
              <text x={PAD.left - 6} y={geometry.y(t) + 3} textAnchor="end" fontSize={10} fill={AXIS_TEXT}>
                {t}%
              </text>
            </g>
          ))}
          {data.map((m, i) => {
            const cx = PAD.left + geometry.slot * (i + 0.5);
            return (
              <g key={m.month} onPointerEnter={() => setHover(i)}>
                <rect x={cx - geometry.slot / 2} y={PAD.top} width={geometry.slot} height={H - PAD.top - PAD.bottom} fill="transparent" />
                {hover === i && <rect x={cx - geometry.slot / 2} y={PAD.top} width={geometry.slot} height={H - PAD.top - PAD.bottom} fill="#f3f4f6" />}
                {bar(m.account, hasBenchmark ? cx - barW - 1 : cx - barW / 2, SERIES_ACCOUNT)}
                {hasBenchmark && bar(m.benchmarks.SPXTR ?? null, cx + 1, SERIES_BENCHMARK)}
                <text x={cx} y={H - 6} textAnchor="middle" fontSize={10} fill={AXIS_TEXT}>
                  {monthLabel(m.month)}
                </text>
              </g>
            );
          })}
        </svg>
        {hovered && hover !== null && (
          <Tooltip x={((PAD.left + geometry.slot * (hover + 0.5)) / W) * 100} y={30}>
            <div className="text-ink/60 capitalize">{monthLabel(hovered.month)}</div>
            <div className="tabular-nums">Cuenta: {signedPct(hovered.account)}</div>
            {hasBenchmark && <div className="tabular-nums">S&P 500: {signedPct(hovered.benchmarks.SPXTR ?? null)}</div>}
          </Tooltip>
        )}
      </div>
      <DataTable
        head={hasBenchmark ? ['Mes', 'Cuenta', 'S&P 500', 'EFA', 'VT'] : ['Mes', 'Retorno']}
        rows={data.map((m) =>
          hasBenchmark
            ? [m.month, signedPct(m.account), signedPct(m.benchmarks.SPXTR ?? null), signedPct(m.benchmarks.EFA ?? null), signedPct(m.benchmarks.VT ?? null)]
            : [m.month, signedPct(m.account)],
        )}
      />
    </div>
  );
}

/** Share of NAV per asset class on the last day: horizontal bars, one hue (magnitude). */
export function AllocationBars({ day, currency }: { day: NavDay | undefined; currency: string }) {
  if (!day) return <p className="text-xs text-ink/60">El informe no trae la asignación por tipo de activo.</p>;
  const entries = Object.entries(day.byClass).filter(([, v]) => v !== 0);
  const maxAbs = Math.max(...entries.map(([, v]) => Math.abs(v)), 1);
  return (
    <ul className="space-y-2">
      {entries.map(([name, value]) => {
        const share = (value / day.nav) * 100;
        return (
          <li key={name} className="grid grid-cols-[7rem_1fr_9rem] items-center gap-2 text-xs">
            <span className="truncate text-ink/70">{name}</span>
            <div className="h-2 overflow-hidden rounded-full bg-border/50" aria-hidden>
              <div className="h-full rounded-full" style={{ width: `${(Math.abs(value) / maxAbs) * 100}%`, backgroundColor: value < 0 ? '#9ca3af' : SERIES_ACCOUNT }} />
            </div>
            <span className="text-right tabular-nums">
              {share.toFixed(1)}% · {money(value)} {currency}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
