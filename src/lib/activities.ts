// Extraordinary activities and collaborations of a member, and their monthly score. Shared by API and UI.

export const ACTIVITY_KINDS = ['colaboracion_comercial', 'conversatorio', 'colaboracion_areas', 'proyecto_adicional'] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

/** Label and share (in %) of the monthly activities score each kind gives when done at least once. Shares add up to 100. */
export const ACTIVITY_INFO: Record<ActivityKind, { label: string; pct: number }> = {
  colaboracion_comercial: { label: 'Colaboración comercial', pct: 30 },
  conversatorio: { label: 'Conversatorios', pct: 20 },
  colaboracion_areas: { label: 'Colaboración con otras áreas', pct: 20 },
  proyecto_adicional: { label: 'Proyectos adicionales', pct: 30 },
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
 * Activities score (0-100) of a month: each kind with at least one activity marked as done that
 * month adds its share; activities not done add nothing.
 */
export function activityScore(activities: Pick<MemberActivity, 'period' | 'kind' | 'done'>[], period: string): { score: number; doneKinds: ActivityKind[] } {
  const doneKinds = ACTIVITY_KINDS.filter((kind) => activities.some((a) => a.period === period && a.kind === kind && a.done));
  return { score: Math.min(100, doneKinds.reduce((sum, kind) => sum + ACTIVITY_INFO[kind].pct, 0)), doneKinds };
}
