import { ApiError, parseText } from './api';
import { findStation } from './floorplan';

export function parseStationId(value: unknown): string {
  if (typeof value !== 'string' || !findStation(value)) throw new ApiError(400, 'La estación no existe en el plano');
  return value;
}

export const parseMemberName = (value: unknown) => parseText(value, 'El nombre', { required: true });
export const parseMemberRole = (value: unknown) => parseText(value, 'El cargo');

/** Turns the unique-station violation into a readable 409; rethrows other errors as a 500. */
export function assertWrite(error: { code?: string; message: string } | null) {
  if (!error) return;
  if (error.code === '23505') throw new ApiError(409, 'La estación ya tiene un miembro asignado');
  console.error(error.message);
  throw new ApiError(500, 'Error de base de datos');
}
