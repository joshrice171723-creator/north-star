const test = require('node:test');
const assert = require('node:assert/strict');
const { MAX_RESUME_CHARS, parseFillPlanResponse, repairFillPlanMessages } = require('../electron/jobs/application-fill-planner.cjs');

test('fill-plan parser accepts a fenced JSON response', () => {
  assert.deepEqual(parseFillPlanResponse({ message: { content: '```json\n{"fields":[]}\n```' } }), { fields: [] });
});

test('fill-plan repair prompt bounds invalid output and excludes resume data', () => {
  const response = { message: { content: '{"fields":[' + 'x'.repeat(30_000) } };
  const messages = repairFillPlanMessages(response, [{ fieldFingerprint: 'field-a' }]);
  assert.equal(messages[1].content.includes('field-a'), true);
  assert.equal(messages[1].content.includes('x'.repeat(20_001)), false);
  assert.equal(MAX_RESUME_CHARS, 180_000);
});
