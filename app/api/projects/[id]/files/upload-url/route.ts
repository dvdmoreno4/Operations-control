import { randomUUID } from 'node:crypto';
import { ApiError, db, jsonBody, parseText, route } from '@/src/lib/api';
import { getProject } from '@/src/lib/projectsDb';
import { DOCUMENTS_BUCKET, MAX_UPLOAD_BYTES } from '@/src/lib/storage';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

/**
 * Signs a one-time upload to Storage. The browser uploads the file there directly (Vercel functions
 * cannot take large bodies) and then registers it with POST /api/projects/[id]/files.
 */
export const POST = route<Context>(async (req, { params }) => {
  const project = await getProject((await params).id);
  const body = await jsonBody(req);
  const name = parseText(body.name, 'El nombre del archivo', { required: true, max: 200 });
  const size = Number(body.size);
  if (!Number.isFinite(size) || size <= 0) throw new ApiError(400, 'El archivo está vacío');
  if (size > MAX_UPLOAD_BYTES) throw new ApiError(400, 'El archivo supera el máximo de 50 MB');

  const safeName = name.replace(/[^\w.\-]+/g, '_').slice(-100);
  const path = `projects/${project.id}/${randomUUID()}-${safeName}`;
  const { data, error } = await db().storage.from(DOCUMENTS_BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    console.error(error?.message);
    throw new ApiError(500, 'No se pudo preparar la subida. ¿Existe el bucket "documents" en Supabase?');
  }
  return { path: data.path, token: data.token };
});
