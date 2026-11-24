// Server-only helpers for the projects API routes.

import { ApiError, db, parseText, parseUuid, unwrap } from './api';
import { isProjectStatus, memberProjectScores, type Project, type ProjectStatus } from './projects';

export const PROJECT_NOT_FOUND = 'Proyecto no encontrado';

export const parseProjectName = (value: unknown) => parseText(value, 'El nombre del proyecto', { required: true, max: 120 });
export const parseProjectDescription = (value: unknown) => parseText(value, 'La descripción', { max: 2000 });

export function parseStatus(value: unknown): ProjectStatus {
  if (!isProjectStatus(value)) throw new ApiError(400, 'El estado del proyecto no es válido');
  return value;
}

type Row = Record<string, unknown>;

/**
 * Projects a member owns or collaborates on (newest first), with owner, collaborators, files
 * and history.
 */
export async function loadProjects(memberId: string): Promise<Project[]> {
  const client = db();
  const collaborating = unwrap(await client.from('project_collaborators').select('project_id').eq('member_id', memberId)) as Row[];
  const collaboratingIds = collaborating.map((r) => String(r.project_id));

  let query = client.from('projects').select('*').order('created_at', { ascending: false });
  query = collaboratingIds.length
    ? query.or(`member_id.eq.${memberId},id.in.(${collaboratingIds.join(',')})`)
    : query.eq('member_id', memberId);
  const projectRows = unwrap(await query) as Row[];
  if (projectRows.length === 0) return [];

  const ids = projectRows.map((row) => String(row.id));
  const [fileRows, eventRows, collaboratorRows] = await Promise.all([
    client.from('project_files').select('id, project_id, name, size, uploaded_at').in('project_id', ids).order('uploaded_at'),
    client.from('project_events').select('project_id, status, progress, at').in('project_id', ids).order('at'),
    client.from('project_collaborators').select('project_id, member_id').in('project_id', ids).order('added_at'),
  ]);
  const files = unwrap(fileRows) as Row[];
  const events = unwrap(eventRows) as Row[];
  const collaborators = unwrap(collaboratorRows) as Row[];

  const peopleIds = [...new Set([...projectRows.map((r) => String(r.member_id)), ...collaborators.map((c) => String(c.member_id))])];
  const people = unwrap(await client.from('members').select('id, name').in('id', peopleIds)) as Row[];
  const nameOf = new Map(people.map((p) => [String(p.id), String(p.name)]));

  return projectRows.map((row) => ({
    id: String(row.id),
    memberId: String(row.member_id),
    ownerName: nameOf.get(String(row.member_id)) ?? '',
    collaborators: collaborators
      .filter((c) => c.project_id === row.id)
      .map((c) => ({ memberId: String(c.member_id), name: nameOf.get(String(c.member_id)) ?? '' })),
    name: String(row.name),
    description: String(row.description ?? ''),
    status: parseStatus(row.status),
    manualProgress: Number(row.manual_progress ?? 0),
    createdAt: String(row.created_at),
    files: files
      .filter((f) => f.project_id === row.id)
      .map((f) => ({ id: String(f.id), name: String(f.name), size: Number(f.size), uploadedAt: String(f.uploaded_at) })),
    events: events
      .filter((e) => e.project_id === row.id)
      .map((e) => ({ status: parseStatus(e.status), progress: Number(e.progress), at: String(e.at) })),
  }));
}

/** The project row, or a 404. */
export async function getProject(rawId: string): Promise<{ id: string; memberId: string; status: ProjectStatus; manualProgress: number }> {
  const id = parseUuid(rawId, PROJECT_NOT_FOUND);
  const rows = unwrap(await db().from('projects').select('id, member_id, status, manual_progress').eq('id', id)) as Row[];
  const row = rows[0];
  if (!row) throw new ApiError(404, PROJECT_NOT_FOUND);
  return { id, memberId: String(row.member_id), status: parseStatus(row.status), manualProgress: Number(row.manual_progress) };
}

export async function addEvent(projectId: string, status: ProjectStatus, progress: number) {
  unwrap(await db().from('project_events').insert({ project_id: projectId, status, progress }).select('id'));
}

/** Owner and collaborators of a project. */
export async function projectPeople(projectId: string, ownerId: string): Promise<string[]> {
  const rows = unwrap(await db().from('project_collaborators').select('member_id').eq('project_id', projectId)) as Row[];
  return [ownerId, ...rows.map((r) => String(r.member_id))];
}

export const currentMonth = () => new Date().toISOString().slice(0, 7);

/**
 * Recomputes, for a month, each member's project score (owned projects) and collaboration bonus
 * (other members' projects) and writes both to their KPI record of that month.
 */
export async function recomputeProjectScores(memberIds: string[], month = currentMonth()) {
  const client = db();
  for (const memberId of [...new Set(memberIds)]) {
    const projects = await loadProjects(memberId);
    const { owned, collabBonus } = memberProjectScores(projects, memberId, month);
    const row = { member_id: memberId, period: `${month}-01`, score_projects: owned.score, updated_at: new Date().toISOString() };
    const { error } = await client.from('kpi_records').upsert({ ...row, score_collab: collabBonus }).select('member_id');
    if (error && /score_collab/.test(error.message)) {
      // Migration 009 not applied yet: keep the project score, skip the bonus.
      unwrap(await client.from('kpi_records').upsert(row).select('member_id'));
    } else if (error) {
      console.error(error.message);
      throw new ApiError(500, 'Error de base de datos');
    }
  }
}
