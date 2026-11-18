import { ApiError, parseText } from './api';
import { DEPARTMENT_KEYS, findStation, type DepartmentKey } from './floorplan';

/** A department key, or null for "same as the station". */
export function parseDepartment(value: unknown): DepartmentKey | null {
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || !(DEPARTMENT_KEYS as string[]).includes(value)) throw new ApiError(400, 'El departamento no existe');
  return value as DepartmentKey;
}

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
