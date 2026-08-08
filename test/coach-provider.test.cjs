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
  const result = { ok: true, model: OPENROUTER_COACH_MODEL, message: { role: 'assistant', content: '  Start with the draft.  ' }, usage: { total_tokens: 12 } };
  const normalized = normalizeCoachProviderResponse(result);
  assert.deepEqual(normalized, { ok: true, model: OPENROUTER_COACH_MODEL, text: 'Start with the draft.', usage: { total_tokens: 12 }, error: null });
  assert.equal(normalizeCoachProviderResponse({ ok: true }).ok, false);
});