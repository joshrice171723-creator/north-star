const test = require('node:test');
const assert = require('node:assert/strict');
const { MAX_RESUME_CHARS, parseFillPlanResponse, repairFillPlanMessages, isAiFillCandidate, buildFillPlanMessages, normalizeFillPlanDecisions } = require('../electron/jobs/application-fill-planner.cjs');

test('fill-plan parser accepts a fenced JSON response', () => {
  assert.deepEqual(parseFillPlanResponse({ message: { content: '```json\n{"fields":[]}\n```' } }), { fields: [] });
});

test('AI candidates contain only empty supported non-protected controls', () => {
  assert.equal(isAiFillCandidate({ empty: true, elementType: 'textarea', inputType: 'textarea', category: 'free_text' }), true);
  assert.equal(isAiFillCandidate({ empty: true, elementType: 'input', inputType: 'date', category: 'compensation' }), true);
  assert.equal(isAiFillCandidate({ empty: false, elementType: 'input', inputType: 'text', category: 'unknown' }), false);
  assert.equal(isAiFillCandidate({ empty: true, elementType: 'input', inputType: 'password', category: 'authentication_captcha' }), false);
  assert.equal(isAiFillCandidate({ empty: true, elementType: 'input', inputType: 'text', category: 'identity_contact' }), false);
});

test('fill-plan prompt supplies the full verified profile and job evidence with a coverage goal', () => {
  const messages = buildFillPlanMessages({ fields: [{ fieldFingerprint: 'field-a', elementType: 'select', options: ['Yes', 'No'] }], profile: { workAuthorization: 'US citizen', requiresSponsorship: false, desiredSalary: 120000 }, job: { company: 'Example', roleTitle: 'Engineer', description: 'Build systems.' }, resumeText: 'Candidate resume', coverLetterText: 'Candidate cover letter' });
  assert.match(messages[0].content, /Maximize the number/);
  assert.match(messages[0].content, /exactly one decision for every supplied fieldFingerprint/);
  assert.match(messages[1].content, /"workAuthorization":"US citizen"/);
  assert.match(messages[1].content, /"requiresSponsorship":false/);
  assert.match(messages[1].content, /Candidate cover letter/);
  assert.match(messages[1].content, /Build systems/);
});

test('decision normalization preserves scalar answers and retries incomplete or invalid select decisions', () => {
  const fields = [
    { fieldFingerprint: 'number', elementType: 'input', inputType: 'number' },
    { fieldFingerprint: 'boolean', elementType: 'input', inputType: 'text' },
    { fieldFingerprint: 'select', elementType: 'select', options: ['Yes', 'No'] },
    { fieldFingerprint: 'missing', elementType: 'textarea', inputType: 'textarea' },
  ];
  const result = normalizeFillPlanDecisions({ fields: [
    { fieldFingerprint: 'number', action: 'fill', displayValue: 7 },
    { fieldFingerprint: 'boolean', action: 'fill', displayValue: false },
    { fieldFingerprint: 'select', action: 'fill', displayValue: 'maybe' },
  ] }, fields);
  assert.equal(result.decisions.number.displayValue, '7');
  assert.equal(result.decisions.boolean.displayValue, 'false');
  assert.deepEqual(result.unresolvedFields.map((field) => field.fieldFingerprint), ['select', 'missing']);
});

test('fill-plan repair prompt bounds invalid output and excludes resume data', () => {
  const response = { message: { content: '{"fields":[' + 'x'.repeat(30_000) } };
  const messages = repairFillPlanMessages(response, [{ fieldFingerprint: 'field-a' }]);
  assert.equal(messages[1].content.includes('field-a'), true);
  assert.equal(messages[1].content.includes('x'.repeat(20_001)), false);
  assert.equal(MAX_RESUME_CHARS, 180_000);
});
