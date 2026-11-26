// Server-only: the month's operational KPI combines every broker report the member has for it.

import { db, unwrap } from './api';

type Row = Record<string, unknown>;

/**
 * Sets score_operational of a member's month to the average score of their Interactive Brokers and
 * MetaTrader 5 reports of that month (whichever exist). Leaves it untouched when there is none.
 */
export async function recomputeOperational(memberId: string, month: string) {
  const client = db();
  const period = `${month}-01`;
  const [ib, mt5] = await Promise.all([
    client.from('ib_reports').select('score').eq('member_id', memberId).eq('period', period),
    client.from('mt5_reports').select('score').eq('member_id', memberId).eq('period', period),
  ]);
  // mt5_reports may not exist yet (migration 010 pending): then only IB counts.
  const scores = [...(unwrap(ib) as Row[]), ...((mt5.error ? [] : mt5.data) as Row[])]
    .map((r) => (r.score === null || r.score === undefined ? null : Number(r.score)))
    .filter((s): s is number => s !== null);
  if (scores.length === 0) return;
  const score = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
  unwrap(
    await client
      .from('kpi_records')
      .upsert({ member_id: memberId, period, score_operational: score, updated_at: new Date().toISOString() })
      .select('member_id'),
  );
}
