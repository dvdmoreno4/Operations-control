// Project types, progress rules and the monthly project score. Shared by API routes and the UI.

export const PROJECT_STATUSES = ['propuesta', 'aceptado', 'produccion', 'culminado'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const STATUS_INFO: Record<ProjectStatus, { label: string; progress: number | null; color: string }> = {
  propuesta: { label: 'Propuesta', progress: null, color: '#94a3b8' },
  aceptado: { label: 'Aceptado', progress: 50, color: '#283d8c' },
  produccion: { label: 'En producción', progress: 75, color: '#14b8a6' },
  culminado: { label: 'Culminado', progress: 100, color: '#22c55e' },
};

/** Highest progress a member can set by hand; 50 is reserved for the "aceptado" milestone. */
export const MAX_MANUAL_PROGRESS = 49;

/** Points earned the month a project first reaches each milestone. */
export const MILESTONE_POINTS: Record<Exclude<ProjectStatus, 'propuesta'>, number> = {
  aceptado: 30,
  produccion: 30,
  culminado: 40,
};

/** Points per percentage point of manual progress gained in a month, and the monthly cap of those points. */
export const MANUAL_POINTS_PER_PCT = 0.3;
export const MANUAL_POINTS_CAP = 15;

/** Monthly points that give a project score of 100. Will move to the KPI settings. */
export const PROJECT_POINTS_GOAL = 60;

export type ProjectEvent = { status: ProjectStatus; progress: number; at: string };
export type ProjectFile = { id: string; name: string; size: number; uploadedAt: string };

export type Project = {
  id: string;
  memberId: string;
  name: string;
  description: string;
  status: ProjectStatus;
  manualProgress: number;
  createdAt: string;
  files: ProjectFile[];
  /** Oldest first. */
  events: ProjectEvent[];
};

export const isProjectStatus = (value: unknown): value is ProjectStatus =>
  typeof value === 'string' && (PROJECT_STATUSES as readonly string[]).includes(value);

export const progressOf = (status: ProjectStatus, manualProgress: number) => STATUS_INFO[status].progress ?? manualProgress;

export type ProjectScore = {
  score: number;
  points: number;
  milestonePoints: number;
  manualPoints: number;
  milestones: { project: string; status: ProjectStatus; at: string }[];
};

/** Month bounds in UTC for a YYYY-MM period. */
function monthBounds(period: string): [number, number] {
  const [year, month] = period.split('-').map(Number);
  return [Date.UTC(year, month - 1, 1), Date.UTC(year, month, 1)];
}

/**
 * Score from 0 to 100 for the projects of one member in a month:
 * milestone points the first time a project reaches each milestone in that month, plus points
 * for manual progress gained in the proposal stage (capped), over PROJECT_POINTS_GOAL.
 */
export function projectScore(projects: Pick<Project, 'name' | 'events'>[], period: string): ProjectScore {
  const [start, end] = monthBounds(period);
  let milestonePoints = 0;
  let manualGain = 0;
  const milestones: ProjectScore['milestones'] = [];

  for (const project of projects) {
    const time = (e: ProjectEvent) => Date.parse(e.at);
    const before = project.events.filter((e) => time(e) < start);
    const during = project.events.filter((e) => time(e) >= start && time(e) < end);
    const reached = new Set(before.map((e) => e.status));

    for (const event of during) {
      if (event.status === 'propuesta' || reached.has(event.status)) continue;
      reached.add(event.status);
      milestonePoints += MILESTONE_POINTS[event.status];
      milestones.push({ project: project.name, status: event.status, at: event.at });
    }

    const proposalDuring = during.filter((e) => e.status === 'propuesta').map((e) => e.progress);
    if (proposalDuring.length > 0) {
      const last = before.at(-1);
      const startProgress = last && last.status === 'propuesta' ? last.progress : 0;
      manualGain += Math.max(0, Math.max(...proposalDuring) - startProgress);
    }
  }

  const manualPoints = Math.min(MANUAL_POINTS_CAP, Math.round(manualGain * MANUAL_POINTS_PER_PCT * 10) / 10);
  const points = milestonePoints + manualPoints;
  return {
    score: Math.min(100, Math.round((points / PROJECT_POINTS_GOAL) * 1000) / 10),
    points,
    milestonePoints,
    manualPoints,
    milestones,
  };
}
