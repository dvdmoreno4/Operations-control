// Extraordinary activities and collaborations of a member, and their monthly score. Shared by API and UI.

export const ACTIVITY_KINDS = ['colaboracion_comercial', 'conversatorio', 'colaboracion_areas', 'proyecto_adicional'] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

/**
 * Bonus points each done activity adds on top of the central KPI (operativa, proyectos, pantalla).
 * Not every member does these activities, so they only add, never weigh. Conversatorios are a
 * mandatory team activity, so they add very little.
 */
export const ACTIVITY_INFO: Record<ActivityKind, { label: string; bonus: number }> = {
  colaboracion_comercial: { label: 'Colaboración comercial', bonus: 3 },
  conversatorio: { label: 'Conversatorios', bonus: 0.5 },
  colaboracion_areas: { label: 'Colaboración con otras áreas', bonus: 3 },
  proyecto_adicional: { label: 'Proyectos adicionales', bonus: 4 },
};

/** Most bonus points activities can add in one month. */
export const MAX_ACTIVITY_BONUS = 10;

export type MemberActivity = {
  id: string;
  memberId: string;
  /** Month of the activity, YYYY-MM. */
  period: string;
  kind: ActivityKind;
  description: string;
  done: boolean;
  doneAt: string | null;
  createdAt: string;
};

export const isActivityKind = (v: unknown): v is ActivityKind => typeof v === 'string' && (ACTIVITY_KINDS as readonly string[]).includes(v);

/**
 * Bonus of a month: the points of every activity done that month, capped at MAX_ACTIVITY_BONUS.
 * Activities not done add nothing.
 */
export function activityBonus(activities: Pick<MemberActivity, 'period' | 'kind' | 'done'>[], period: string): { bonus: number; doneCount: number } {
  const done = activities.filter((a) => a.period === period && a.done);
  const raw = done.reduce((sum, a) => sum + ACTIVITY_INFO[a.kind].bonus, 0);
  return { bonus: Math.min(MAX_ACTIVITY_BONUS, Math.round(raw * 10) / 10), doneCount: done.length };
}
