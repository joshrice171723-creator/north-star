const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
const { createDatabase } = require('../electron/database.cjs');
const create = () => { const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'aicc-application-')); return { userDataPath, db: createDatabase({ userDataPath, seedPath: path.join(userDataPath, 'missing.csv') }) }; };

test('application creation resumes and survives a database reopen', () => {
  const { userDataPath, db } = create(); let app;
  try { db.jobs.create({ id: 'job-application-test', company: 'Acme', roleTitle: 'Engineer', url: 'https://example.test/job' }); app = db.applications.createOrResume({ jobId: 'job-application-test' }); assert.equal(db.applications.createOrResume({ jobId: 'job-application-test' }).id, app.id); db.close(); const reopened = createDatabase({ userDataPath, seedPath: path.join(userDataPath, 'missing.csv') }); assert.equal(reopened.applications.get(app.id).jobId, 'job-application-test'); reopened.close(); } finally { try { db.close(); } catch {} try { fs.rmSync(userDataPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch {} }
});

test('approved global answers keep provenance and abandon leaves the job', () => {
  const { userDataPath, db } = create();
  try { db.jobs.create({ id: 'job-answer-test', company: 'Acme', roleTitle: 'Engineer' }); const app = db.applications.createOrResume({ jobId: 'job-answer-test' }); const saved = db.applications.saveAnswer({ applicationId: app.id, questionKey: 'location', answerText: 'Austin, TX', scope: 'global', approvalStatus: 'approved', provenance: ['profile.city'] }); assert.deepEqual(saved.provenance, ['profile.city']); db.applications.abandon(app.id); assert.ok(db.jobs.list().find((job) => job.id === 'job-answer-test')); } finally { db.close(); fs.rmSync(userDataPath, { recursive: true, force: true }); }
});
