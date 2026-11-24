import { ApiError, db, parsePeriod, route, unwrap } from '@/src/lib/api';
import { recordFromRow } from '@/src/lib/kpis';
import { isSemester, monthsOf } from '@/src/lib/semester';
import type { PeriodKpis } from '@/src/lib/stats';

export const dynamic = 'force-dynamic';

/**
 * KPI records of every member for one month (?period=YYYY-MM, default: the most recent month with
 * data) or for a whole semester (?semester=YYYY-H1|H2, every month of it).
 */
export const GET = route(async (req): Promise<PeriodKpis> => {
  const client = db();
  const periodRows = unwrap(await client.from('kpi_records').select('period').order('period', { ascending: false }));
  const periods = [...new Set(periodRows.map((row) => String(row.period).slice(0, 7)))];

  const semester = req.nextUrl.searchParams.get('semester');
  if (semester) {
    if (!isSemester(semester)) throw new ApiError(400, 'El semestre no es válido');
    const months = monthsOf(semester);
    const rows = unwrap(
      await client.from('kpi_records').select('*').gte('period', `${months[0]}-01`).lte('period', `${months.at(-1)}-01`),
    );
    return { period: semester, periods, records: rows.map((row) => ({ ...recordFromRow(row), memberId: String(row.member_id) })) };
  }

  const requested = req.nextUrl.searchParams.get('period');
  const period = requested ? parsePeriod(requested).slice(0, 7) : (periods[0] ?? null);
  if (period === null) return { period: null, periods, records: [] };

  const rows = unwrap(await client.from('kpi_records').select('*').eq('period', `${period}-01`));
  return {
    period,
    periods,
    records: rows.map((row) => ({ ...recordFromRow(row), memberId: String(row.member_id) })),
  };
});
