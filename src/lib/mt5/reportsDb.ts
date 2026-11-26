// Server-only: stores a parsed MetaTrader 5 report and reads it back for the API.

import { ApiError, db, unwrap } from '../api';
import { ANNUAL_RETURN_GOAL_PCT } from '../goals';
import type { Recommendation, SubScore } from '../ib/score';
import { recomputeOperational } from '../operational';
import { DOCUMENTS_BUCKET } from '../storage';
import type { Mt5ReportData } from './report';
import { mt5Metrics, mt5Recommendations, mt5Score } from './score';
import type { Mt5ReportDetail, Mt5ReportListItem } from './types';

type Row = Record<string, unknown>;

const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));

export const MT5_NOT_FOUND = 'Informe de MetaTrader 5 no encontrado';

async function annualGoal(): Promise<number> {
  const rows = unwrap(await db().from('kpi_settings').select('*').limit(1)) as Row[];
  return Number(rows[0]?.annual_return_goal_pct ?? ANNUAL_RETURN_GOAL_PCT);
}

function evaluate(data: Mt5ReportData, goal: number) {
  const metrics = mt5Metrics(data, goal);
  const score = mt5Score(data, metrics, goal);
  return { metrics, score, recommendations: mt5Recommendations(data, metrics, goal) };
}

/** Saves the report, replacing an earlier one of the same month (and its file), and updates the operational KPI. */
export async function saveMt5Report(memberId: string, filePath: string, fileName: string, data: Mt5ReportData) {
  const client = db();
  const { metrics, score, recommendations } = evaluate(data, await annualGoal());
  const period = `${metrics.month}-01`;

  const previous = unwrap(await client.from('mt5_reports').select('id, file_path').eq('member_id', memberId).eq('period', period)) as Row[];
  if (previous.length) {
    unwrap(await client.from('mt5_reports').delete().in('id', previous.map((r) => s(r.id))).select('id'));
    const old = previous.map((r) => s(r.file_path)).filter((p) => p && p !== filePath);
    if (old.length) {
      const { error } = await client.storage.from(DOCUMENTS_BUCKET).remove(old);
      if (error) console.error(error.message);
    }
  }

  const [row] = unwrap(
    await client
      .from('mt5_reports')
      .insert({
        member_id: memberId,
        period,
        file_path: filePath,
        file_name: fileName,
        account: data.account,
        period_start: data.periodStart,
        period_end: data.periodEnd,
        initial_balance: data.initialBalance,
        final_balance: data.summary.balance ?? data.balanceCurve.at(-1)?.balance ?? null,
        net_profit: data.results.totalNetProfit,
        return_pct: data.totalReturnPct,
        ytd_pct: data.ytdPct,
        profit_factor: data.results.profitFactor,
        drawdown_pct: data.results.balanceDrawdownRelativePct ?? data.results.balanceDrawdownMaximalPct,
        win_rate_pct: data.results.profitTradesPct,
        total_trades: data.results.totalTrades,
        score: score.score,
        score_detail: score.parts,
        recommendations,
        data,
      })
      .select('id'),
  ) as Row[];

  await recomputeOperational(memberId, metrics.month);
  return { id: s(row.id), period: metrics.month, score: score.score };
}

function listItem(row: Row): Mt5ReportListItem {
  return {
    id: s(row.id),
    period: s(row.period).slice(0, 7),
    fileName: s(row.file_name),
    returnPct: n(row.return_pct),
    score: n(row.score),
    uploadedAt: s(row.uploaded_at),
  };
}

export async function listMt5Reports(memberId: string): Promise<Mt5ReportListItem[]> {
  const { data, error } = await db()
    .from('mt5_reports')
    .select('id, period, file_name, return_pct, score, uploaded_at')
    .eq('member_id', memberId)
    .order('period', { ascending: false });
  // Before migration 010 the table does not exist: no MT5 reports yet.
  if (error) return [];
  return (data as Row[]).map(listItem);
}

/** Full report, rescored with the current goals (saved back when the score changed). */
export async function loadMt5Report(id: string): Promise<Mt5ReportDetail> {
  const client = db();
  const [row] = unwrap(await client.from('mt5_reports').select('*').eq('id', id)) as Row[];
  if (!row) throw new ApiError(404, MT5_NOT_FOUND);
  const data = row.data as Mt5ReportData;
  const { metrics, score, recommendations } = evaluate(data, await annualGoal());

  if (score.score !== n(row.score) || JSON.stringify(score.parts) !== JSON.stringify(row.score_detail)) {
    unwrap(await client.from('mt5_reports').update({ score: score.score, score_detail: score.parts, recommendations }).eq('id', id).select('id'));
    await recomputeOperational(s(row.member_id), metrics.month);
  }
  return {
    ...listItem({ ...row, score: score.score }),
    memberId: s(row.member_id),
    data,
    metrics,
    scoreParts: score.parts as SubScore[],
    recommendations: recommendations as Recommendation[],
  };
}

export async function deleteMt5Report(id: string) {
  const client = db();
  const [row] = unwrap(await client.from('mt5_reports').select('file_path, member_id, period').eq('id', id)) as Row[];
  if (!row) throw new ApiError(404, MT5_NOT_FOUND);
  const { error } = await client.storage.from(DOCUMENTS_BUCKET).remove([s(row.file_path)]);
  if (error) console.error(error.message);
  unwrap(await client.from('mt5_reports').delete().eq('id', id).select('id'));
  await recomputeOperational(s(row.member_id), s(row.period).slice(0, 7));
}
