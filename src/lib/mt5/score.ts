// Operational score (0-100) and rule-based recommendations for a MetaTrader 5 report. Pure functions.
// Same four parts as the Interactive Brokers score, so both feed the same operational KPI.

import { ANNUAL_RETURN_GOAL_PCT, proRataReturnGoal } from '../goals';
import type { OperationalScore, Recommendation, SubScore } from '../ib/score';
import type { Mt5ReportData } from './report';

const clamp = (v: number) => Math.max(0, Math.min(100, v));
const round1 = (v: number) => Math.round(v * 10) / 10;
const pct = (v: number) => `${round1(v)}%`;
const money = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const scale = (v: number, from: number, to: number) => clamp(((v - from) / (to - from)) * 100);
const average = (values: (number | null)[]) => {
  const present = values.filter((v): v is number => v !== null);
  return present.length ? present.reduce((a, b) => a + b, 0) / present.length : null;
};

export type Mt5Metrics = {
  month: string;
  ytdPct: number | null;
  dueGoalPct: number;
  floatingPct: number | null;
  costsPct: number | null;
  winRatePct: number | null;
};

export function mt5Metrics(report: Mt5ReportData, annualGoal = ANNUAL_RETURN_GOAL_PCT): Mt5Metrics {
  const month = report.periodEnd.slice(0, 7);
  const balance = report.summary.balance ?? report.balanceCurve.at(-1)?.balance ?? null;
  const costs = Math.abs(report.commissions + report.swaps + report.fees);
  const gross = report.results.grossProfit;
  return {
    month,
    ytdPct: report.ytdPct,
    dueGoalPct: proRataReturnGoal(Number(month.slice(5, 7)), annualGoal),
    floatingPct: balance && report.summary.floatingPnl !== null ? round1((report.summary.floatingPnl / balance) * 100) : null,
    costsPct: gross ? round1((costs / gross) * 100) : null,
    winRatePct: report.results.profitTradesPct,
  };
}

export function mt5Score(report: Mt5ReportData, metrics: Mt5Metrics, annualGoal = ANNUAL_RETURN_GOAL_PCT): OperationalScore {
  const r = report.results;
  const rentabilidad = metrics.ytdPct === null ? null : clamp((metrics.ytdPct / metrics.dueGoalPct) * 100);

  let riesgo = 100;
  const penalties: string[] = [];
  const dd = r.balanceDrawdownRelativePct ?? r.balanceDrawdownMaximalPct;
  if (dd !== null && dd > 10) {
    riesgo -= (dd - 10) * 4;
    penalties.push(`drawdown ${pct(dd)}`);
  }
  if (metrics.floatingPct !== null && metrics.floatingPct < -10) {
    riesgo -= (Math.abs(metrics.floatingPct) - 10) * 2;
    penalties.push(`pérdida flotante ${pct(metrics.floatingPct)} del balance`);
  }

  const consistencia = average([
    r.profitFactor === null ? null : scale(r.profitFactor, 0.5, 2),
    metrics.winRatePct === null ? null : scale(metrics.winRatePct, 40, 60),
  ]);
  const disciplina = metrics.costsPct === null ? null : clamp(100 - scale(metrics.costsPct, 5, 30));

  const parts: SubScore[] = [
    {
      key: 'rentabilidad',
      label: 'Rentabilidad',
      weight: 0.35,
      score: rentabilidad,
      detail:
        metrics.ytdPct === null
          ? 'Sin retorno del año'
          : `Año a la fecha ${pct(metrics.ytdPct)} frente a ${pct(metrics.dueGoalPct)} esperado a ${metrics.month} (meta anual mínima ${pct(annualGoal)})`,
    },
    { key: 'riesgo', label: 'Riesgo', weight: 0.25, score: clamp(riesgo), detail: penalties.length ? `Penaliza: ${penalties.join(', ')}` : 'Sin penalizaciones' },
    {
      key: 'consistencia',
      label: 'Consistencia',
      weight: 0.25,
      score: consistencia,
      detail: [r.profitFactor !== null ? `profit factor ${Math.round(r.profitFactor * 100) / 100}` : null, metrics.winRatePct !== null ? `operaciones ganadoras ${pct(metrics.winRatePct)}` : null]
        .filter(Boolean)
        .join(', '),
    },
    {
      key: 'disciplina',
      label: 'Disciplina',
      weight: 0.15,
      score: disciplina,
      detail: metrics.costsPct === null ? 'Sin datos de costos' : `Comisiones y swaps = ${pct(metrics.costsPct)} del beneficio bruto`,
    },
  ];
  const scored = parts.filter((p) => p.score !== null);
  const weight = scored.reduce((s, p) => s + p.weight, 0);
  const score = weight > 0 ? round1(scored.reduce((s, p) => s + (p.score ?? 0) * p.weight, 0) / weight) : null;
  for (const p of parts) if (p.score !== null) p.score = round1(p.score);
  return { score, parts };
}

export function mt5Recommendations(report: Mt5ReportData, metrics: Mt5Metrics, annualGoal = ANNUAL_RETURN_GOAL_PCT): Recommendation[] {
  const r = report.results;
  const list: Recommendation[] = [];

  if (metrics.ytdPct !== null) {
    list.push(
      metrics.ytdPct >= metrics.dueGoalPct
        ? {
            code: 'RETURN_GOAL_ON_TRACK',
            severity: 'info',
            message: `Va en camino a la meta anual del ${pct(annualGoal)}: lleva ${pct(metrics.ytdPct)} en el año (esperado ${pct(metrics.dueGoalPct)} a ${metrics.month}).`,
            data: { ytdPct: metrics.ytdPct, duePct: metrics.dueGoalPct },
          }
        : {
            code: 'RETURN_GOAL_BEHIND',
            severity: 'aviso',
            message: `Rendimiento del año ${pct(metrics.ytdPct)} por debajo de lo esperado (${pct(metrics.dueGoalPct)} a ${metrics.month}) para la meta mínima anual del ${pct(annualGoal)}.`,
            data: { ytdPct: metrics.ytdPct, duePct: metrics.dueGoalPct },
          },
    );
  }
  if (metrics.floatingPct !== null && metrics.floatingPct < -10) {
    list.push({
      code: 'FLOATING_LOSS',
      severity: metrics.floatingPct < -20 ? 'critico' : 'aviso',
      message: `Posiciones abiertas con pérdida flotante de ${money(report.summary.floatingPnl ?? 0)} (${pct(metrics.floatingPct)} del balance): el equity está muy por debajo del balance.`,
      data: { floatingPct: metrics.floatingPct },
    });
  }
  const dd = r.balanceDrawdownRelativePct ?? r.balanceDrawdownMaximalPct;
  if (dd !== null && dd > 10) {
    list.push({ code: 'DRAWDOWN', severity: dd > 20 ? 'critico' : 'aviso', message: `Caída máxima del balance de ${pct(dd)}.`, data: { drawdownPct: dd } });
  }
  if (r.profitFactor !== null && r.profitFactor < 1) {
    list.push({ code: 'LOW_PROFIT_FACTOR', severity: 'aviso', message: `Profit factor ${r.profitFactor}: las pérdidas superan a las ganancias.`, data: { profitFactor: r.profitFactor } });
  }
  if (r.averageProfitTrade !== null && r.averageLossTrade !== null && Math.abs(r.averageLossTrade) > r.averageProfitTrade) {
    const ratio = round1(Math.abs(r.averageLossTrade) / r.averageProfitTrade);
    list.push({
      code: 'LOSS_SIZE',
      severity: ratio > 2 ? 'aviso' : 'info',
      message: `La pérdida media (${money(Math.abs(r.averageLossTrade))}) es ${ratio} veces la ganancia media (${money(r.averageProfitTrade)}): conviene ajustar stops o tomas de ganancia.`,
      data: { averageProfit: r.averageProfitTrade, averageLoss: r.averageLossTrade },
    });
  }
  const netProfit = r.totalNetProfit;
  if (netProfit && netProfit > 0 && Math.abs(report.swaps) > netProfit * 0.1) {
    list.push({
      code: 'HIGH_SWAP',
      severity: 'aviso',
      message: `Los swaps cuestan ${money(Math.abs(report.swaps))}, el ${pct((Math.abs(report.swaps) / netProfit) * 100)} del beneficio neto: revisar posiciones que se mantienen abiertas varios días.`,
      data: { swaps: report.swaps },
    });
  }
  if (r.shortWonPct !== null && r.longWonPct !== null && Math.abs(r.shortWonPct - r.longWonPct) > 10) {
    const better = r.longWonPct > r.shortWonPct ? 'largas' : 'cortas';
    list.push({
      code: 'DIRECTION_BIAS',
      severity: 'info',
      message: `Las operaciones ${better} aciertan más (largas ${pct(r.longWonPct)}, cortas ${pct(r.shortWonPct)}).`,
      data: { longWonPct: r.longWonPct, shortWonPct: r.shortWonPct },
    });
  }
  const order = { critico: 0, aviso: 1, info: 2 };
  return list.sort((a, b) => order[a.severity] - order[b.severity]);
}
