import { randomUUID } from 'node:crypto';
import { ApiError, db, jsonBody, parseUuid, route, unwrap } from '@/src/lib/api';
import { DOCUMENTS_BUCKET, MAX_UPLOAD_BYTES } from '@/src/lib/storage';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

const NOT_FOUND = 'Miembro no encontrado';

/**
 * Signs a one-time upload of an operational report: an Interactive Brokers PDF (then POST
 * /api/members/[id]/ib-reports) or a MetaTrader 5 Excel (then POST /api/members/[id]/mt5-reports).
 */
export const POST = route<Context>(async (req, { params }) => {
  const memberId = parseUuid((await params).id, NOT_FOUND);
  const body = await jsonBody(req);
  const name = typeof body.name === 'string' ? body.name : '';
  const size = Number(body.size);
  const kind = /\.pdf$/i.test(name) ? 'ib' : /\.xlsx$/i.test(name) ? 'mt5' : null;
  if (!kind) throw new ApiError(400, 'Sube el PDF de Interactive Brokers o el Excel (.xlsx) de MetaTrader 5');
  if (!Number.isFinite(size) || size <= 0) throw new ApiError(400, 'El archivo está vacío');
  if (size > MAX_UPLOAD_BYTES) throw new ApiError(400, 'El archivo supera el máximo de 50 MB');

  const client = db();
  if (unwrap(await client.from('members').select('id').eq('id', memberId)).length === 0) throw new ApiError(404, NOT_FOUND);

  const path = kind === 'ib' ? `ib/${memberId}/${randomUUID()}.pdf` : `mt5/${memberId}/${randomUUID()}.xlsx`;
  const { data, error } = await client.storage.from(DOCUMENTS_BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    console.error(error?.message);
    throw new ApiError(500, 'No se pudo preparar la subida. ¿Existe el bucket "documents" en Supabase?');
  }
  return { path: data.path, token: data.token, kind };
});
