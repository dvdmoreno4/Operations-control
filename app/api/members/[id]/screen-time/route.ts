import { ApiError, db, jsonBody, parseNumber, parsePeriod, parseUuid, route, unwrap } from '@/src/lib/api';
import { screenScore } from '@/src/lib/goals';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

const NOT_FOUND = 'Miembro no encontrado';

/** Registers the screen hours of a month and recomputes its screen time score against the goal. */
export const PUT = route<Context>(async (req, { params }) => {
  const memberId = parseUuid((await params).id, NOT_FOUND);
  const body = await jsonBody(req);
  const period = parsePeriod(body.period);
  const hours = parseNumber(body.hours, 'Las horas', { min: 0, max: 744 });

  const client = db();
  if (unwrap(await client.from('members').select('id').eq('id', memberId)).length === 0) throw new ApiError(404, NOT_FOUND);
  unwrap(
    await client
      .from('kpi_records')
      .upsert({ member_id: memberId, period, screen_hours: hours, score_screen_time: screenScore(hours), updated_at: new Date().toISOString() })
      .select('member_id'),
  );
  return { ok: true, score: screenScore(hours) };
});
