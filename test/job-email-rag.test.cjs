const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyJobEmail, chunkText, searchChunks, normalizeGmailMessage } = require('../electron/job-email-rag.cjs');

test('classifies recruiter and interview messages as job-related', () => {
  const result = classifyJobEmail({ subject: 'Interview invitation', from: 'recruiting@example.com', body: 'We would like to schedule a phone screen.' });
  assert.equal(result.isJobRelated, true);
  assert.ok(result.score >= 18);
  assert.ok(result.matchedTerms.includes('interview'));
});

test('chunks text with overlap and retrieves matching chunks', () => {
  const chunks = chunkText('alpha '.repeat(500), { size: 100, overlap: 20 });
  assert.ok(chunks.length > 1);
  assert.ok(searchChunks([{ id: 'one', content: 'The recruiter requested a resume.' }], 'resume recruiter')[0].score >= 2);
});

test('normalizes Gmail headers and plain-text body', () => {
  const message = normalizeGmailMessage({ id: 'abc', threadId: 'thread', payload: { headers: [{ name: 'Subject', value: 'Role update' }, { name: 'From', value: 'recruiter@example.com' }], body: { data: Buffer.from('Application interview update').toString('base64url') } } });
  assert.equal(message.externalId, 'abc');
  assert.equal(message.subject, 'Role update');
  assert.equal(message.isJobRelated, true);
  assert.match(message.body, /Application interview update/);
});
