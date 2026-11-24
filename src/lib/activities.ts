// Extraordinary activities and collaborations of a member, and their monthly adjustment. Shared by API and UI.

export const ACTIVITY_KINDS = ['colaboracion_comercial', 'conversatorio', 'colaboracion_areas', 'proyecto_adicional'] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

/**
 * Points on top of the central KPI (operativa, proyectos, pantalla). A done activity adds `bonus`;
 * not every member does these activities, so skipping them costs nothing, except conversatorios:
 * they are a mandatory team activity, so done they add very little and marked as not done they
 * subtract `penalty`.
 */
export const ACTIVITY_INFO: Record<ActivityKind, { label: string; bonus: number; penalty: number }> = {
  colaboracion_comercial: { label: 'Colaboración comercial', bonus: 3, penalty: 0 },
  conversatorio: { label: 'Conversatorios (obligatorio)', bonus: 0.5, penalty: 3 },
  colaboracion_areas: { label: 'Colaboración con otras áreas', bonus: 3, penalty: 0 },
  proyecto_adicional: { label: 'Proyectos adicionales', bonus: 4, penalty: 0 },
};

/** Most points activities can add, and subtract, in one month. */
export const MAX_ACTIVITY_BONUS = 10;
export const MAX_ACTIVITY_PENALTY = 10;

/** true = realizada, false = no realizada, null = pendiente (just registered, not judged yet). */
export type ActivityState = boolean | null;

export type MemberActivity = {
  id: string;
  memberId: string;
  /** Month of the activity, YYYY-MM. */
  period: string;
  kind: ActivityKind;
  description: string;
  done: ActivityState;
  doneAt: string | null;
  createdAt: string;
};

export const isActivityKind = (v: unknown): v is ActivityKind => typeof v === 'string' && (ACTIVITY_KINDS as readonly string[]).includes(v);

const round1 = (v: number) => Math.round(v * 10) / 10;

/**
 * Adjustment of a month: bonus of every activity done (capped at MAX_ACTIVITY_BONUS) minus the
 * penalty of every conversatorio marked as not done (capped at MAX_ACTIVITY_PENALTY). Pending
 * activities count for nothing.
 */
export function activityBonus(
  activities: Pick<MemberActivity, 'period' | 'kind' | 'done'>[],
  period: string,
): { bonus: number; penalty: number; net: number; doneCount: number; missedCount: number } {
  const month = activities.filter((a) => a.period === period);
  const done = month.filter((a) => a.done === true);
  const missed = month.filter((a) => a.done === false && ACTIVITY_INFO[a.kind].penalty > 0);
  const bonus = Math.min(MAX_ACTIVITY_BONUS, round1(done.reduce((sum, a) => sum + ACTIVITY_INFO[a.kind].bonus, 0)));
  const penalty = Math.min(MAX_ACTIVITY_PENALTY, round1(missed.reduce((sum, a) => sum + ACTIVITY_INFO[a.kind].penalty, 0)));
  return { bonus, penalty, net: round1(bonus - penalty), doneCount: done.length, missedCount: missed.length };
}
