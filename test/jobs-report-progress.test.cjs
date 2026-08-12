const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

test('provider retrieval report remains available during OpenRouter progress', () => {
  const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'JobsView.jsx'), 'utf8');
  const main = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.cjs'), 'utf8');
  assert.match(main, /\.\.\.batch, report: retrievalReport/);
  assert.match(renderer, /progress\?\.report/);
  assert.match(renderer, /setSearchReport\(progress\.report\)/);
});
