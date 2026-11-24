// Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COLLABORATOR_SHARE, projectScore, shareOf } from '../src/lib/projects.ts';

const ev = (status, progress, at) => ({ status, progress, at });

test('one completed project in the semester reaches the goal (100)', () => {
  const project = { name: 'A', events: [ev('propuesta', 0, '2026-07-10T10:00:00Z'), ev('aceptado', 50, '2026-08-01T10:00:00Z'), ev('culminado', 100, '2026-10-05T10:00:00Z')] };
  const result = projectScore([project], '2026-11');
  assert.equal(result.score, 100);
  assert.equal(result.semester, '2026-H2');
  assert.equal(result.completedInSemester, 1);
});

test('progress counts toward the goal as of the end of the month', () => {
  const project = { name: 'A', events: [ev('propuesta', 20, '2026-07-10T10:00:00Z'), ev('produccion', 75, '2026-10-05T10:00:00Z')] };
  assert.equal(projectScore([project], '2026-09').score, 20);
  assert.equal(projectScore([project], '2026-10').score, 75);
});

test('several projects add up, capped at 100', () => {
  const a = { name: 'A', events: [ev('aceptado', 50, '2026-08-01T10:00:00Z')] };
  const b = { name: 'B', events: [ev('produccion', 75, '2026-09-01T10:00:00Z')] };
  assert.equal(projectScore([a, b], '2026-11').score, 100);
  assert.equal(projectScore([a], '2026-11').score, 50);
});

test('projects completed in an earlier semester count for the year, not again for the semester', () => {
  const old = { name: 'A', events: [ev('culminado', 100, '2026-03-01T10:00:00Z')] };
  const result = projectScore([old], '2026-11');
  assert.equal(result.score, 0);
  assert.equal(result.completedInSemester, 0);
  assert.equal(result.completedInYear, 1);
});

test('projects created after the month do not count', () => {
  const later = { name: 'A', events: [ev('aceptado', 50, '2026-12-02T10:00:00Z')] };
  assert.equal(projectScore([later], '2026-11').score, 0);
});

test('collaborators earn a share of the project progress, others nothing', () => {
  const project = {
    name: 'A',
    memberId: 'owner',
    collaborators: [{ memberId: 'helper', name: 'Ayudante' }],
    events: [ev('propuesta', 0, '2026-08-02T10:00:00Z'), ev('aceptado', 50, '2026-11-05T10:00:00Z')],
  };
  assert.equal(shareOf(project, 'owner'), 1);
  assert.equal(shareOf(project, 'helper'), COLLABORATOR_SHARE);
  assert.equal(shareOf(project, 'stranger'), 0);

  assert.equal(projectScore([{ ...project, share: 1 }], '2026-11').score, 50);
  assert.equal(projectScore([{ ...project, share: COLLABORATOR_SHARE }], '2026-11').score, 50 * COLLABORATOR_SHARE);
  assert.equal(projectScore([{ ...project, share: 0 }], '2026-11').score, 0);
});
