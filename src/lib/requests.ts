// Improvement recommendations and requests of a member. Shared by API routes and the UI.

export const REQUEST_KINDS = ['solicitud', 'recomendacion'] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];

export const REQUEST_STATUSES = ['pendiente', 'en_proceso', 'resuelta', 'rechazada'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const KIND_LABEL: Record<RequestKind, string> = { solicitud: 'Solicitud', recomendacion: 'Recomendación de mejora' };

export const STATUS_LABEL: Record<RequestStatus, string> = {
  pendiente: 'Pendiente',
  en_proceso: 'En proceso',
  resuelta: 'Resuelta',
  rechazada: 'Rechazada',
};

/** Statuses that count as open: they show on the plan badge (requests only). */
export const OPEN_STATUSES: RequestStatus[] = ['pendiente', 'en_proceso'];

export type MemberRequest = {
  id: string;
  memberId: string;
  kind: RequestKind;
  title: string;
  description: string;
  status: RequestStatus;
  createdAt: string;
  resolvedAt: string | null;
};

export const isRequestKind = (v: unknown): v is RequestKind => typeof v === 'string' && (REQUEST_KINDS as readonly string[]).includes(v);
export const isRequestStatus = (v: unknown): v is RequestStatus => typeof v === 'string' && (REQUEST_STATUSES as readonly string[]).includes(v);
