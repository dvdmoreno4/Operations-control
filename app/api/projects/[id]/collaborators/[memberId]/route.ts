import { db, parseUuid, route, unwrap } from '@/src/lib/api';
import { getProject, recomputeProjectScores } from '@/src/lib/projectsDb';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string; memberId: string }> };

/** Removes a collaborator and recomputes their project score of the month without this project. */
export const DELETE = route<Context>(async (_req, { params }) => {
  const { id, memberId: raw } = await params;
  const project = await getProject(id);
  const memberId = parseUuid(raw, 'Miembro no encontrado');
  unwrap(await db().from('project_collaborators').delete().eq('project_id', project.id).eq('member_id', memberId).select('member_id'));
  await recomputeProjectScores([memberId]);
  return { ok: true };
});
