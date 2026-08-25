const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('legacy application and preparation channels use the durable workflow owner', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.cjs'), 'utf8');
  const preload = fs.readFileSync(path.join(__dirname, '..', 'electron', 'preload.cjs'), 'utf8');
  assert.match(main, /createApplicationQueueService\(\{ repository: coachDatabase\.applications\.queue, worker: processDurableApplicationQueueItem \}\)/);
  assert.match(main, /automation-queue:start'[\s\S]{0,180}startDurableApplicationQueue\(input\)/);
  assert.match(main, /preparation-start'[\s\S]{0,1200}startDurableApplicationQueue/);
  assert.match(main, /selectAdapter\(\{ url: liveBrowser\?\.currentUrl \|\| claimed\.url, enableProviderAdapters: true \}\)/);
  assert.doesNotMatch(main, /stepKey: 'dice-handoff'.*atsKey: 'dice'/);
  assert.match(main, /for \(let page = 0; page < 12; page \+= 1\)/);
  assert.match(main, /state: 'creating_account'/);
  assert.match(preload, /getApplicationWorkflowQueueStatus/);
  assert.match(preload, /startApplicationWorkflowQueue/);
});
