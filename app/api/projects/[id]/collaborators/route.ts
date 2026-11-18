import { ApiError, db, jsonBody, parseUuid, route, unwrap } from '@/src/lib/api';
import { getProject, projectPeople, recomputeProjectScores } from '@/src/lib/projectsDb';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

/** Adds a collaborator; they start earning a share of the project's points this month. */
export const POST = route<Context>(async (req, { params }) => {
  const project = await getProject((await params).id);
  const { memberId: raw } = await jsonBody(req);
  const memberId = parseUuid(typeof raw === 'string' ? raw : '', 'Miembro no encontrado');
  if (memberId === project.memberId) throw new ApiError(400, 'El dueño del proyecto ya participa en él');

  const client = db();
  if (unwrap(await client.from('members').select('id').eq('id', memberId)).length === 0) throw new ApiError(404, 'Miembro no encontrado');
  const { error } = await client.from('project_collaborators').insert({ project_id: project.id, member_id: memberId });
  if (error && error.code !== '23505') {
    console.error(error.message);
    throw new ApiError(500, 'Error de base de datos');
  }
  await recomputeProjectScores(await projectPeople(project.id, project.memberId));
  return { ok: true };
});
