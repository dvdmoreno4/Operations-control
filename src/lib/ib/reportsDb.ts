// Server-only: stores a parsed IB report and reads it back for the API.

import { ApiError, db, unwrap } from '../api';
import { DOCUMENTS_BUCKET } from '../storage';
import type { IbReportData } from './portfolioAnalyst';
import { computeMetrics, operationalScore, recommendations, type ScoreSettings } from './score';
import type { IbReportAnalytics, IbReportDetail, IbReportListItem } from './types';

type Row = Record<string, unknown>;

const n = (value: unknown) => (value === null || value === undefined ? null : Number(value));
const s = (value: unknown) => (value === null || value === undefined ? '' : String(value));

export async function loadScoreSettings(): Promise<ScoreSettings> {
  const rows = unwrap(await db().from('kpi_settings').select('monthly_return_goal_pct, max_position_pct').limit(1)) as Row[];
  return {
    monthlyReturnGoalPct: Number(rows[0]?.monthly_return_goal_pct ?? 1),
    maxPositionPct: Number(rows[0]?.max_position_pct ?? 25),
  };
}

/**
 * Saves the report of a member, replacing any earlier report for the same month (and its PDF),
 * and writes the operational score into that month's KPI record.
 */
export async function saveReport(memberId: string, filePath: string, fileName: string, report: IbReportData): Promise<{ id: string; period: string; score: number | null }> {
  const client = db();
  const settings = await loadScoreSettings();
  const metrics = computeMetrics(report);
  const score = operationalScore(report, metrics, settings);
  const recs = recommendations(report, metrics, settings);
  const period = `${metrics.month}-01`;
  const analytics: IbReportAnalytics = { summary: report.summary, returns: report.returns, risk: report.risk, metrics, scoreParts: score.parts };
  const risk = report.risk.account;

  const previous = unwrap(await client.from('ib_reports').select('id, file_path').eq('member_id', memberId).eq('period', period)) as Row[];
  if (previous.length > 0) {
    unwrap(await client.from('ib_reports').delete().in('id', previous.map((r) => s(r.id))).select('id'));
    const oldFiles = previous.map((r) => s(r.file_path)).filter((p) => p && p !== filePath);
    if (oldFiles.length) {
      const { error } = await client.storage.from(DOCUMENTS_BUCKET).remove(oldFiles);
      if (error) console.error(error.message);
    }
  }

  const [inserted] = unwrap(
    await client
      .from('ib_reports')
      .insert({
        member_id: memberId,
        period,
        file_path: filePath,
        file_name: fileName,
        account_id: report.accountId,
        account_name: report.accountName,
        account_type: report.accountType,
        base_currency: report.baseCurrency,
        period_start: report.periodStart,
        period_end: report.periodEnd,
        nav_start: report.summary.navStart,
        nav_end: report.summary.navEnd,
        twr_pct: report.summary.cumulativeReturnPct,
        return_mtd_pct: report.returns.account?.mtd ?? null,
        return_ytd_pct: report.returns.account?.ytd ?? null,
        realized_pnl: metrics.realizedPnl,
        unrealized_pnl: metrics.unrealizedPnl,
        mtm_pnl: report.summary.mtm,
        commissions: report.summary.feesCommissions,
        deposits: report.summary.depositsWithdrawals,
        dividends: report.summary.dividends,
        interest: report.summary.interest,
        change_in_nav: report.summary.changeInNav,
        other_pnl: report.summary.other,
        trades_count: metrics.tradedSymbols,
        win_rate_pct: metrics.winRatePct,
        profit_factor: metrics.profitFactor,
        max_drawdown_pct: risk?.maxDrawdownPct ?? null,
        sharpe_ratio: risk?.sharpe ?? null,
        sortino_ratio: risk?.sortino ?? null,
        std_dev_pct: risk?.stdDevPct ?? null,
        positive_periods_pct: risk?.positivePeriodsPct ?? null,
        top_position_pct: metrics.topPosition?.weightPct ?? null,
        cash_balance: metrics.cashBalance,
        short_options_pct: metrics.shortOptionsPct,
        fees_ratio_pct: metrics.feesRatioPct,
        score: score.score,
        score_detail: Object.fromEntries(score.parts.map((p) => [p.key, p.score])),
        analytics,
        warnings: report.warnings,
      })
      .select('id'),
  ) as Row[];
  const id = s(inserted.id);

  try {
    const inserts: [string, Row[]][] = [
      [
        'ib_positions',
        report.positions.map((p) => ({
          report_id: id,
          symbol: p.symbol,
          description: p.description,
          asset_class: p.assetClass,
          sector: p.sector,
          quantity: p.quantity,
          close_price: p.closePrice,
          local_value: p.value,
          cost_basis: p.costBasis,
          market_value: p.baseValue ?? p.value ?? 0,
          unrealized_pnl: p.unrealizedPnl,
          weight_pct: p.weightPct,
          currency: p.currency,
        })),
      ],
      ['ib_nav_daily', dedupeBy(report.navDaily, (d) => d.day).map((d) => ({ report_id: id, day: d.day, nav: d.nav, by_class: d.byClass }))],
      [
        'ib_monthly_returns',
        report.monthlyReturns.map((m) => ({ report_id: id, month: `${m.month}-01`, account_pct: m.account, benchmarks: m.benchmarks })),
      ],
      [
        'ib_symbol_performance',
        report.symbols.map((x) => ({
          report_id: id,
          symbol: x.symbol,
          description: x.description,
          sector: x.sector,
          asset_class: x.assetClass,
          avg_weight_pct: x.avgWeightPct,
          return_pct: x.returnPct,
          contribution_pct: x.contributionPct,
          unrealized_pnl: x.unrealizedPnl,
          realized_pnl: x.realizedPnl,
          is_open: x.open,
        })),
      ],
      [
        'ib_trade_summary',
        report.trades.map((t) => ({
          report_id: id,
          symbol: t.symbol,
          description: t.description,
          sector: t.sector,
          asset_class: t.assetClass,
          currency: t.currency,
          bought_qty: t.boughtQty,
          bought_avg_price: t.boughtAvgPrice,
          bought_proceeds: t.boughtProceeds,
          sold_qty: t.soldQty,
          sold_avg_price: t.soldAvgPrice,
          sold_proceeds: t.soldProceeds,
        })),
      ],
      ['ib_recommendations', recs.map((r) => ({ report_id: id, code: r.code, severity: r.severity, message: r.message, data: r.data }))],
    ];
    for (const [table, rows] of inserts) {
      if (rows.length) unwrap(await client.from(table).insert(rows).select('report_id'));
    }

    // The operational score feeds the member's KPI of that month; other KPI fields are left as they are.
    if (score.score !== null) {
      unwrap(
        await client
          .from('kpi_records')
          .upsert({ member_id: memberId, period, score_operational: score.score, updated_at: new Date().toISOString() })
          .select('member_id'),
      );
    }
  } catch (error) {
    // Do not leave a half-saved report behind; child rows go with it (on delete cascade).
    await client.from('ib_reports').delete().eq('id', id);
    throw error;
  }

  return { id, period: metrics.month, score: score.score };
}

function dedupeBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const LIST_COLUMNS = 'id, member_id, period, period_start, period_end, file_name, account_id, nav_end, twr_pct, score, uploaded_at';

function listItem(row: Row): IbReportListItem {
  return {
    id: s(row.id),
    period: s(row.period).slice(0, 7),
    periodStart: row.period_start ? s(row.period_start) : null,
    periodEnd: row.period_end ? s(row.period_end) : null,
    fileName: s(row.file_name),
    accountId: s(row.account_id),
    navEnd: n(row.nav_end),
    returnPct: n(row.twr_pct),
    score: n(row.score),
    uploadedAt: s(row.uploaded_at),
  };
}

export async function listReports(memberId: string): Promise<IbReportListItem[]> {
  const rows = unwrap(await db().from('ib_reports').select(LIST_COLUMNS).eq('member_id', memberId).order('period', { ascending: false })) as Row[];
  return rows.map(listItem);
}

export const REPORT_NOT_FOUND = 'Informe no encontrado';

export async function loadReport(id: string): Promise<IbReportDetail> {
  const client = db();
  const [report] = unwrap(await client.from('ib_reports').select('*').eq('id', id)) as Row[];
  if (!report) throw new ApiError(404, REPORT_NOT_FOUND);

  const byReport = (table: string, order: string) => client.from(table).select('*').eq('report_id', id).order(order);
  const [positions, nav, monthly, symbols, trades, recs] = (
    await Promise.all([
      byReport('ib_positions', 'id'),
      byReport('ib_nav_daily', 'day'),
      byReport('ib_monthly_returns', 'month'),
      byReport('ib_symbol_performance', 'id'),
      byReport('ib_trade_summary', 'id'),
      byReport('ib_recommendations', 'id'),
    ])
  ).map((result) => unwrap(result) as Row[]);

  return {
    ...listItem(report),
    memberId: s(report.member_id),
    accountName: s(report.account_name),
    accountType: s(report.account_type),
    baseCurrency: s(report.base_currency),
    analytics: report.analytics as IbReportAnalytics,
    warnings: (report.warnings as string[] | null) ?? [],
    monthlyReturns: monthly.map((m) => ({ month: s(m.month).slice(0, 7), account: n(m.account_pct), benchmarks: (m.benchmarks as Record<string, number | null>) ?? {} })),
    positions: positions.map((p) => ({
      symbol: s(p.symbol),
      description: s(p.description),
      sector: s(p.sector),
      assetClass: s(p.asset_class),
      currency: s(p.currency),
      quantity: n(p.quantity),
      closePrice: n(p.close_price),
      value: n(p.local_value),
      costBasis: n(p.cost_basis),
      unrealizedPnl: n(p.unrealized_pnl),
      baseValue: n(p.market_value),
      weightPct: n(p.weight_pct),
    })),
    navDaily: nav.map((d) => ({ day: s(d.day), nav: Number(d.nav), byClass: (d.by_class as Record<string, number>) ?? {} })),
    symbols: symbols.map((x) => ({
      symbol: s(x.symbol),
      description: s(x.description),
      sector: s(x.sector),
      assetClass: s(x.asset_class),
      avgWeightPct: n(x.avg_weight_pct),
      returnPct: n(x.return_pct),
      contributionPct: n(x.contribution_pct),
      unrealizedPnl: n(x.unrealized_pnl),
      realizedPnl: n(x.realized_pnl),
      open: Boolean(x.is_open),
    })),
    trades: trades.map((t) => ({
      symbol: s(t.symbol),
      description: s(t.description),
      sector: s(t.sector),
      assetClass: s(t.asset_class),
      currency: s(t.currency),
      boughtQty: n(t.bought_qty),
      boughtAvgPrice: n(t.bought_avg_price),
      boughtProceeds: n(t.bought_proceeds),
      soldQty: n(t.sold_qty),
      soldAvgPrice: n(t.sold_avg_price),
      soldProceeds: n(t.sold_proceeds),
    })),
    recommendations: recs.map((r) => ({
      code: s(r.code),
      severity: s(r.severity) as 'info' | 'aviso' | 'critico',
      message: s(r.message),
      data: (r.data as Record<string, unknown>) ?? {},
    })),
  };
}

export async function deleteReport(id: string) {
  const client = db();
  const [report] = unwrap(await client.from('ib_reports').select('file_path').eq('id', id)) as Row[];
  if (!report) throw new ApiError(404, REPORT_NOT_FOUND);
  const { error } = await client.storage.from(DOCUMENTS_BUCKET).remove([s(report.file_path)]);
  if (error) console.error(error.message);
  unwrap(await client.from('ib_reports').delete().eq('id', id).select('id'));
}
