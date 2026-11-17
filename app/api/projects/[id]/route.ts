import { ApiError, db, isAdminRequest, jsonBody, parseNumber, requireAdmin, route, unwrap } from '@/src/lib/api';
import { MAX_MANUAL_PROGRESS, progressOf } from '@/src/lib/projects';
import { addEvent, getProject, parseProjectDescription, parseProjectName, parseStatus } from '@/src/lib/projectsDb';
import { DOCUMENTS_BUCKET } from '@/src/lib/storage';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

/**
 * Anyone can rename, describe and move manual progress (0-49) while the project is a proposal.
 * Only an admin can change the status (the 50/75/100% milestones).
 */
export const PATCH = route<Context>(async (req, { params }) => {
  const project = await getProject((await params).id);
  const body = await jsonBody(req);
  const changes: Record<string, unknown> = {};

  if (body.name !== undefined) changes.name = parseProjectName(body.name);
  if (body.description !== undefined) changes.description = parseProjectDescription(body.description);

  let status = project.status;
  if (body.status !== undefined) {
    requireAdmin(req);
    status = parseStatus(body.status);
    changes.status = status;
  }

  let manualProgress = project.manualProgress;
  if (body.manualProgress !== undefined) {
    if (status !== 'propuesta') throw new ApiError(400, 'El avance manual solo se edita mientras el proyecto es una propuesta');
    manualProgress = parseNumber(body.manualProgress, 'El avance', { min: 0, max: MAX_MANUAL_PROGRESS, integer: true });
    changes.manual_progress = manualProgress;
  }

  if (Object.keys(changes).length === 0) throw new ApiError(400, 'No hay cambios');
  unwrap(await db().from('projects').update(changes).eq('id', project.id).select('id'));

  const progressChanged = progressOf(status, manualProgress) !== progressOf(project.status, project.manualProgress);
  if (status !== project.status || progressChanged) await addEvent(project.id, status, progressOf(status, manualProgress));
  return { ok: true };
});

/** Proposals can be deleted by anyone; projects past acceptance only by an admin. Removes their files too. */
export const DELETE = route<Context>(async (req, { params }) => {
  const project = await getProject((await params).id);
  if (project.status !== 'propuesta' && !isAdminRequest(req)) {
    throw new ApiError(403, 'Solo un administrador puede borrar un proyecto aceptado');
  }

  const client = db();
  const files = unwrap(await client.from('project_files').select('file_path').eq('project_id', project.id));
  if (files.length > 0) {
    const { error } = await client.storage.from(DOCUMENTS_BUCKET).remove(files.map((f) => String(f.file_path)));
    if (error) console.error(error.message);
  }
  unwrap(await client.from('projects').delete().eq('id', project.id).select('id'));
  return { ok: true };
});
