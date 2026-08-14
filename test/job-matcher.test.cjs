const assert = require('node:assert/strict');
const test = require('node:test');
const { rankJobs, MAX_FINAL_CANDIDATES, MAX_ASSESSMENT_BATCH_SIZE, jobForRanking, selectionIds } = require('../electron/job-matcher.cjs');

const jobs = (count, providerKey = 'usajobs') => Array.from({ length: count }, (_, index) => ({ externalId: `${providerKey}-${index + 1}`, providerKey, title: 'Machine Learning Engineer', description: 'machine learning python', retrievalScore: 90 - index, diagnostics: { secret: 'do not send' } }));
const response = (ids, fitScore = 80) => ({ ok: true, message: { content: JSON.stringify({ selections: ids.map((externalId) => ({ externalId, fitScore, fitTier: 'good match', strengths: ['Relevant experience'], gaps: [], unknowns: [], reasoning: 'Evidence-based fit.' })) }) } });
const responseForSubmittedIds = (messages, ids, fitScore = 80) => {
  const payload = JSON.parse(messages[1].content);
  const submitted = new Set((payload.candidates || []).map((job) => job.externalId));
  return response(ids.filter((id) => submitted.has(id)), fitScore);
};

test('final selector receives at most 80 deterministic candidates and may select any provider mix', async () => {
  const candidates = [...jobs(30, 'usajobs'), ...jobs(30, 'adzuna'), ...jobs(30, 'remotive')]; const prompts = [];
  const selected = await rankJobs({ jobs: candidates, profile: {}, resume: {}, openRouter: async (messages) => { prompts.push(JSON.parse(messages[1].content)); return responseForSubmittedIds(messages, ['adzuna-1', 'adzuna-2', 'adzuna-3']); } });
  assert.equal(prompts.flatMap((prompt) => prompt.candidates).length, MAX_FINAL_CANDIDATES);
  assert.ok(prompts.every((prompt) => prompt.candidates.length <= MAX_ASSESSMENT_BATCH_SIZE));
  assert.deepEqual(selected.slice(0, 3).map((entry) => entry.externalId), ['adzuna-1', 'adzuna-2', 'adzuna-3']);
  assert.equal(selected.length, 3);
  assert.equal(selected.filter((entry) => entry.scoreType === 'deterministic-backfill').length, 0);
  assert.equal(selected[0].scoreType, 'ai-selection');
  assert.equal(selected.rankingDiagnostics.returnedCount, 3);
});

test('final selector allows an under-selection when fewer than 80 strong matches exist', async () => {
  const selected = await rankJobs({ jobs: jobs(80), profile: {}, resume: {}, openRouter: async (messages) => responseForSubmittedIds(messages, ['usajobs-1', 'usajobs-2', 'usajobs-3']) });
  assert.equal(selected.rankingDiagnostics.underSelected, false);
  assert.equal(selected.rankingDiagnostics.returnedCount, 3);
});

test('final selector displays only the high-quality IDs returned by AI', async () => {
  const selected = await rankJobs({ jobs: jobs(5), profile: {}, resume: {}, openRouter: async () => response(['usajobs-1', 'usajobs-2']) });
  assert.equal(selected.length, 2);
  assert.equal(selected.filter((entry) => entry.scoreType === 'deterministic-backfill').length, 0);
  assert.equal(selected.rankingDiagnostics.returnedCount, 2);
});

test('final selector rejects invented, duplicate, malformed, and over-limit IDs', () => {
  const candidates = jobs(81);
  assert.throws(() => selectionIds('{', candidates), { code: 'selection_invalid_json' });
  assert.throws(() => selectionIds(JSON.stringify({ selectedExternalIds: ['missing'] }), candidates), { code: 'selection_invented_id' });
  assert.throws(() => selectionIds(JSON.stringify({ selectedExternalIds: ['usajobs-1', 'usajobs-1'] }), candidates), { code: 'selection_duplicate_ids' });
  assert.throws(() => selectionIds(JSON.stringify({ selectedExternalIds: candidates.map((job) => job.externalId) }), candidates), { code: 'selection_over_limit' });
});

test('final selector failure preserves structured diagnostics for deterministic fallback', async () => {
  await assert.rejects(() => rankJobs({ jobs: jobs(2), profile: {}, resume: {}, openRouter: async () => ({ ok: true, message: { content: '{}' } }) }), (error) => error.code === 'selection_invalid_shape' && error.rankingDiagnostics.submittedCount === 2 && error.rankingDiagnostics.assessedCount === 0 && error.rankingDiagnostics.providerCounts.usajobs.assessed === 0);
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
  assert.equal(selected.rankingDiagnostics.totalCalls, 1);
  assert.equal(selected.rankingDiagnostics.selectionCallCount, 2);
});

test('AI projection is bounded and excludes provider diagnostics', () => {
  const projected = jobForRanking(jobs(1)[0]);
  assert.equal('diagnostics' in projected, false);
  assert.equal(projected.deterministicScore, 90);
});

test('final selector consumes scored assessments and keeps provider representation', async () => {
  const candidates = [...jobs(5, 'usajobs'), ...jobs(5, 'adzuna'), ...jobs(5, 'remotive'), ...jobs(5, 'arbeitnow')];
  const prompts = [];
  const selected = await rankJobs({ jobs: candidates, profile: {}, resume: {}, openRouter: async (messages) => {
    const prompt = JSON.parse(messages[1].content); prompts.push(prompt);
    return { ok: true, message: { content: JSON.stringify({ selections: prompt.candidates.some((candidate) => candidate.externalId === 'adzuna-1') ? [
      { externalId: 'adzuna-1', fitScore: 88, fitTier: 'strong match', strengths: ['Python'], gaps: ['Salary unknown'], unknowns: [], reasoning: 'Strong evidence.' },
    ] : [] }) } };
  } });
  assert.match(prompts[0].candidates[0].externalId, /usajobs/);
  assert.deepEqual(selected[0].fitScore, 88);
  assert.equal(selected[0].scoreType, 'ai-selection');
  assert.deepEqual(selected[0].strengths, ['Python']);
  assert.equal(selected.filter((entry) => entry.job.providerKey === 'usajobs').length, 0);
  assert.equal(selected.filter((entry) => entry.job.providerKey === 'adzuna').length, 1);
  assert.equal(selected.rankingDiagnostics.finalSelectedCount, 1);
});

test('final selector accounts for Dice and preserves zero-selection diagnostics', async () => {
  const candidates = [...jobs(2, 'dice'), ...jobs(1, 'remotive')];
  const selected = await rankJobs({ jobs: candidates, profile: {}, resume: {}, openRouter: async () => response([]) });
  assert.equal(selected.length, 0);
  assert.equal(selected.rankingDiagnostics.providerCounts.dice.submitted, 2);
  assert.equal(selected.rankingDiagnostics.returnedCount, 0);
});

test('final selector batches detailed assessments with a complete per-batch token budget', async () => {
  const calls = [];
  const selected = await rankJobs({ jobs: jobs(50), profile: {}, resume: {}, openRouter: async (messages, options) => {
    const payload = JSON.parse(messages[1].content);
    calls.push({ count: payload.candidates.length, maxTokens: options.max_tokens });
    return response(payload.candidates.map((job) => job.externalId));
  } });
  assert.equal(calls.length, Math.ceil(50 / MAX_ASSESSMENT_BATCH_SIZE));
  assert.ok(calls.every((call) => call.count <= MAX_ASSESSMENT_BATCH_SIZE));
  assert.ok(calls.every((call) => call.maxTokens >= 1800 && call.maxTokens >= call.count * 300));
  assert.equal(selected.length, 50);
  assert.equal(selected.rankingDiagnostics.assessedCount, 50);
});
