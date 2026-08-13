const test = require('node:test'); const assert = require('node:assert/strict');
const { classifyField, decideField } = require('../electron/jobs/application-policy.cjs');
test('policy blocks protected controls and fails closed for unknown fields', () => {
  assert.equal(classifyField({ elementType: 'input', inputType: 'password', label: 'Password' }), 'authentication_captcha');
  assert.equal(decideField({ elementType: 'button', label: 'Submit application' }).action, 'blocked');
  assert.equal(decideField({ elementType: 'input', label: 'Unfamiliar field' }).action, 'ask');
});
