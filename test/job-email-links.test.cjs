const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
const { createDatabase } = require('../electron/database.cjs');

test('an email moves to one selected pipeline job', () => {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'aicc-email-link-'));
  const db = createDatabase({ userDataPath, seedPath: path.join(userDataPath, 'missing.csv') });
  try {
    db.jobs.create({ id: 'first-job', company: 'Acme', roleTitle: 'Engineer' });
    db.jobs.create({ id: 'second-job', company: 'Globex', roleTitle: 'Designer' });
    const email = db.email.upsert({ provider: 'gmail', externalId: 'message-1', subject: 'Interview' });
    db.email.link({ emailId: email.id, jobId: 'first-job' });
    assert.deepEqual(db.email.link({ emailId: email.id, jobId: 'second-job' }).linkedJobIds, ['second-job']);
  } finally { db.close(); fs.rmSync(userDataPath, { recursive: true, force: true }); }
});
