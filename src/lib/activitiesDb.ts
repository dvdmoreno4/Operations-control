// Server-only helpers for extraordinary activities.

import { db, unwrap } from './api';
import { activityScore, type MemberActivity } from './activities';

type Row = Record<string, unknown>;

export function activityFromRow(row: Row): MemberActivity {
  return {
    id: String(row.id),
    memberId: String(row.member_id),
    period: String(row.period).slice(0, 7),
    kind: row.kind as MemberActivity['kind'],
    description: String(row.description ?? ''),
    done: Boolean(row.done),
    doneAt: row.done_at ? String(row.done_at) : null,
    createdAt: String(row.created_at),
  };
}

/** Recomputes the member's activities score for a month (YYYY-MM) and writes it to that month's KPI. */
export async function recomputeActivityScore(memberId: string, period: string) {
  const client = db();
  const rows = unwrap(await client.from('member_activities').select('period, kind, done').eq('member_id', memberId).eq('period', `${period}-01`)) as Row[];
  const { score } = activityScore(rows.map(activityFromRow), period);
  unwrap(
    await client
      .from('kpi_records')
      .upsert({ member_id: memberId, period: `${period}-01`, score_extra: score, updated_at: new Date().toISOString() })
      .select('member_id'),
  );
}
