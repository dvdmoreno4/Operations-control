// Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ACTIVITY_INFO, ACTIVITY_KINDS, activityBonus, MAX_ACTIVITY_BONUS } from '../src/lib/activities.ts';
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
