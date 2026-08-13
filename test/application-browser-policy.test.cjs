const test = require('node:test'); const assert = require('node:assert/strict');
const { classifyField, decideField } = require('../electron/jobs/application-policy.cjs');
test('policy blocks protected controls and fails closed for unknown fields', () => {
  assert.equal(classifyField({ elementType: 'input', inputType: 'password', label: 'Password' }), 'authentication_captcha');
  assert.equal(decideField({ elementType: 'button', label: 'Submit application' }).action, 'blocked');
  assert.equal(decideField({ elementType: 'input', label: 'Unfamiliar field' }).action, 'ask');
});
test('machine-formatted ATS fields are classified without splitting a name', () => {
  const profile = { email: 'candidate@example.test', fullName: 'Ada Lovelace', firstName: 'Ada', lastName: 'Lovelace', state: 'Illinois' };
  assert.equal(decideField({ elementType: 'input', name: 'email_address' }, { profile }).action, 'fill');
  assert.equal(decideField({ elementType: 'input', name: 'first_name' }, { profile }).value, 'Ada');
  assert.equal(decideField({ elementType: 'input', name: 'last_name' }, { profile }).value, 'Lovelace');
  assert.equal(decideField({ elementType: 'input', name: 'state_province' }, { profile }).value, 'Illinois');
});
