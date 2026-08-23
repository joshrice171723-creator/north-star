const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { normalizeSnapshot } = require('../electron/jobs/application-inspector.cjs');
const { classifyField } = require('../electron/jobs/application-policy.cjs');

test('generic application fixture exposes bounded inspection and safe page boundary', () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'generic-application-form.json'), 'utf8'));
  const first = normalizeSnapshot(fixture.pages[0]);
  const second = normalizeSnapshot(fixture.pages[1]);
  assert.equal(first.fields.find((field) => field.label === 'Continue').category, 'navigation');
  assert.equal(second.fields.find((field) => field.label === 'Resume').category, 'file_upload');
  assert.equal(second.fields.find((field) => field.label === 'Submit application').category, 'final_submit');
  assert.notEqual(first.pageFingerprint, second.pageFingerprint);
  assert.equal(first.fields.some((field) => Object.hasOwn(field, 'value')), false);
});

test('Stage 2 browser adapter keeps uploads and next-page navigation separate from submission', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'electron', 'jobs', 'application-browser.cjs'), 'utf8');
  assert.match(source, /DOM\.setFileInputFiles/);
  assert.match(source, /const advance = async/);
  assert.match(source, /category === 'navigation'/);
  assert.doesNotMatch(source, /requestSubmit\(|\.submit\(|\.click\(/);
  assert.equal(classifyField({ elementType: 'button', inputType: 'submit', label: 'Submit application' }), 'final_submit');
});

test('Stage 2 queue handoff opens one claimed application and checkpoints its first page', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.cjs'), 'utf8');
  assert.match(source, /async function startAutonomousApplicationQueue\(\)/);
  assert.match(source, /await applicationBrowser\.open\(\{ applicationId: claimed\.id \}\)/);
  assert.match(source, /externalApplicationUrl \|\| application\?\.applicationUrl/);
  assert.match(source, /\.\.\.application\.automationCheckpoint/);
  assert.match(source, /state: 'failed', checkpoint: \{ stage: 'opening', error: message \}/);
});
