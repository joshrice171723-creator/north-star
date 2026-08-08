const assert = require('node:assert/strict');
const test = require('node:test');
const { buildCoachCardModel } = require('../src/coachPresentation.mjs');

const guidance = (type, extra = {}) => ({ type, taskId: 'task-1', title: 'Example task', guidance: 'Do the next concrete thing.', reason: 'Selected deterministically.', ...extra });

test('presentation covers existing next action', () => {
  const model = buildCoachCardModel(guidance('existing-next-action'));
  assert.equal(model.heading, 'Start with the stored next action');
  assert.equal(model.actionLabel, 'Review task');
  assert.equal(model.tone, 'ready');
  assert.equal(model.uncertain, false);
});

test('presentation covers missing next action', () => {
  const model = buildCoachCardModel(guidance('request-next-action', { uncertain: true }));
  assert.equal(model.heading, 'Choose a concrete next action');
  assert.equal(model.tone, 'clarity');
  assert.equal(model.uncertain, true);
});

test('presentation covers waiting-only roadmap', () => {
  const model = buildCoachCardModel(guidance('waiting-explanation'));
  assert.equal(model.heading, 'Review what is holding work back');
  assert.equal(model.tone, 'waiting');
});

test('presentation covers empty roadmap', () => {
  const model = buildCoachCardModel({ type: 'no-actionable-work' });
  assert.equal(model.heading, 'There is nothing actionable right now');
  assert.equal(model.actionLabel, null);
  assert.equal(model.taskId, null);
});

test('presentation is deterministic and does not mutate guidance', () => {
  const input = guidance('existing-next-action');
  const before = structuredClone(input);
  assert.deepEqual(buildCoachCardModel(input), buildCoachCardModel(input));
  assert.deepEqual(input, before);
});