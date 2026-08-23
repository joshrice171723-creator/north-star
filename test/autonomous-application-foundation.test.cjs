const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createDatabase } = require('../electron/database.cjs');
const { AUTONOMOUS_APPLICATION_STATES } = require('../electron/jobs/application-automation.cjs');

test('autonomous application state and unknown questions survive a database reopen', () => {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'aicc-autonomous-'));
  try {
    const db = createDatabase({ userDataPath, seedPath: path.join(userDataPath, 'missing.csv') });
    db.jobs.create({ id: 'autonomous-job', company: 'Acme', roleTitle: 'Engineer', url: 'https://example.test/apply' });
    const app = db.applications.createOrResume({ jobId: 'autonomous-job' });
    assert.equal(app.automationState, 'queued');
    assert.ok(AUTONOMOUS_APPLICATION_STATES.includes('needs_user_answer'));
    const unknown = db.applications.saveUnknownQuestion({ applicationId: app.id, providerHost: 'jobs.example.test', pageFingerprint: 'fp-1', controlLabel: 'Veteran status', controlType: 'select', questionKey: 'veteran_status', questionText: 'Do you identify as a veteran?', options: ['Yes', 'No'] });
    assert.equal(unknown.status, 'open');
    assert.equal(db.applications.get(app.id).automationState, 'needs_user_answer');
    db.close();
    const reopened = createDatabase({ userDataPath, seedPath: path.join(userDataPath, 'missing.csv') });
    assert.equal(reopened.applications.listUnknownQuestions(app.id)[0].questionText, 'Do you identify as a veteran?');
    const answer = reopened.applications.resolveUnknownQuestion({ id: unknown.id, answerText: 'No', provenance: ['user-provided'] });
    assert.equal(answer.answerText, 'No');
    assert.equal(reopened.applications.listUnknownQuestions(app.id).length, 0);
    assert.equal(reopened.applications.get(app.id).automationState, 'answering_questions');
    reopened.close();
  } finally { fs.rmSync(userDataPath, { recursive: true, force: true }); }
});
