// KPI types and scoring shared by API routes and the UI. No server-only imports here.

export type Member = {
  id: string;
  stationId: string;
  name: string;
  role: string;
  /** Total score of the member's most recent KPI period, or null without records. */
  latestScore: number | null;
  latestPeriod: string | null;
};

export type KpiValues = {
  operationsCount: number;
  volume: number;
  pnl: number;
  pnlPct: number;
  goal: number;
  achieved: number;
  errors: number;
  incidents: number;
  scoreOperational: number;
  scoreProjects: number;
  scoreScreenTime: number;
  notes: string;
};

/** period is the month as YYYY-MM. */
export type KpiRecord = KpiValues & { period: string };

/** Segments of the total score. Weights must add up to 1. */
export const SCORE_SEGMENTS = [
  { key: 'scoreOperational', label: 'Resultados operativos', weight: 1 / 3, color: '#283d8c' },
  { key: 'scoreProjects', label: 'Proyectos', weight: 1 / 3, color: '#14b8a6' },
  { key: 'scoreScreenTime', label: 'Tiempo en pantalla', weight: 1 / 3, color: '#eab308' },
] as const satisfies readonly { key: keyof KpiValues; label: string; weight: number; color: string }[];

export function totalScore(values: Pick<KpiValues, (typeof SCORE_SEGMENTS)[number]['key']>): number {
  const total = SCORE_SEGMENTS.reduce((sum, segment) => sum + values[segment.key] * segment.weight, 0);
  return Math.round(total * 10) / 10;
}

/** Achieved over goal, in percent. Null when there is no goal. */
export const compliance = ({ goal, achieved }: Pick<KpiValues, 'goal' | 'achieved'>) =>
  goal > 0 ? Math.round((achieved / goal) * 1000) / 10 : null;

export const EMPTY_KPIS: KpiValues = {
  operationsCount: 0,
  volume: 0,
  pnl: 0,
  pnlPct: 0,
  goal: 0,
  achieved: 0,
  errors: 0,
  incidents: 0,
  scoreOperational: 0,
  scoreProjects: 0,
  scoreScreenTime: 0,
  notes: '',
};

type Row = Record<string, unknown>;

/** Maps a kpi_records row to the API shape. Postgres numeric arrives as string. */
export function recordFromRow(row: Row): KpiRecord {
  const n = (key: string) => Number(row[key] ?? 0);
  return {
    period: String(row.period).slice(0, 7),
    operationsCount: n('operations_count'),
    volume: n('volume'),
    pnl: n('pnl'),
    pnlPct: n('pnl_pct'),
    goal: n('goal'),
    achieved: n('achieved'),
    errors: n('errors'),
    incidents: n('incidents'),
    scoreOperational: n('score_operational'),
    scoreProjects: n('score_projects'),
    scoreScreenTime: n('score_screen_time'),
    notes: String(row.notes ?? ''),
  };
}

export function rowFromValues(values: KpiValues): Row {
  return {
    operations_count: values.operationsCount,
    volume: values.volume,
    pnl: values.pnl,
    pnl_pct: values.pnlPct,
    goal: values.goal,
    achieved: values.achieved,
    errors: values.errors,
    incidents: values.incidents,
    score_operational: values.scoreOperational,
    score_projects: values.scoreProjects,
    score_screen_time: values.scoreScreenTime,
    notes: values.notes,
  };
}
