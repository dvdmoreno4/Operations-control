import { ApiError, db, jsonBody, parseText, parseUuid, route, unwrap } from '@/src/lib/api';
import { isRequestKind, type MemberRequest } from '@/src/lib/requests';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

const NOT_FOUND = 'Miembro no encontrado';

function requestFromRow(row: Record<string, unknown>): MemberRequest {
  return {
    id: String(row.id),
    memberId: String(row.member_id),
    kind: row.kind as MemberRequest['kind'],
    title: String(row.title),
    description: String(row.description ?? ''),
    status: row.status as MemberRequest['status'],
    createdAt: String(row.created_at),
    resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
  };
}

export const GET = route<Context>(async (_req, { params }): Promise<{ requests: MemberRequest[] }> => {
  const memberId = parseUuid((await params).id, NOT_FOUND);
  const rows = unwrap(await db().from('member_requests').select('*').eq('member_id', memberId).order('created_at', { ascending: false }));
  return { requests: rows.map(requestFromRow) };
});

/** Anyone can add a request or an improvement recommendation; it starts as pending. */
export const POST = route<Context>(async (req, { params }) => {
  const memberId = parseUuid((await params).id, NOT_FOUND);
  const body = await jsonBody(req);
  if (!isRequestKind(body.kind)) throw new ApiError(400, 'El tipo debe ser solicitud o recomendación');
  const row = {
    member_id: memberId,
    kind: body.kind,
    title: parseText(body.title, 'El título', { required: true, max: 120 }),
    description: parseText(body.description, 'La descripción', { max: 2000 }),
  };
  const client = db();
  if (unwrap(await client.from('members').select('id').eq('id', memberId)).length === 0) throw new ApiError(404, NOT_FOUND);
  const [inserted] = unwrap(await client.from('member_requests').insert(row).select('id'));
  return { id: inserted.id };
});
