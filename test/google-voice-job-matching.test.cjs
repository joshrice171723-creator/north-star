const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createDatabase } = require('../electron/database.cjs');
const { normalizePhoneNumber, extractPhoneNumber } = require('../electron/google-voice.cjs');

const create = () => {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'aicc-google-voice-'));
  return { userDataPath, db: createDatabase({ userDataPath, seedPath: path.join(userDataPath, 'missing.csv') }) };
};

test('phone numbers normalize across Google Voice display formats', () => {
  assert.equal(normalizePhoneNumber('+1 (214) 555-0199'), '2145550199');
  assert.equal(normalizePhoneNumber('214-555-0199'), '2145550199');
  assert.equal(extractPhoneNumber('New message from +1 (214) 555-0199'), '2145550199');
});

test('assigned Google Voice activity updates one job and deduplicates polling', () => {
  const { userDataPath, db } = create();
  try {
    db.jobs.create({ id: 'voice-job', company: 'Acme', roleTitle: 'Engineer' });
    const assigned = db.jobs.activity.assignGoogleVoiceConversation('voice-job', { phoneNumber: '+1 214 555 0199', title: 'Hiring manager', content: 'I assigned this conversation.' });
    assert.equal(assigned.metadata.phoneNumber, '2145550199');
    const first = db.jobs.activity.ingestGoogleVoiceActivity({ phoneNumber: '(214) 555-0199', title: 'New message', content: 'Can we talk tomorrow?', activityType: 'message' });
    assert.equal(first.matched, true);
    assert.equal(first.activities.length, 1);
    const second = db.jobs.activity.ingestGoogleVoiceActivity({ phoneNumber: '+1 214 555 0199', title: 'New message', content: 'Can we talk tomorrow?', activityType: 'message' });
    assert.equal(second.duplicate, true);
    assert.equal(db.jobs.activity.list('voice-job').filter((item) => item.activityType === 'google_voice_conversation').length, 2);
    assert.equal(db.jobs.list().find((job) => job.id === 'voice-job').updatedAt > assigned.createdAt, true);
  } finally {
    db.close();
    fs.rmSync(userDataPath, { recursive: true, force: true });
  }
});

test('shared phone numbers are left unmatched for safety', () => {
  const { userDataPath, db } = create();
  try {
    db.jobs.create({ id: 'voice-job-a', company: 'Acme', roleTitle: 'Engineer' });
    db.jobs.create({ id: 'voice-job-b', company: 'Beta', roleTitle: 'Designer' });
    db.jobs.activity.assignGoogleVoiceConversation('voice-job-a', { phoneNumber: '2145550199', content: 'First assignment.' });
    db.jobs.activity.assignGoogleVoiceConversation('voice-job-b', { phoneNumber: '2145550199', content: 'Second assignment.' });
    const result = db.jobs.activity.ingestGoogleVoiceActivity({ phoneNumber: '2145550199', content: 'Shared number message.' });
    assert.equal(result.reason, 'ambiguous_phone');
    assert.equal(result.activities.length, 0);
  } finally {
    db.close();
    fs.rmSync(userDataPath, { recursive: true, force: true });
  }
});
