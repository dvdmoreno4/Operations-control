import { ApiError, db, jsonBody, parseText, route, unwrap } from '@/src/lib/api';
import { getProject } from '@/src/lib/projectsDb';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

/** Registers a file already uploaded to Storage with a URL from upload-url. */
export const POST = route<Context>(async (req, { params }) => {
  const project = await getProject((await params).id);
  const body = await jsonBody(req);
  const path = typeof body.path === 'string' ? body.path : '';
  if (!path.startsWith(`projects/${project.id}/`) || path.includes('..')) throw new ApiError(400, 'Ruta de archivo no válida');

  const file = {
    project_id: project.id,
    file_path: path,
    name: parseText(body.name, 'El nombre del archivo', { required: true, max: 200 }),
    size: Math.max(0, Math.round(Number(body.size) || 0)),
  };
  const [row] = unwrap(await db().from('project_files').insert(file).select('id'));
  return { id: row.id };
});
