import { ApiError, db, jsonBody, parseText, parseUuid, requireAdmin, route, unwrap } from '@/src/lib/api';
import { recomputeActivityScore } from '@/src/lib/activitiesDb';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

const NOT_FOUND = 'Actividad no encontrada';

async function findActivity(rawId: string) {
  const id = parseUuid(rawId, NOT_FOUND);
  const [row] = unwrap(await db().from('member_activities').select('id, member_id, period').eq('id', id));
  if (!row) throw new ApiError(404, NOT_FOUND);
  return { id, memberId: String(row.member_id), period: String(row.period).slice(0, 7) };
}

/** Anyone can edit the description; only an admin sets it as done, not done or back to pending (null). */
export const PATCH = route<Context>(async (req, { params }) => {
  const activity = await findActivity((await params).id);
  const body = await jsonBody(req);
  const changes: Record<string, unknown> = {};
  if (body.description !== undefined) changes.description = parseText(body.description, 'La descripción', { required: true, max: 2000 });
  if (body.done !== undefined) {
    requireAdmin(req);
    if (body.done !== null && typeof body.done !== 'boolean') throw new ApiError(400, 'El estado debe ser pendiente, realizada o no realizada');
    changes.done = body.done;
    changes.done_at = body.done === null ? null : new Date().toISOString();
  }
  if (Object.keys(changes).length === 0) throw new ApiError(400, 'No hay cambios');
  unwrap(await db().from('member_activities').update(changes).eq('id', activity.id).select('id'));
  if (body.done !== undefined) await recomputeActivityScore(activity.memberId, activity.period);
  return { ok: true };
});

export const DELETE = route<Context>(async (req, { params }) => {
  requireAdmin(req);
  const activity = await findActivity((await params).id);
  unwrap(await db().from('member_activities').delete().eq('id', activity.id).select('id'));
  await recomputeActivityScore(activity.memberId, activity.period);
  return { ok: true };
});
