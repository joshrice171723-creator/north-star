const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

test('background preparation drains Researching before Target and stops on blockers', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'JobsView.jsx'), 'utf8');
  assert.match(source, /job\.stage === 'researching'[\s\S]*job\.stage === 'target'/);
  assert.match(source, /Do not pull a Target job into Researching while an earlier active/);
  assert.match(source, /catch \(cause\) \{[\s\S]*preparationBlockers[\s\S]*break;/);
});
