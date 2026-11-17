import { ApiError, db, jsonBody, parseUuid, route, unwrap } from '@/src/lib/api';
import type { Project } from '@/src/lib/projects';
import { addEvent, loadProjects, parseProjectDescription, parseProjectName } from '@/src/lib/projectsDb';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

const NOT_FOUND = 'Miembro no encontrado';

export const GET = route<Context>(async (_req, { params }): Promise<{ projects: Project[] }> => {
  const memberId = parseUuid((await params).id, NOT_FOUND);
  return { projects: await loadProjects(memberId) };
});

/** Creates a project in the proposal stage at 0%. */
export const POST = route<Context>(async (req, { params }) => {
  const memberId = parseUuid((await params).id, NOT_FOUND);
  const body = await jsonBody(req);
  const project = {
    member_id: memberId,
    name: parseProjectName(body.name),
    description: parseProjectDescription(body.description),
  };

  const client = db();
  if (unwrap(await client.from('members').select('id').eq('id', memberId)).length === 0) throw new ApiError(404, NOT_FOUND);
  const [row] = unwrap(await client.from('projects').insert(project).select('id'));
  await addEvent(String(row.id), 'propuesta', 0);
  return { id: row.id };
});
