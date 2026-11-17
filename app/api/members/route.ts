import { db, jsonBody, route, unwrap } from '@/src/lib/api';
import { recordFromRow, totalScore, type Member } from '@/src/lib/kpis';
import { assertWrite, parseMemberName, parseMemberRole, parseStationId } from '@/src/lib/members';

export const dynamic = 'force-dynamic';

export const GET = route(async (): Promise<{ members: Member[] }> => {
  const client = db();
  const [memberRows, kpiRows] = await Promise.all([
    client.from('members').select('id, station_id, name, role').order('station_id'),
    client
      .from('kpi_records')
      .select('member_id, period, score_operational, score_projects, score_screen_time')
      .order('period', { ascending: false }),
  ]);

  // Rows are sorted newest first, so the first row seen per member is its latest period.
  const latest = new Map<string, { period: string; score: number }>();
  for (const row of unwrap(kpiRows)) {
    if (latest.has(row.member_id)) continue;
    const record = recordFromRow(row);
    latest.set(row.member_id, { period: record.period, score: totalScore(record) });
  }

  return {
    members: unwrap(memberRows).map((row) => ({
      id: row.id,
      stationId: row.station_id,
      name: row.name,
      role: row.role,
      latestScore: latest.get(row.id)?.score ?? null,
      latestPeriod: latest.get(row.id)?.period ?? null,
    })),
  };
});

export const POST = route(async (req) => {
  const body = await jsonBody(req);
  const member = {
    station_id: parseStationId(body.stationId),
    name: parseMemberName(body.name),
    role: parseMemberRole(body.role),
  };
  const { data, error } = await db().from('members').insert(member).select('id').single();
  assertWrite(error);
  return { id: data?.id };
});
