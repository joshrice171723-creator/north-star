const assert = require('node:assert/strict');
const test = require('node:test');
const { buildCoachContext, buildDeterministicCoachGuidance } = require('../src/coachContext.mjs');

const roadmap = {
  projects: [{ id: 'p1', title: 'Project A' }],
  releases: [{ id: 'r1', title: 'Release 1' }],
  phases: [{ id: 'ph1', title: 'Focus phase' }],
  tasks: [
    { id: 'start', projectId: 'p1', releaseId: 'r1', phaseId: 'ph1', title: 'Start task', status: 'in-progress', priority: 'P1', nextAction: 'Open the draft and review the first section.', updatedAt: '2026-08-08' },
    { id: 'waiting', projectId: 'p1', releaseId: 'r1', phaseId: 'ph1', title: 'Waiting task', status: 'todo', dependencies: 'missing', blockedReason: '', updatedAt: '2026-08-08' },
    { id: 'blocked', projectId: 'p1', title: 'Blocked task', status: 'blocked', blockedReason: 'Need approval', updatedAt: '2026-08-08' }
  ],
  subtasks: []
};

test('coach context is compact, bounded, and derived from Focus, Waiting, and Follow-through', () => {
  const context = buildCoachContext(roadmap, '2026-08-08');
  assert.equal(context.schemaVersion, 1);
  assert.equal(context.source, 'local-roadmap-derived');
  assert.equal(context.focus[0].id, 'start');
  assert.equal(context.waiting.length, 2);
  assert.equal(context.waiting[0].id, 'blocked');
  assert.equal(context.followThrough.length, 1);
  assert.equal(context.followThrough[0].id, 'blocked');
  assert.equal(context.focus[0].description, undefined);
  assert.match(JSON.stringify(context), /Start task/);
});

test('context limits and text bounds are enforced without changing the roadmap', () => {
  const input = structuredClone(roadmap);
  input.tasks.push(...Array.from({ length: 20 }, (_, index) => ({
    id: `extra-${index}`,
    projectId: 'p1',
    title: `Extra task ${index} ${'x'.repeat(500)}`,
    status: 'todo'
  })));
  const context = buildCoachContext(input, '2026-08-08', { limits: { focus: 2, waiting: 1, followThrough: 1, text: 40 } });
  assert.equal(context.focus.length, 2);
  assert.ok(context.waiting.length <= 1);
  assert.ok(context.followThrough.length <= 1);
  assert.ok(context.focus.every((item) => item.title.length <= 40));
  assert.deepEqual(input, { ...roadmap, tasks: [...roadmap.tasks, ...input.tasks.slice(3)] });
});

test('deterministic guidance uses an existing next action and never invents a task', () => {
  const context = buildCoachContext(roadmap, '2026-08-08');
  const guidance = buildDeterministicCoachGuidance(context);
  assert.equal(guidance.type, 'existing-next-action');
  assert.equal(guidance.taskId, 'start');
  assert.equal(guidance.guidance, 'Open the draft and review the first section.');
});

test('deterministic guidance asks for a next action when the Focus item has none', () => {
  const context = buildCoachContext({ ...roadmap, tasks: [{ ...roadmap.tasks[0], nextAction: '' }] }, '2026-08-08');
  const guidance = buildDeterministicCoachGuidance(context);
  assert.equal(guidance.type, 'request-next-action');
  assert.equal(guidance.taskId, 'start');
  assert.equal(guidance.uncertain, true);
});

test('deterministic guidance explains Waiting or reports an empty roadmap truthfully', () => {
  const waiting = buildDeterministicCoachGuidance({ focus: [], waiting: [{ id: 'w1', title: 'Waiting', waitingReasons: ['Waiting for approval.'] }] });
  assert.equal(waiting.type, 'waiting-explanation');
  assert.equal(waiting.guidance, 'Waiting for approval.');

  const empty = buildDeterministicCoachGuidance({ focus: [], waiting: [] });
  assert.equal(empty.type, 'no-actionable-work');
  assert.match(empty.guidance, /No actionable work/);
});