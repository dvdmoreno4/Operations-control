// Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ACTIVITY_INFO, ACTIVITY_KINDS, activityBonus, MAX_ACTIVITY_BONUS, MAX_ACTIVITY_PENALTY } from '../src/lib/activities.ts';
import { centralScore, SCORE_SEGMENTS, totalScore } from '../src/lib/kpis.ts';

const a = (kind, done, period = '2026-11') => ({ kind, done, period });

test('conversatorios add much less than the other activities', () => {
  for (const kind of ACTIVITY_KINDS.filter((k) => k !== 'conversatorio')) {
    assert.ok(ACTIVITY_INFO.conversatorio.bonus < ACTIVITY_INFO[kind].bonus);
  }
});

test('each done activity adds its points, not done ones and other months add nothing', () => {
  const result = activityBonus([a('colaboracion_comercial', true), a('conversatorio', true), a('proyecto_adicional', false), a('colaboracion_areas', true, '2026-10')], '2026-11');
  assert.equal(result.bonus, ACTIVITY_INFO.colaboracion_comercial.bonus + ACTIVITY_INFO.conversatorio.bonus);
  assert.equal(result.doneCount, 2);
});

test('only a conversatorio marked as not done subtracts; other missed activities and pending ones do not', () => {
  const missedOthers = activityBonus([a('colaboracion_comercial', false), a('proyecto_adicional', false), a('colaboracion_areas', false)], '2026-11');
  assert.equal(missedOthers.net, 0);

  const pending = activityBonus([a('conversatorio', null)], '2026-11');
  assert.equal(pending.net, 0);

  const missed = activityBonus([a('conversatorio', false), a('colaboracion_comercial', true)], '2026-11');
  assert.equal(missed.penalty, ACTIVITY_INFO.conversatorio.penalty);
  assert.equal(missed.net, ACTIVITY_INFO.colaboracion_comercial.bonus - ACTIVITY_INFO.conversatorio.penalty);

  const manyMissed = activityBonus(Array.from({ length: 10 }, () => a('conversatorio', false)), '2026-11');
  assert.equal(manyMissed.penalty, MAX_ACTIVITY_PENALTY);
});

test('a missed conversatorio lowers the central KPI, never below 0', () => {
  const values = { scoreOperational: 60, scoreProjects: 60, scoreScreenTime: 60 };
  assert.equal(totalScore({ ...values, scoreExtra: -3 }), 57);
  assert.equal(totalScore({ scoreOperational: 2, scoreProjects: 2, scoreScreenTime: 2, scoreExtra: -10 }), 0);
});

test('the monthly bonus is capped', () => {
  const many = Array.from({ length: 10 }, () => a('proyecto_adicional', true));
  assert.equal(activityBonus(many, '2026-11').bonus, MAX_ACTIVITY_BONUS);
});

test('the bonus adds on top of the central KPI, which only weighs operativa, proyectos and pantalla', () => {
  assert.ok(Math.abs(SCORE_SEGMENTS.reduce((sum, s) => sum + s.weight, 0) - 1) < 1e-9);
  const values = { scoreOperational: 60, scoreProjects: 60, scoreScreenTime: 60 };
  assert.equal(centralScore(values), 60);
  // No activities: nothing lost.
  assert.equal(totalScore({ ...values, scoreExtra: 0 }), 60);
  assert.equal(totalScore({ ...values, scoreExtra: 7 }), 67);
  // Never above 100.
  assert.equal(totalScore({ scoreOperational: 98, scoreProjects: 98, scoreScreenTime: 98, scoreExtra: 10 }), 100);
});
