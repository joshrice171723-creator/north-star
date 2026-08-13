const test = require('node:test'); const assert = require('node:assert/strict');
const { normalizeSnapshot } = require('../electron/jobs/application-inspector.cjs');
test('inspector bounds descriptors and never retains password values', () => {
  const snapshot = normalizeSnapshot({ url: 'https://example.test/app?token=secret', fields: [{ elementType: 'input', inputType: 'password', label: 'Password', value: 'secret' }, ...Array.from({ length: 350 }, () => ({ elementType: 'input', label: 'Name' }))] });
  assert.equal(snapshot.fields.length, 300); assert.equal(snapshot.fields[0].category, 'authentication_captcha'); assert.equal('value' in snapshot.fields[0], false);
});
