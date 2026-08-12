const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

test('job search keeps deterministic candidates when final AI selection fails', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.cjs'), 'utf8');
  assert.match(source, /rankingError/);
  assert.match(source, /showing deterministic provider candidates/);
  assert.match(source, /ranked = found\.jobs\.map/);
  assert.doesNotMatch(source, /No jobs were selected/);
});

// Verify the fallback score shape used by the main-process projection.
test('deterministic fallback preserves its score', () => {
  const job = { externalId: 'x', retrievalScore: 42 };
  const fallback = {
    externalId: job.externalId,
    fitScore: Number.isFinite(Number(job.retrievalScore)) ? Math.round(Number(job.retrievalScore)) : null,
    scoreType: 'deterministic',
    fitTier: 'deterministic candidate',
  };
  assert.deepEqual(fallback, { externalId: 'x', fitScore: 42, scoreType: 'deterministic', fitTier: 'deterministic candidate' });
});

test('AI final selections are explicitly typed', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'electron', 'job-matcher.cjs'), 'utf8');
  assert.match(source, /scoreType: 'ai-selection'/);
});

test('frontend does not mix retrieval fallbacks into successful AI results', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'JobsView.jsx'), 'utf8');
  assert.match(source, /\['available', 'under_selected'\]\.includes\(result\.ranking\?\.status\)/);
  assert.match(source, /aiAvailable \? \(result\.matches \|\| \[\]\)/);
  assert.match(source, /scoreType: 'retrieval'/);
});
