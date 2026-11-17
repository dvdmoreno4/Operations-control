import { ApiError, db, parseUuid, route, unwrap } from '@/src/lib/api';
import { DOCUMENTS_BUCKET } from '@/src/lib/storage';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

const NOT_FOUND = 'Archivo no encontrado';

async function findFile(rawId: string) {
  const id = parseUuid(rawId, NOT_FOUND);
  const [row] = unwrap(await db().from('project_files').select('id, file_path, name').eq('id', id));
  if (!row) throw new ApiError(404, NOT_FOUND);
  return { id, path: String(row.file_path), name: String(row.name) };
}

/** Short-lived download link for a project document. */
export const GET = route<Context>(async (_req, { params }) => {
  const file = await findFile((await params).id);
  const { data, error } = await db().storage.from(DOCUMENTS_BUCKET).createSignedUrl(file.path, 60, { download: file.name });
  if (error || !data) {
    console.error(error?.message);
    throw new ApiError(500, 'No se pudo generar el enlace de descarga');
  }
  return { url: data.signedUrl };
});

export const DELETE = route<Context>(async (_req, { params }) => {
  const file = await findFile((await params).id);
  const client = db();
  const { error } = await client.storage.from(DOCUMENTS_BUCKET).remove([file.path]);
  if (error) console.error(error.message);
  unwrap(await client.from('project_files').delete().eq('id', file.id).select('id'));
  return { ok: true };
});
