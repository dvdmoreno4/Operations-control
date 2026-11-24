// Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ACTIVITY_INFO, ACTIVITY_KINDS, activityScore } from '../src/lib/activities.ts';
import { SCORE_SEGMENTS, totalScore } from '../src/lib/kpis.ts';

const a = (kind, done, period = '2026-11') => ({ kind, done, period });

test('activity shares add up to 100', () => {
  assert.equal(ACTIVITY_KINDS.reduce((sum, k) => sum + ACTIVITY_INFO[k].pct, 0), 100);
});

test('each kind done at least once in the month adds its share once', () => {
  const result = activityScore([a('colaboracion_comercial', true), a('colaboracion_comercial', true), a('conversatorio', true)], '2026-11');
  assert.equal(result.score, 50);
  assert.deepEqual(result.doneKinds, ['colaboracion_comercial', 'conversatorio']);
});

test('not done activities and other months add nothing', () => {
  assert.equal(activityScore([a('proyecto_adicional', false), a('colaboracion_areas', true, '2026-10')], '2026-11').score, 0);
});

test('KPI segment weights add up to 1 and activities weigh 10%', () => {
  assert.ok(Math.abs(SCORE_SEGMENTS.reduce((sum, s) => sum + s.weight, 0) - 1) < 1e-9);
  assert.equal(totalScore({ scoreOperational: 0, scoreProjects: 0, scoreScreenTime: 0, scoreExtra: 100 }), 10);
  assert.equal(totalScore({ scoreOperational: 100, scoreProjects: 100, scoreScreenTime: 100, scoreExtra: 100 }), 100);
});
