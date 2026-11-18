import { ApiError, db, jsonBody, parseUuid, requireAdmin, route, unwrap } from '@/src/lib/api';
import { isRequestStatus, OPEN_STATUSES } from '@/src/lib/requests';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

const NOT_FOUND = 'Solicitud no encontrada';

/** Only an admin changes the status of a request or recommendation. */
export const PATCH = route<Context>(async (req, { params }) => {
  requireAdmin(req);
  const id = parseUuid((await params).id, NOT_FOUND);
  const { status } = await jsonBody(req);
  if (!isRequestStatus(status)) throw new ApiError(400, 'El estado no es válido');
  const resolvedAt = OPEN_STATUSES.includes(status) ? null : new Date().toISOString();
  const rows = unwrap(await db().from('member_requests').update({ status, resolved_at: resolvedAt }).eq('id', id).select('id'));
  if (rows.length === 0) throw new ApiError(404, NOT_FOUND);
  return { ok: true };
});

export const DELETE = route<Context>(async (req, { params }) => {
  requireAdmin(req);
  const id = parseUuid((await params).id, NOT_FOUND);
  const rows = unwrap(await db().from('member_requests').delete().eq('id', id).select('id'));
  if (rows.length === 0) throw new ApiError(404, NOT_FOUND);
  return { ok: true };
});
