// Server-only helpers for the projects API routes.

import { ApiError, db, parseText, parseUuid, unwrap } from './api';
import { isProjectStatus, type Project, type ProjectStatus } from './projects';

export const PROJECT_NOT_FOUND = 'Proyecto no encontrado';

export const parseProjectName = (value: unknown) => parseText(value, 'El nombre del proyecto', { required: true, max: 120 });
export const parseProjectDescription = (value: unknown) => parseText(value, 'La descripción', { max: 2000 });

export function parseStatus(value: unknown): ProjectStatus {
  if (!isProjectStatus(value)) throw new ApiError(400, 'El estado del proyecto no es válido');
  return value;
}

type Row = Record<string, unknown>;

/** Projects of a member (newest first) with their files and history. */
export async function loadProjects(memberId: string): Promise<Project[]> {
  const client = db();
  const projectRows = unwrap(
    await client.from('projects').select('*').eq('member_id', memberId).order('created_at', { ascending: false }),
  ) as Row[];
  if (projectRows.length === 0) return [];

  const ids = projectRows.map((row) => String(row.id));
  const [fileRows, eventRows] = await Promise.all([
    client.from('project_files').select('id, project_id, name, size, uploaded_at').in('project_id', ids).order('uploaded_at'),
    client.from('project_events').select('project_id, status, progress, at').in('project_id', ids).order('at'),
  ]);
  const files = unwrap(fileRows) as Row[];
  const events = unwrap(eventRows) as Row[];

  return projectRows.map((row) => ({
    id: String(row.id),
    memberId: String(row.member_id),
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
