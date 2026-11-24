// Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { totalScore } from '../src/lib/kpis.ts';
import { average, elapsedMonths, monthsOf, semesterLabel, semesterOf, semestersOf } from '../src/lib/semester.ts';
import { aggregateByMember } from '../src/lib/stats.ts';

test('semesters', () => {
  assert.equal(semesterOf('2026-06'), '2026-H1');
  assert.equal(semesterOf('2026-07'), '2026-H2');
  assert.deepEqual(monthsOf('2026-H2'), ['2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12']);
  assert.equal(semesterLabel('2026-H1'), 'Ene - Jun 2026');
  assert.equal(elapsedMonths('2026-H2', '2026-11'), 5);
  assert.equal(elapsedMonths('2026-H1', '2026-11'), 6);
  assert.equal(elapsedMonths('2027-H1', '2026-11'), 0);
  assert.deepEqual(semestersOf(['2026-11', '2026-08', '2026-03']), ['2026-H2', '2026-H1']);
  assert.equal(average([80, null, 90]), 85);
  assert.equal(average([]), null);
});

const record = (memberId, period, scores, pnl) => ({
  memberId,
  period,
  operationsCount: 10,
  volume: 100,
  pnl,
  pnlPct: 1,
  goal: 50,
  achieved: 40,
  errors: 1,
  incidents: 0,
  scoreOperational: scores,
  scoreProjects: scores,
  scoreScreenTime: scores,
  scoreExtra: 0,
  notes: '',
});

test('semester record per member: scores averaged, amounts added', () => {
  const [one] = aggregateByMember([record('m', '2026-07', 60, 100), record('m', '2026-08', 80, -30)]);
  assert.equal(one.memberId, 'm');
  assert.equal(one.pnl, 70);
  assert.equal(one.operationsCount, 20);
  assert.equal(one.goal, 100);
  // Average of the monthly totals (60 and 80).
  assert.equal(totalScore(one), 70);
});
