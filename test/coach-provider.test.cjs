const assert = require('node:assert/strict');
const test = require('node:test');
const { buildCoachProviderMessages, normalizeCoachProviderResponse, OPENROUTER_COACH_MODEL } = require('../src/coachProvider.mjs');

test('provider payload contains only bounded context and stable coaching instructions', () => {
  const context = { schemaVersion: 1, source: 'local-roadmap-derived', focus: [{ id: 't1', title: 'Draft', nextAction: 'Open the draft.' }], waiting: [], followThrough: [], counts: { focus: 1 } };
  const messages = buildCoachProviderMessages(context);
  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, 'system');
  assert.match(messages[0].content, /Do not invent tasks/);
  assert.match(messages[1].content, /local context/);
  assert.match(messages[1].content, /Draft/);
  assert.doesNotMatch(messages[1].content, /apiKey|password|notes/i);
});

test('provider response is normalized without mutating or trusting missing content', () => {
  const context = { focus: [{ id: 't1', title: 'Draft', status: 'todo', dependencyChain: [], blocked: false }] };
  const result = { ok: true, model: OPENROUTER_COACH_MODEL, message: { role: 'assistant', content: JSON.stringify({ taskId: 't1', nextStep: 'Open the draft.', explanation: 'It is ready now.', uncertainty: 'low' }) }, usage: { total_tokens: 12 } };
  const normalized = normalizeCoachProviderResponse(result, context);
  assert.equal(normalized.ok, true);
  assert.deepEqual(normalized.recommendation, { taskId: 't1', title: 'Draft', nextStep: 'Open the draft.', explanation: 'It is ready now.', uncertainty: 'low' });
  assert.equal(normalizeCoachProviderResponse({ ok: true }, context).ok, false);
});

test('provider recommendations are rejected when they are plain text, unknown, blocked, or dependency-locked', () => {
  const context = { focus: [{ id: 'ready', title: 'Ready', status: 'todo', dependencyChain: [], blocked: false }], waiting: [{ id: 'blocked', title: 'Blocked', status: 'blocked', dependencyChain: ['x'], blocked: true }] };
  const base = { ok: true, model: OPENROUTER_COACH_MODEL, message: { role: 'assistant', content: '' } };
  assert.equal(normalizeCoachProviderResponse({ ...base, message: { content: 'Start now.' } }, context).ok, false);
  assert.equal(normalizeCoachProviderResponse({ ...base, message: { content: JSON.stringify({ taskId: 'missing', nextStep: 'Do it', explanation: 'Because', uncertainty: 'low' }) } }, context).ok, false);
  assert.equal(normalizeCoachProviderResponse({ ...base, message: { content: JSON.stringify({ taskId: 'blocked', nextStep: 'Do it', explanation: 'Because', uncertainty: 'low' }) } }, { focus: context.waiting }).ok, false);
});