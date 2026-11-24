// Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupStats, stationStats, statsOfDepartment } from '../src/lib/stats.ts';

const member = (id, stationId, departmentKey = null) => ({
  id,
  stationId,
  name: id,
  role: '',
  departmentKey,
  pendingRequests: 0,
  latestScore: null,
  latestPeriod: null,
});

test('a member counts for their own department, not their station', () => {
  // NA-1 is an "Acciones y Portafolios" station; this member belongs to Gerencia.
  const stats = stationStats([member('a', 'NA-1', 'gerencia'), member('b', 'NA-2')], []);
  const gerencia = statsOfDepartment(stats, 'gerencia').filter((s) => s.member);
  const nuevo = statsOfDepartment(stats, 'nuevo_acciones').filter((s) => s.member);
  assert.deepEqual(gerencia.map((s) => s.member.id), ['a']);
  assert.deepEqual(nuevo.map((s) => s.member.id), ['b']);
  assert.equal(groupStats(statsOfDepartment(stats, 'gerencia')).occupied, 1);
});

test('empty stations keep their station department', () => {
  const stats = statsOfDepartment(stationStats([], []), 'operadores_externos');
  assert.deepEqual(stats.map((s) => s.station.id), ['IA-7', 'IA-8', 'IA-9', 'IA-10']);
});
