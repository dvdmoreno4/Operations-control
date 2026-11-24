// Project types, progress rules and the project score. Shared by API routes and the UI.

import { PROJECTS_PER_SEMESTER_GOAL } from './goals';
import { monthsOf, semesterOf } from './semester';

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

/** Share of a project's progress a collaborator earns in the collaboration bonus (relative to its owner). */
export const COLLABORATOR_SHARE = 0.5;

/** Bonus on top of the central KPI for each collaborated project at 100% progress (pro rata below). */
export const COLLAB_BONUS_PER_PROJECT = 5;
/** Most collaboration bonus a month. */
export const MAX_COLLAB_BONUS = 10;

export type ProjectEvent = { status: ProjectStatus; progress: number; at: string };
export type ProjectFile = { id: string; name: string; size: number; uploadedAt: string };

export type ProjectPerson = { memberId: string; name: string };

export type Project = {
  id: string;
  /** Owner of the project. */
  memberId: string;
  ownerName: string;
  /** Members who collaborate on it besides the owner. */
  collaborators: ProjectPerson[];
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
  /** 0-100: progress toward the semester goal (PROJECTS_PER_SEMESTER_GOAL completed projects). */
  score: number;
  /** Semester of the score, e.g. "2026-H2". */
  semester: string;
  /** Sum of share x progress of the projects counted, in "project %" (100 = one full project). */
  points: number;
  /** Projects completed in the semester, weighted by share. */
  completedInSemester: number;
  /** Projects completed in the calendar year, weighted by share. */
  completedInYear: number;
  counted: { project: string; progress: number; share: number }[];
};

/** Share of a project's points that `memberId` earns: 1 as owner, COLLABORATOR_SHARE as collaborator, else 0. */
export function shareOf(project: Pick<Project, 'memberId' | 'collaborators'>, memberId: string): number {
  if (project.memberId === memberId) return 1;
  return project.collaborators.some((c) => c.memberId === memberId) ? COLLABORATOR_SHARE : 0;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

const monthStart = (period: string) => {
  const [year, month] = period.split('-').map(Number);
  return Date.UTC(year, month - 1, 1);
};
const monthEnd = (period: string) => {
  const [year, month] = period.split('-').map(Number);
  return Date.UTC(year, month, 1);
};

/** When the project first reached "culminado", or null. */
const completedAt = (events: ProjectEvent[]) => {
  const event = events.find((e) => e.status === 'culminado');
  return event ? Date.parse(event.at) : null;
};

/**
 * Project score (0-100) as of the end of a month, against the goal of PROJECTS_PER_SEMESTER_GOAL
 * completed projects a semester (2 a year): every project active in that semester counts its
 * progress at the end of the month (50 aceptado, 75 produccion, 100 culminado), times its share
 * (1 owner, COLLABORATOR_SHARE collaborator). Projects completed before the semester began do not
 * count again. 100 = the semester goal reached.
 */
export function projectScore(projects: (Pick<Project, 'name' | 'events'> & { share?: number })[], period: string): ProjectScore {
  const semester = semesterOf(period);
  const semesterStart = monthStart(monthsOf(semester)[0]);
  const end = monthEnd(period);
  const year = period.slice(0, 4);
  const yearStart = Date.UTC(Number(year), 0, 1);

  let points = 0;
  let completedInSemester = 0;
  let completedInYear = 0;
  const counted: ProjectScore['counted'] = [];

  for (const project of projects) {
    const share = project.share ?? 1;
    if (share <= 0) continue;
    const history = project.events.filter((e) => Date.parse(e.at) < end);
    const last = history.at(-1);
    if (!last) continue;

    const done = completedAt(history);
    if (done !== null && done < semesterStart) {
      if (done >= yearStart) completedInYear += share;
      continue;
    }
    if (done !== null) {
      completedInSemester += share;
      if (done >= yearStart) completedInYear += share;
    }
    points += last.progress * share;
    counted.push({ project: project.name, progress: last.progress, share });
  }

  return {
    score: Math.min(100, round1(points / PROJECTS_PER_SEMESTER_GOAL)),
    semester,
    points: round1(points),
    completedInSemester: round1(completedInSemester),
    completedInYear: round1(completedInYear),
    counted,
  };
}

/**
 * Member's scores from projects for a month: the project score counts only the projects they own
 * (goal: one completed a semester); collaborating on other members' projects adds a bonus on top of
 * the central KPI, COLLAB_BONUS_PER_PROJECT per project at its progress (50% -> +2.5), capped at
 * MAX_COLLAB_BONUS. Projects completed before the semester began do not count.
 */
export function memberProjectScores(
  projects: Pick<Project, 'name' | 'events' | 'memberId' | 'collaborators'>[],
  memberId: string,
  period: string,
): { owned: ProjectScore; collabBonus: number; collaborations: ProjectScore['counted'] } {
  const owned = projectScore(
    projects.filter((p) => p.memberId === memberId),
    period,
  );
  const collab = projectScore(
    projects.filter((p) => p.memberId !== memberId && p.collaborators.some((c) => c.memberId === memberId)),
    period,
  );
  const collabBonus = Math.min(MAX_COLLAB_BONUS, round1((collab.points / 100) * COLLAB_BONUS_PER_PROJECT));
  return { owned, collabBonus, collaborations: collab.counted };
}
