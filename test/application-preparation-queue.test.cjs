const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

test('background preparation drains Researching before Target and stops on blockers', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.cjs'), 'utf8');
  assert.match(source, /jobs\.find\(\(entry\) => entry\.stage === 'researching'\) \|\| jobs\.find\(\(entry\) => entry\.stage === 'target'\)/);
  assert.match(source, /if \(!coachDatabase \|\| applicationPreparationState\.activeJobId\) return;/);
  assert.match(source, /!applicationPreparationState\.blockers\[job\.id\]/);
  assert.match(source, /applicationPreparationState\.retryAt = 0/);
  assert.match(source, /eventType: 'preparation_failed'/);
  assert.match(source, /function syncPreparationActivity\(\)/);
  assert.match(source, /applicationPreparationTimer = null;/);
  assert.doesNotMatch(source, /setInterval\(\(\) => \{ runApplicationPreparationQueue/);
});
