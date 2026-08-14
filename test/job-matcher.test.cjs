const assert = require('node:assert/strict');
const test = require('node:test');
const { rankJobs, MAX_FINAL_CANDIDATES, jobForRanking, selectionIds } = require('../electron/job-matcher.cjs');

const jobs = (count, providerKey = 'usajobs') => Array.from({ length: count }, (_, index) => ({ externalId: `${providerKey}-${index + 1}`, providerKey, title: 'Machine Learning Engineer', description: 'machine learning python', retrievalScore: 90 - index, diagnostics: { secret: 'do not send' } }));
const response = (ids) => ({ ok: true, message: { content: JSON.stringify({ selectedExternalIds: ids }) } });

test('final selector receives at most 80 deterministic candidates and may select any provider mix', async () => {
  const candidates = [...jobs(30, 'usajobs'), ...jobs(30, 'adzuna'), ...jobs(30, 'remotive')]; let prompt;
  const selected = await rankJobs({ jobs: candidates, profile: {}, resume: {}, openRouter: async (messages) => { prompt = JSON.parse(messages[1].content); return response(['adzuna-1', 'adzuna-2', 'adzuna-3']); } });
  assert.equal(prompt.candidates.length, MAX_FINAL_CANDIDATES);
  assert.deepEqual(selected.slice(0, 3).map((entry) => entry.externalId), ['adzuna-1', 'adzuna-2', 'adzuna-3']);
  assert.equal(selected.length, 20);
  assert.equal(selected.filter((entry) => entry.scoreType === 'deterministic-backfill').length, 17);
  assert.equal(selected[0].scoreType, 'ai-selection');
  assert.equal(selected.rankingDiagnostics.returnedCount, 3);
});

test('final selector marks an under-selection when 20 or more candidates were submitted', async () => {
  const selected = await rankJobs({ jobs: jobs(80), profile: {}, resume: {}, openRouter: async () => response(['usajobs-1', 'usajobs-2', 'usajobs-3']) });
  assert.equal(selected.rankingDiagnostics.underSelected, true);
  assert.equal(selected.rankingDiagnostics.returnedCount, 3);
});

test('final selector displays at least five qualified candidates when five were submitted', async () => {
  const selected = await rankJobs({ jobs: jobs(5), profile: {}, resume: {}, openRouter: async () => response(['usajobs-1', 'usajobs-2']) });
  assert.equal(selected.length, 5);
  assert.equal(selected.filter((entry) => entry.scoreType === 'deterministic-backfill').length, 3);
  assert.equal(selected.rankingDiagnostics.returnedCount, 2);
});

test('final selector rejects invented, duplicate, malformed, and over-limit IDs', () => {
  const candidates = jobs(21);
  assert.throws(() => selectionIds('{', candidates), { code: 'selection_invalid_json' });
  assert.throws(() => selectionIds(JSON.stringify({ selectedExternalIds: ['missing'] }), candidates), { code: 'selection_invented_id' });
  assert.throws(() => selectionIds(JSON.stringify({ selectedExternalIds: ['usajobs-1', 'usajobs-1'] }), candidates), { code: 'selection_duplicate_ids' });
  assert.throws(() => selectionIds(JSON.stringify({ selectedExternalIds: candidates.map((job) => job.externalId) }), candidates), { code: 'selection_over_limit' });
});

test('final selector failure preserves structured diagnostics for deterministic fallback', async () => {
  await assert.rejects(() => rankJobs({ jobs: jobs(2), profile: {}, resume: {}, openRouter: async () => ({ ok: true, message: { content: '{}' } }) }), (error) => error.code === 'selection_invalid_shape' && error.rankingDiagnostics.submittedCount === 2);
});

test('final selector repairs one malformed response and preserves AI score provenance', async () => {
  let calls = 0;
  const selected = await rankJobs({ jobs: jobs(2), profile: {}, resume: {}, openRouter: async () => {
    calls += 1;
    return calls === 1
      ? { ok: true, message: { content: '{' } }
      : { ok: true, message: { content: JSON.stringify({ selections: [{ externalId: 'usajobs-1', fitScore: 83, fitTier: 'strong match', strengths: ['Python'], gaps: [], unknowns: [], reasoning: 'Evidence-based.' }] }) } };
  } });
  assert.equal(calls, 2);
  assert.equal(selected[0].scoreType, 'ai-selection');
  assert.equal(selected[0].fitScore, 83);
  assert.equal(selected.rankingDiagnostics.repairAttempted, true);
  assert.equal(selected.rankingDiagnostics.totalCalls, 2);
});

test('AI projection is bounded and excludes provider diagnostics', () => {
  const projected = jobForRanking(jobs(1)[0]);
  assert.equal('diagnostics' in projected, false);
  assert.equal(projected.deterministicScore, 90);
});

test('final selector consumes scored assessments and keeps provider representation', async () => {
  const candidates = [...jobs(5, 'usajobs'), ...jobs(5, 'adzuna'), ...jobs(5, 'remotive'), ...jobs(5, 'arbeitnow')];
  let prompt;
  const selected = await rankJobs({ jobs: candidates, profile: {}, resume: {}, openRouter: async (messages) => {
    prompt = JSON.parse(messages[1].content);
    return { ok: true, message: { content: JSON.stringify({ selections: [
      { externalId: 'adzuna-1', fitScore: 88, fitTier: 'strong match', strengths: ['Python'], gaps: ['Salary unknown'], unknowns: [], reasoning: 'Strong evidence.' },
    ] }) } };
  } });
  assert.match(prompt.candidates[0].externalId, /usajobs/);
  assert.deepEqual(selected[0].fitScore, 88);
  assert.equal(selected[0].scoreType, 'ai-selection');
  assert.deepEqual(selected[0].strengths, ['Python']);
  assert.ok(selected.filter((entry) => entry.job.providerKey === 'usajobs').length >= 3);
  assert.ok(selected.filter((entry) => entry.job.providerKey === 'adzuna').length >= 3);
  assert.equal(selected.rankingDiagnostics.finalSelectedCount, 20);
});
