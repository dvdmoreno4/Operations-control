import { ApiError, db, jsonBody, parseUuid, route } from '@/src/lib/api';
import { assertWrite, parseMemberName, parseMemberRole, parseStationId } from '@/src/lib/members';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

const NOT_FOUND = 'Miembro no encontrado';

export const PATCH = route<Context>(async (req, { params }) => {
  const id = parseUuid((await params).id, NOT_FOUND);
  const body = await jsonBody(req);
  const changes: Record<string, string> = {};
  if (body.name !== undefined) changes.name = parseMemberName(body.name);
  if (body.role !== undefined) changes.role = parseMemberRole(body.role);
  if (body.stationId !== undefined) changes.station_id = parseStationId(body.stationId);
  if (Object.keys(changes).length === 0) throw new ApiError(400, 'No hay cambios');

  const { data, error } = await db().from('members').update(changes).eq('id', id).select('id');
  assertWrite(error);
  if (!data?.length) throw new ApiError(404, NOT_FOUND);
  return { ok: true };
});

export const DELETE = route<Context>(async (_req, { params }) => {
  const id = parseUuid((await params).id, NOT_FOUND);
  const { data, error } = await db().from('members').delete().eq('id', id).select('id');
  assertWrite(error);
  if (!data?.length) throw new ApiError(404, NOT_FOUND);
  return { ok: true };
});
