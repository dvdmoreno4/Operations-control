// Operational score (0-100) and rule-based recommendations for a parsed IB report. Pure functions.

import { ANNUAL_RETURN_GOAL_PCT, proRataReturnGoal } from '../goals';
import type { IbReportData } from './portfolioAnalyst';

/** annualReturnGoalPct: minimum return a year (25%). */
export type ScoreSettings = { annualReturnGoalPct: number; maxPositionPct: number };
export const DEFAULT_SCORE_SETTINGS: ScoreSettings = { annualReturnGoalPct: ANNUAL_RETURN_GOAL_PCT, maxPositionPct: 25 };

export type Metrics = {
  /** Month the score is for (YYYY-MM): the last month of the report. */
  month: string;
  monthReturnPct: number | null;
  benchmarkMonthReturnPct: number | null;
  /** Return of the year to date, in %. */
  ytdPct: number | null;
  realizedPnl: number;
  unrealizedPnl: number;
  closedPositions: number;
  winRatePct: number | null;
  profitFactor: number | null;
  avgWin: number | null;
  avgLoss: number | null;
  topPosition: { symbol: string; weightPct: number } | null;
  cashBalance: number;
  shortOptionsPct: number | null;
  feesRatioPct: number | null;
  tradedSymbols: number;
};

export type SubScore = { key: 'rentabilidad' | 'riesgo' | 'consistencia' | 'disciplina'; label: string; weight: number; score: number | null; detail: string };
export type OperationalScore = { score: number | null; parts: SubScore[] };

export type Recommendation = { code: string; severity: 'info' | 'aviso' | 'critico'; message: string; data: Record<string, unknown> };

const clamp = (value: number) => Math.max(0, Math.min(100, value));
const round1 = (value: number) => Math.round(value * 10) / 10;
const pct = (value: number) => `${round1(value)}%`;
const money = (value: number) => value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const average = (values: (number | null)[]) => {
  const present = values.filter((v): v is number => v !== null);
  return present.length ? present.reduce((a, b) => a + b, 0) / present.length : null;
};

/** Linear map: `from` gives 0 points, `to` gives 100, clamped. */
const scale = (value: number, from: number, to: number) => clamp(((value - from) / (to - from)) * 100);

export function computeMetrics(report: IbReportData): Metrics {
  const month = report.periodEnd.slice(0, 7);
  const monthly = report.monthlyReturns.find((m) => m.month === month);
  // The last month is usually incomplete and shows "-" in the monthly table: use MTD for it.
  const monthReturnPct = monthly?.account ?? report.returns.account?.mtd ?? null;
  const benchmarkMonthReturnPct = monthly?.benchmarks.SPXTR ?? report.returns.benchmarks.SPXTR?.mtd ?? null;

  const realized = report.symbols.map((s) => s.realizedPnl).filter((v): v is number => v !== null && v !== 0);
  const wins = realized.filter((v) => v > 0);
  const losses = realized.filter((v) => v < 0);
  const grossWin = wins.reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));

  const holdings = report.positions.filter((p) => p.assetClass !== 'Cash' && p.weightPct !== null);
  const top = holdings.reduce<{ symbol: string; weightPct: number } | null>(
    (best, p) => (p.weightPct !== null && (!best || Math.abs(p.weightPct) > Math.abs(best.weightPct)) ? { symbol: p.symbol, weightPct: p.weightPct } : best),
    null,
  );
  const cashBalance = report.positions.filter((p) => p.assetClass === 'Cash').reduce((sum, p) => sum + (p.baseValue ?? 0), 0);
  const shortOptions = report.positions
    .filter((p) => p.assetClass === 'Options' && (p.baseValue ?? 0) < 0)
    .reduce((sum, p) => sum + Math.abs(p.baseValue ?? 0), 0);
  const nav = report.summary.navEnd;
  const { feesCommissions: fees, mtm } = report.summary;

  return {
    month,
    monthReturnPct,
    benchmarkMonthReturnPct,
    ytdPct: report.returns.account?.ytd ?? null,
    realizedPnl: report.symbols.reduce((sum, s) => sum + (s.realizedPnl ?? 0), 0),
    unrealizedPnl: report.positions.reduce((sum, p) => sum + (p.unrealizedPnl ?? 0), 0),
    closedPositions: report.symbols.filter((s) => !s.open).length,
    winRatePct: realized.length ? round1((wins.length / realized.length) * 100) : null,
    // Without realized losses the profit factor is undefined (infinite), so it is left out of the score.
    profitFactor: grossLoss > 0 ? Math.round((grossWin / grossLoss) * 100) / 100 : null,
    avgWin: wins.length ? grossWin / wins.length : null,
    avgLoss: losses.length ? grossLoss / losses.length : null,
    topPosition: top,
    cashBalance,
    shortOptionsPct: nav ? round1((shortOptions / nav) * 100) : null,
    feesRatioPct: fees !== null && mtm ? round1((Math.abs(fees) / Math.max(Math.abs(mtm), 1)) * 100) : null,
    tradedSymbols: report.trades.length,
  };
}

export function operationalScore(report: IbReportData, metrics: Metrics, settings: ScoreSettings = DEFAULT_SCORE_SETTINGS): OperationalScore {
  const risk = report.risk.account;

  // Rentabilidad: year-to-date return over the share of the annual goal due by this month
  // (25% x months / 12). On or above pace gives 100; a negative year gives 0.
  const monthNumber = Number(metrics.month.slice(5, 7));
  const dueGoal = proRataReturnGoal(monthNumber, settings.annualReturnGoalPct);
  const rentabilidad = metrics.ytdPct === null ? null : clamp((metrics.ytdPct / dueGoal) * 100);

  // Riesgo: 100 minus penalties for drawdown over 10%, concentration over the limit, margin use and short options.
  let riesgo = 100;
  const penalties: string[] = [];
  if (risk?.maxDrawdownPct != null && risk.maxDrawdownPct > 10) {
    riesgo -= (risk.maxDrawdownPct - 10) * 4;
    penalties.push(`drawdown ${pct(risk.maxDrawdownPct)}`);
  }
  if (metrics.topPosition && Math.abs(metrics.topPosition.weightPct) > settings.maxPositionPct) {
    riesgo -= (Math.abs(metrics.topPosition.weightPct) - settings.maxPositionPct) * 2;
    penalties.push(`${metrics.topPosition.symbol} ${pct(metrics.topPosition.weightPct)} del NAV`);
  }
  if (metrics.cashBalance < 0) {
    riesgo -= 10;
    penalties.push('efectivo negativo');
  }
  if (metrics.shortOptionsPct !== null && metrics.shortOptionsPct > 15) {
    riesgo -= metrics.shortOptionsPct - 15;
    penalties.push(`opciones cortas ${pct(metrics.shortOptionsPct)} del NAV`);
  }

  // Consistencia: profit factor (0.5 -> 0, 2 -> 100), positive days (40% -> 0, 60% -> 100), Sharpe (0 -> 0, 2 -> 100).
  const consistencia = average([
    metrics.profitFactor === null ? null : scale(metrics.profitFactor, 0.5, 2),
    risk?.positivePeriodsPct == null ? null : scale(risk.positivePeriodsPct, 40, 60),
    risk?.sharpe == null ? null : scale(risk.sharpe, 0, 2),
  ]);

  // Disciplina: fees over MTM (5% or less -> 100, 30% or more -> 0).
  const disciplina = metrics.feesRatioPct === null ? null : clamp(100 - scale(metrics.feesRatioPct, 5, 30));

  const parts: SubScore[] = [
    {
      key: 'rentabilidad',
      label: 'Rentabilidad',
      weight: 0.35,
      score: rentabilidad,
      detail:
        metrics.ytdPct === null
          ? 'Sin retorno del año en el informe'
          : `Año a la fecha ${pct(metrics.ytdPct)} frente a ${pct(dueGoal)} esperado a ${metrics.month} (meta anual mínima ${pct(settings.annualReturnGoalPct)})`,
    },
    { key: 'riesgo', label: 'Riesgo', weight: 0.25, score: clamp(riesgo), detail: penalties.length ? `Penaliza: ${penalties.join(', ')}` : 'Sin penalizaciones' },
    {
      key: 'consistencia',
      label: 'Consistencia',
      weight: 0.25,
      score: consistencia,
      detail: [
        metrics.profitFactor !== null ? `profit factor ${metrics.profitFactor}` : null,
        metrics.winRatePct !== null ? `win rate ${pct(metrics.winRatePct)}` : null,
        risk?.sharpe != null ? `Sharpe ${risk.sharpe}` : null,
      ]
        .filter(Boolean)
        .join(', '),
    },
    {
      key: 'disciplina',
      label: 'Disciplina',
      weight: 0.15,
      score: disciplina,
      detail: metrics.feesRatioPct === null ? 'Sin datos de comisiones' : `Comisiones = ${pct(metrics.feesRatioPct)} del MTM`,
    },
  ];

  const scored = parts.filter((p) => p.score !== null);
  const weight = scored.reduce((sum, p) => sum + p.weight, 0);
  const score = weight > 0 ? round1(scored.reduce((sum, p) => sum + (p.score ?? 0) * p.weight, 0) / weight) : null;
  for (const p of parts) if (p.score !== null) p.score = round1(p.score);
  return { score, parts };
}

export function recommendations(report: IbReportData, metrics: Metrics, settings: ScoreSettings = DEFAULT_SCORE_SETTINGS): Recommendation[] {
  const list: Recommendation[] = [];
  const risk = report.risk.account;
  const spx = report.risk.benchmarks.SPXTR;

  if (metrics.topPosition && Math.abs(metrics.topPosition.weightPct) > settings.maxPositionPct) {
    const { symbol, weightPct } = metrics.topPosition;
    list.push({
      code: 'CONCENTRATION',
      severity: Math.abs(weightPct) > settings.maxPositionPct * 1.5 ? 'critico' : 'aviso',
      message: `Concentración: ${symbol} representa el ${pct(weightPct)} del NAV (límite ${pct(settings.maxPositionPct)}).`,
      data: { symbol, weightPct, limitPct: settings.maxPositionPct },
    });
  }
  if (metrics.cashBalance < 0) {
    list.push({
      code: 'NEGATIVE_CASH',
      severity: 'aviso',
      message: `Saldo de efectivo negativo (${money(metrics.cashBalance)} ${report.baseCurrency}): la cuenta usa margen.`,
      data: { cashBalance: metrics.cashBalance },
    });
  }
  if (metrics.shortOptionsPct !== null && metrics.shortOptionsPct > 10) {
    list.push({
      code: 'SHORT_OPTIONS',
      severity: metrics.shortOptionsPct > 20 ? 'critico' : 'aviso',
      message: `Opciones vendidas por un ${pct(metrics.shortOptionsPct)} del NAV: revisar el riesgo de asignación.`,
      data: { shortOptionsPct: metrics.shortOptionsPct },
    });
  }
  if (risk?.maxDrawdownPct != null) {
    if (risk.maxDrawdownPct > 10) {
      list.push({
        code: 'DRAWDOWN',
        severity: risk.maxDrawdownPct > 20 ? 'critico' : 'aviso',
        message: `Caída máxima del ${pct(risk.maxDrawdownPct)} en el periodo${risk.peakToValley ? ` (${risk.peakToValley})` : ''}.`,
        data: { maxDrawdownPct: risk.maxDrawdownPct },
      });
    } else if (spx?.maxDrawdownPct != null && risk.maxDrawdownPct > spx.maxDrawdownPct) {
      list.push({
        code: 'DRAWDOWN_VS_BENCHMARK',
        severity: 'aviso',
        message: `La caída máxima (${pct(risk.maxDrawdownPct)}) supera a la del S&P 500 (${pct(spx.maxDrawdownPct)}).`,
        data: { maxDrawdownPct: risk.maxDrawdownPct, benchmarkPct: spx.maxDrawdownPct },
      });
    }
  }

  const ytd = report.returns.account?.ytd;
  const spxYtd = report.returns.benchmarks.SPXTR?.ytd;
  if (ytd != null) {
    const due = proRataReturnGoal(Number(metrics.month.slice(5, 7)), settings.annualReturnGoalPct);
    list.push(
      ytd >= due
        ? {
            code: 'RETURN_GOAL_ON_TRACK',
            severity: 'info',
            message: `Va en camino a la meta anual del ${pct(settings.annualReturnGoalPct)}: lleva ${pct(ytd)} en el año (esperado ${pct(due)} a ${metrics.month}).`,
            data: { ytdPct: ytd, duePct: due, annualGoalPct: settings.annualReturnGoalPct },
          }
        : {
            code: 'RETURN_GOAL_BEHIND',
            severity: 'aviso',
            message: `Rendimiento del año ${pct(ytd)} por debajo de lo esperado (${pct(due)} a ${metrics.month}) para la meta mínima anual del ${pct(settings.annualReturnGoalPct)}.`,
            data: { ytdPct: ytd, duePct: due, annualGoalPct: settings.annualReturnGoalPct },
          },
    );
  }
  if (ytd != null && spxYtd != null) {
    const diff = round1(ytd - spxYtd);
    list.push({
      code: diff >= 0 ? 'OUTPERFORM' : 'UNDERPERFORM',
      severity: diff >= 0 ? 'info' : 'aviso',
      message:
        diff >= 0
          ? `En el año va ${pct(ytd)}, ${diff} puntos por encima del S&P 500 (${pct(spxYtd)}).`
          : `En el año va ${pct(ytd)}, ${Math.abs(diff)} puntos por debajo del S&P 500 (${pct(spxYtd)}).`,
      data: { ytdPct: ytd, benchmarkYtdPct: spxYtd },
    });
  }

  if (metrics.profitFactor !== null && metrics.profitFactor < 1) {
    list.push({
      code: 'LOW_PROFIT_FACTOR',
      severity: 'aviso',
      message: `Profit factor ${metrics.profitFactor}: las pérdidas realizadas superan a las ganancias.`,
      data: { profitFactor: metrics.profitFactor },
    });
  }
  if (metrics.avgWin !== null && metrics.avgLoss !== null && metrics.avgLoss > metrics.avgWin * 2) {
    list.push({
      code: 'LOSS_SIZE',
      severity: 'aviso',
      message: `La pérdida media (${money(metrics.avgLoss)}) es ${round1(metrics.avgLoss / metrics.avgWin)} veces la ganancia media (${money(metrics.avgWin)}): revisar stops.`,
      data: { avgWin: metrics.avgWin, avgLoss: metrics.avgLoss, winRatePct: metrics.winRatePct },
    });
  }
  if (metrics.feesRatioPct !== null && metrics.feesRatioPct > 15) {
    list.push({
      code: 'HIGH_FEES',
      severity: 'aviso',
      message: `Las comisiones equivalen al ${pct(metrics.feesRatioPct)} del resultado (MTM).`,
      data: { feesRatioPct: metrics.feesRatioPct },
    });
  }
  if (risk?.sharpe != null && risk.sharpe < 1) {
    list.push({ code: 'LOW_SHARPE', severity: 'aviso', message: `Sharpe de ${risk.sharpe}: poco retorno por unidad de riesgo.`, data: { sharpe: risk.sharpe } });
  }

  const losers = report.positions
    .filter((p) => p.assetClass !== 'Cash' && p.unrealizedPnl !== null && p.costBasis && p.unrealizedPnl < 0 && Math.abs(p.unrealizedPnl / p.costBasis) > 0.25)
    .sort((a, b) => (a.unrealizedPnl ?? 0) - (b.unrealizedPnl ?? 0))
    .slice(0, 3);
  if (losers.length) {
    list.push({
      code: 'LOSING_POSITIONS',
      severity: 'info',
      message: `Posiciones abiertas con pérdida de más del 25%: ${losers.map((p) => `${p.symbol} (${money(p.unrealizedPnl ?? 0)})`).join(', ')}.`,
      data: { symbols: losers.map((p) => p.symbol) },
    });
  }

  const recent = report.monthlyReturns.filter((m) => m.account !== null).slice(-3);
  if (recent.length >= 2 && recent.slice(-2).every((m) => (m.account ?? 0) < 0)) {
    list.push({
      code: 'NEGATIVE_STREAK',
      severity: 'aviso',
      message: `Dos o más meses seguidos en negativo (${recent.map((m) => `${m.month}: ${pct(m.account ?? 0)}`).join(', ')}).`,
      data: { months: recent },
    });
  }

  const order = { critico: 0, aviso: 1, info: 2 };
  return list.sort((a, b) => order[a.severity] - order[b.severity]);
}
