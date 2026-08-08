const assert = require('node:assert/strict');
const test = require('node:test');
const { buildTodayView } = require('../src/todayView.mjs');

const roadmapFor = (overrides) => ({
  projects: [
    { id: 'p1', kind: 'project', title: 'Project A' },
    { id: 'p2', kind: 'project', title: 'Project B' }
  ],
  releases: [
    { id: 'r1', kind: 'release', parentId: 'p1', title: 'Release 1: Personal Execution Foundation' },
    { id: 'r9', kind: 'release', parentId: 'p2', title: 'Release Nine' }
  ],
  phases: [
    { id: 'ph1', kind: 'phase', parentId: 'r1', title: 'Today View' }
  ],
  tasks: [
    // Done work must never surface.
    { id: 'done-1', projectId: 'p1', releaseId: 'r1', phaseId: 'ph1', title: 'Preserve roadmap foundation', status: 'done', priority: 'P0' },
    // Archived work must never surface.
    { id: 'arch-1', projectId: 'p1', title: 'Archived task', status: 'todo', priority: 'P0', archived: true },
    // Blocked work must surface first with its reason.
    { id: 'blk-1', projectId: 'p1', releaseId: 'r1', phaseId: 'ph1', title: 'Define Today view contract', status: 'blocked', priority: 'P1', blockedReason: 'Waiting on a decision', nextAction: 'Document the derived contract' },
    // In-progress / priority ordering.
    { id: 't-p0', projectId: 'p1', releaseId: 'r1', phaseId: 'ph1', title: 'P0 todo task', status: 'todo', priority: 'P0', nextAction: 'First thing' },
    { id: 't-p1', projectId: 'p1', releaseId: 'r1', phaseId: 'ph1', title: 'P1 todo task', status: 'todo', priority: 'P1' },
    { id: 't-p2', projectId: 'p1', releaseId: 'r1', phaseId: 'ph1', title: 'P2 backlog task', status: 'backlog', priority: 'P2' },
    // Overdue with due date.
    { id: 't-due', projectId: 'p2', releaseId: 'r9', title: 'Overdue task', status: 'todo', priority: 'P2', dueDate: '2026-07-01' },
    // A subtask must be included as its own grounded item.
    { id: 'sub-1', projectId: 'p1', parentTaskId: 't-p0', releaseId: 'r1', phaseId: 'ph1', title: 'Subtask item', status: 'todo', priority: 'P1' }
  ],
  subtasks: [],
  ...overrides
});

test('done and archived tasks are excluded from the Today view', () => {
  const view = buildTodayView(roadmapFor(), '2026-08-07');
  const ids = view.items.map((item) => item.id);
  assert.ok(!ids.includes('done-1'), 'done task must not surface');
  assert.ok(!ids.includes('arch-1'), 'archived task must not surface');
});

test('blocked tasks surface first with reason, next action, and context', () => {
  const view = buildTodayView(roadmapFor(), '2026-08-07');
  assert.equal(view.items[0].id, 'blk-1');
  const blocked = view.items.filter((item) => item.blocked);
  assert.equal(blocked.length, 1);
  assert.equal(blocked[0].blockedReason, 'Waiting on a decision');
  assert.equal(blocked[0].nextAction, 'Document the derived contract');
  assert.equal(blocked[0].project, 'Project A');
  assert.equal(blocked[0].release, 'Release 1: Personal Execution Foundation');
  assert.equal(blocked[0].phase, 'Today View');
});

test('priority ordering places higher-priority work before lower-priority work', () => {
  const view = buildTodayView(roadmapFor(), '2026-08-07');
  const nonBlocked = view.items.filter((item) => !item.blocked);
  const byTitle = Object.fromEntries(nonBlocked.map((item) => [item.title, item.sortPriority]));
  // Blocked removed; among the rest, P0 (t-p0) must appear before P1 (t-p1).
  assert.ok(nonBlocked.findIndex((item) => item.id === 't-p0') < nonBlocked.findIndex((item) => item.id === 't-p1'));
  assert.ok(byTitle['P0 todo task'] <= byTitle['P1 todo task']);
});

test('overdue tasks are flagged using the reference date', () => {
  const view = buildTodayView(roadmapFor(), '2026-08-07');
  const overdue = view.items.find((item) => item.id === 't-due');
  assert.ok(overdue.overdue);
  assert.equal(view.counts.overdue, 1);
  // A due date in the future is not overdue.
  const future = buildTodayView(roadmapFor({ tasks: [{ id: 't-f', projectId: 'p1', title: 'Future', status: 'todo', dueDate: '2026-12-31' }] }), '2026-08-07');
  assert.ok(!future.items[0].overdue);
});

test('subtasks are grounded items with a parent-project context', () => {
  const view = buildTodayView(roadmapFor(), '2026-08-07');
  const subtask = view.items.find((item) => item.id === 'sub-1');
  assert.ok(subtask);
  assert.equal(subtask.project, 'Project A');
});

test('stable task identity is preserved', () => {
  const view = buildTodayView(roadmapFor(), '2026-08-07');
  assert.deepEqual([...new Set(view.items.map((item) => item.id))].length, view.items.length);
});

test('empty roadmap yields a zero-action Today view with no fabricated data', () => {
  const view = buildTodayView({ projects: [], releases: [], phases: [], tasks: [], subtasks: [] }, '2026-08-07');
  assert.equal(view.items.length, 0);
  assert.deepEqual(view.counts, { actionable: 0, focus: 0, blocked: 0, overdue: 0 });
  assert.ok(view.date);
});
