const test = require('node:test'); const assert = require('node:assert/strict');
const { decideNavigation, redactUrl } = require('../electron/jobs/application-browser.cjs');
test('browser navigation is HTTPS-only and new hosts need a one-time decision', () => {
  assert.equal(decideNavigation({ fromUrl: 'https://a.test/x', toUrl: 'http://a.test/y' }).action, 'deny');
  assert.equal(decideNavigation({ fromUrl: 'https://a.test/x', toUrl: 'https://b.test/y' }).action, 'ask_user');
  assert.equal(redactUrl('https://a.test/path?q=secret#token'), 'https://a.test/path');
});
