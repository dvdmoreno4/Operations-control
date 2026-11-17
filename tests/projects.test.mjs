// Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { projectScore } from '../src/lib/projects.ts';

const ev = (status, progress, at) => ({ status, progress, at });

test('milestones reached in the month add their points', () => {
  const project = {
    name: 'A',
    events: [ev('propuesta', 0, '2026-10-02T10:00:00Z'), ev('aceptado', 50, '2026-11-05T10:00:00Z'), ev('produccion', 75, '2026-11-20T10:00:00Z')],
  };
  const result = projectScore([project], '2026-11');
  assert.equal(result.milestonePoints, 60);
  assert.equal(result.score, 100);
  assert.equal(result.milestones.length, 2);
});

test('milestones from earlier months do not count again', () => {
  const project = {
    name: 'A',
    events: [
      ev('propuesta', 0, '2026-09-01T10:00:00Z'),
      ev('aceptado', 50, '2026-10-05T10:00:00Z'),
      ev('propuesta', 40, '2026-11-01T10:00:00Z'),
      ev('aceptado', 50, '2026-11-02T10:00:00Z'),
    ],
  };
  assert.equal(projectScore([project], '2026-11').milestonePoints, 0);
});

test('manual progress gained in the month counts at 0.3 points per percent, capped at 15', () => {
  const small = { name: 'A', events: [ev('propuesta', 10, '2026-10-30T10:00:00Z'), ev('propuesta', 30, '2026-11-10T10:00:00Z')] };
  assert.equal(projectScore([small], '2026-11').manualPoints, 6);

  const big = { name: 'B', events: [ev('propuesta', 0, '2026-11-01T10:00:00Z'), ev('propuesta', 49, '2026-11-10T10:00:00Z')] };
  const other = { name: 'C', events: [ev('propuesta', 0, '2026-11-01T10:00:00Z'), ev('propuesta', 49, '2026-11-11T10:00:00Z')] };
  assert.equal(projectScore([big, other], '2026-11').manualPoints, 15);
});

test('no activity gives 0', () => {
  assert.equal(projectScore([], '2026-11').score, 0);
  const idle = { name: 'A', events: [ev('propuesta', 20, '2026-10-01T10:00:00Z')] };
  assert.equal(projectScore([idle], '2026-11').score, 0);
});
