const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createDatabase } = require('../electron/database.cjs');

function create() {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'north-star-autonomous-queue-'));
  return { userDataPath, db: createDatabase({ userDataPath, seedPath: path.join(userDataPath, 'missing.csv'), applicationDocumentsPath: userDataPath }) };
}

test('Stage 1 claims one eligible ready application and recovers its opening checkpoint', () => {
  const { userDataPath, db } = create();
  try {
    db.jobs.create({ id: 'queue-ready', company: 'Acme', roleTitle: 'Engineer', url: 'https://jobs.example.test/apply', stage: 'researching' });
    db.jobs.create({ id: 'queue-ineligible', company: 'No HTTPS', roleTitle: 'Engineer', url: 'http://jobs.example.test/apply', stage: 'ready' });
    const app = db.applications.createOrResume({ jobId: 'queue-ready' });
    const resume = db.applications.documents.save({ applicationId: app.id, documentType: 'resume', title: 'Resume', content: { headline: 'Engineer' }, validation: { valid: true, errors: [] }, status: 'approved' });
    const cover = db.applications.documents.save({ applicationId: app.id, documentType: 'cover_letter', title: 'Cover letter', content: { headline: 'Engineer' }, validation: { valid: true, errors: [] }, status: 'approved' });
    db.applications.documents.select(resume.id);
    db.applications.documents.select(cover.id);
    const ineligible = db.applications.createOrResume({ jobId: 'queue-ineligible' });

    const queue = db.applications.listAutomationQueue();
    assert.equal(queue.find((entry) => entry.applicationId === app.id).eligible, true);
    assert.equal(queue.find((entry) => entry.applicationId === ineligible.id).eligible, false);
    const claimed = db.applications.claimNextAutomation();
    assert.equal(claimed.id, app.id);
    assert.equal(claimed.automationState, 'opening');
    assert.equal(claimed.automationAttempt, 1);
    assert.equal(claimed.automationCheckpoint.stage1Boundary, 'browser_execution_deferred_to_stage_2');
    assert.equal(db.applications.claimNextAutomation(), null);

    db.close();
    const reopened = createDatabase({ userDataPath, seedPath: path.join(userDataPath, 'missing.csv'), applicationDocumentsPath: userDataPath });
    assert.equal(reopened.applications.recoverAutomation(), 1);
    const recovered = reopened.applications.get(app.id);
    assert.equal(recovered.automationState, 'queued');
    assert.equal(recovered.automationCheckpoint.recoveredFrom, 'opening');
    reopened.close();
  } finally {
    try { db.close(); } catch {}
    fs.rmSync(userDataPath, { recursive: true, force: true });
  }
});
