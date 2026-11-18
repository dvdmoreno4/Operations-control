import { randomUUID } from 'node:crypto';
import { ApiError, db, jsonBody, parseUuid, route, unwrap } from '@/src/lib/api';
import { DOCUMENTS_BUCKET, MAX_UPLOAD_BYTES } from '@/src/lib/storage';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

const NOT_FOUND = 'Miembro no encontrado';

/** Signs a one-time upload of an IB report PDF. The browser then calls POST /api/members/[id]/ib-reports. */
export const POST = route<Context>(async (req, { params }) => {
  const memberId = parseUuid((await params).id, NOT_FOUND);
  const body = await jsonBody(req);
  const name = typeof body.name === 'string' ? body.name : '';
  const size = Number(body.size);
  if (!/\.pdf$/i.test(name)) throw new ApiError(400, 'El informe debe ser un archivo PDF');
  if (!Number.isFinite(size) || size <= 0) throw new ApiError(400, 'El archivo está vacío');
  if (size > MAX_UPLOAD_BYTES) throw new ApiError(400, 'El archivo supera el máximo de 50 MB');

  const client = db();
  if (unwrap(await client.from('members').select('id').eq('id', memberId)).length === 0) throw new ApiError(404, NOT_FOUND);

  const path = `ib/${memberId}/${randomUUID()}.pdf`;
  const { data, error } = await client.storage.from(DOCUMENTS_BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    console.error(error?.message);
    throw new ApiError(500, 'No se pudo preparar la subida. ¿Existe el bucket "documents" en Supabase?');
  }
  return { path: data.path, token: data.token };
});
