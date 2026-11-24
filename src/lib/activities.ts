// Extraordinary activities and collaborations of a member, and their monthly score. Shared by API and UI.

export const ACTIVITY_KINDS = ['colaboracion_comercial', 'conversatorio', 'colaboracion_areas', 'proyecto_adicional'] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

/** Every kind counts the same: members do different kinds of activities, so the section is one grade. */
export const ACTIVITY_INFO: Record<ActivityKind, { label: string }> = {
  colaboracion_comercial: { label: 'Colaboración comercial' },
  conversatorio: { label: 'Conversatorios' },
  colaboracion_areas: { label: 'Colaboración con otras áreas' },
  proyecto_adicional: { label: 'Proyectos adicionales' },
};

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
 * Activities score of a month, a single grade whatever the kind: 100 when at least one activity of
 * any kind was done that month, 0 otherwise.
 */
export function activityScore(activities: Pick<MemberActivity, 'period' | 'kind' | 'done'>[], period: string): { score: number; doneCount: number } {
  const doneCount = activities.filter((a) => a.period === period && a.done).length;
  return { score: doneCount > 0 ? 100 : 0, doneCount };
}
