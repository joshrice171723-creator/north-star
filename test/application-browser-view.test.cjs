const test = require('node:test'); const assert = require('node:assert/strict');
const { decideNavigation, redactUrl, buildContextMenuTemplate } = require('../electron/jobs/application-browser.cjs');
test('browser navigation is HTTPS-only and new-host popups can be routed through a user checkpoint', () => {
  assert.equal(decideNavigation({ fromUrl: 'https://a.test/x', toUrl: 'http://a.test/y' }).action, 'deny');
  assert.equal(decideNavigation({ fromUrl: 'https://a.test/x', toUrl: 'https://b.test/y' }).action, 'ask_user');
  assert.equal(decideNavigation({ fromUrl: 'https://a.test/x', toUrl: 'https://b.test/apply?role=123', approvedHosts: new Set(['b.test']) }).action, 'allow');
  assert.equal(redactUrl('https://a.test/path?q=secret#token'), 'https://a.test/path');
});

test('browser context menu copies selected employer-page text in the remote view', () => {
  const calls = [];
  const webContents = {
    canGoBack: () => false,
    canGoForward: () => false,
    copy: () => calls.push('copy'),
    cut: () => calls.push('cut'),
    paste: () => calls.push('paste'),
    selectAll: () => calls.push('select-all'),
    reload: () => calls.push('reload'),
  };
  const template = buildContextMenuTemplate({
    params: { selectionText: 'selected job description', editFlags: { canCopy: true } },
    webContents,
    clipboard: { writeText: () => {} },
  });
  const copy = template.find((item) => item.label === 'Copy');

  assert.equal(copy.enabled, true);
  copy.click();
  assert.deepEqual(calls, ['copy']);
});
