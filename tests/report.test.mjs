// Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildReport } from '../src/lib/reportData.ts';
import { reportUrl } from '../src/lib/reportLink.ts';

const member = (id, stationId, departmentKey = null) => ({ id, stationId, name: id, role: '', departmentKey, pendingRequests: 0, latestScore: null, latestPeriod: null });
const record = (memberId, period, score, pnl = 0) => ({
  memberId,
  period,
  operationsCount: 1,
  volume: 10,
  pnl,
  pnlPct: 0,
  goal: 0,
  achieved: 0,
  errors: 0,
  incidents: 0,
  scoreOperational: score,
  scoreProjects: score,
  scoreScreenTime: score,
  scoreExtra: 0,
  scoreCollab: 0,
  notes: '',
});

const members = [member('ana', 'NA-1'), member('beto', 'NA-2'), member('caro', 'GER-1')];
const records = [record('ana', '2026-10', 80, 100), record('beto', '2026-10', 60, -40), record('caro', '2026-10', 90), record('ana', '2026-11', 70)];

test('monthly report for everyone: summary, ranking, trend and departments', () => {
  const r = buildReport(members, records, '2026-10', () => true);
  assert.equal(r.mode, 'mensual');
  assert.equal(r.summary.reporting, 3);
  assert.equal(r.summary.avgTotal, 76.7);
  assert.equal(r.summary.pnl, 60);
  assert.deepEqual(r.people.map((p) => p.member.id), ['caro', 'ana', 'beto']);
  assert.equal(r.trend.length, 6);
  assert.equal(r.trend.find((t) => t.month === '2026-10').avg, 76.7);
  assert.equal(r.trend.find((t) => t.month === '2026-11').avg, 70);
  assert.deepEqual(r.byDepartment.map((d) => [d.key, d.avg]), [
    ['nuevo_acciones', 70],
    ['gerencia', 90],
  ]);
});

test('department and member scopes only cover their people', () => {
  const dept = buildReport(members, records, '2026-10', (m) => m.stationId.startsWith('NA'));
  assert.deepEqual(dept.people.map((p) => p.member.id).sort(), ['ana', 'beto']);
  const one = buildReport(members, records, '2026-11', (m) => m.id === 'ana');
  assert.equal(one.summary.avgTotal, 70);
  assert.equal(one.people.length, 1);
});

test('semester report averages each member over the months with a record', () => {
  const r = buildReport(members, records, '2026-H2', (m) => m.id === 'ana');
  assert.equal(r.mode, 'semestral');
  assert.equal(r.summary.avgTotal, 75);
});

test('report links', () => {
  assert.equal(reportUrl({ kind: 'all' }, '2026-H2'), '/informe?period=2026-H2');
  assert.equal(reportUrl({ kind: 'department', department: 'gerencia' }, '2026-11'), '/informe?period=2026-11&department=gerencia');
  assert.equal(reportUrl({ kind: 'member', memberId: 'x1' }, '2026-11'), '/informe?period=2026-11&member=x1');
});
