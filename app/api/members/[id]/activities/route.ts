import { ApiError, db, jsonBody, parsePeriod, parseText, parseUuid, route, unwrap } from '@/src/lib/api';
import { isActivityKind, type MemberActivity } from '@/src/lib/activities';
import { activityFromRow, recomputeActivityScore } from '@/src/lib/activitiesDb';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

const NOT_FOUND = 'Miembro no encontrado';

export const GET = route<Context>(async (_req, { params }): Promise<{ activities: MemberActivity[] }> => {
  const memberId = parseUuid((await params).id, NOT_FOUND);
  const rows = unwrap(
    await db().from('member_activities').select('*').eq('member_id', memberId).order('period', { ascending: false }).order('created_at', { ascending: false }),
  );
  return { activities: rows.map(activityFromRow) };
});

/** Registers an activity of a month as pending; an admin marks it done or not done. */
export const POST = route<Context>(async (req, { params }) => {
  const memberId = parseUuid((await params).id, NOT_FOUND);
  const body = await jsonBody(req);
  if (!isActivityKind(body.kind)) throw new ApiError(400, 'El tipo de actividad no es válido');
  const period = parsePeriod(body.period);
  const description = parseText(body.description, 'La descripción', { required: true, max: 2000 });

  const client = db();
  if (unwrap(await client.from('members').select('id').eq('id', memberId)).length === 0) throw new ApiError(404, NOT_FOUND);
  const [row] = unwrap(await client.from('member_activities').insert({ member_id: memberId, period, kind: body.kind, description, done: null }).select('id'));
  await recomputeActivityScore(memberId, period.slice(0, 7));
  return { id: row.id };
});
