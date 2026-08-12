const assert = require('node:assert/strict');
const test = require('node:test');
const { rankJobs, RANKING_BATCH_SIZE, jobForRanking, MAX_RANKING_PROMPT_CHARS } = require('../electron/job-matcher.cjs');

function job(index, providerKey) {
  return { externalId: `${providerKey}-${index}`, providerKey, title: `AI Engineer ${index}`, description: 'Build machine learning systems.' };
}

test('rankJobs assesses candidates in parallel batches and selects top five per provider locally', async () => {
  const jobs = [
    ...Array.from({ length: 50 }, (_, index) => job(index, 'adzuna')),
    ...Array.from({ length: 25 }, (_, index) => job(index, 'usajobs')),
  ];
  const batches = [];
  const result = await rankJobs({
    jobs,
    profile: { targetRoles: ['AI engineer'] },
    resume: {},
    openRouter: async (messages) => {
      const payload = JSON.parse(messages[1].content);
      batches.push(payload.jobs);
      return {
        ok: true,
        message: {
          content: JSON.stringify(payload.jobs.map((entry, index) => ({
            externalId: entry.externalId,
            fitScore: index + 1,
            fitTier: 'reasonable-fit',
          }))),
        },
      };
    },
  });

  assert.equal(RANKING_BATCH_SIZE, 6);
  assert.equal(batches.length, Math.ceil(75 / RANKING_BATCH_SIZE));
  assert.ok(batches.every((batch) => batch.length <= RANKING_BATCH_SIZE));
  assert.equal(batches.flat().length, 75);
  assert.equal(result.length, 10);
  assert.equal(result.filter((entry) => entry.job.providerKey === 'adzuna').length, 5);
  assert.equal(result.filter((entry) => entry.job.providerKey === 'usajobs').length, 5);
  assert.ok(result.every((entry) => entry.scoreType === 'ai'));
  assert.deepEqual(result.rankingDiagnostics, {
    submittedCount: 75,
    candidateCount: 75,
    batchCount: 13,
    totalCalls: 13,
    assessedCount: 75,
    returnedCount: 10,
    selectionCallCount: 0,
    providerCounts: {
      adzuna: { submitted: 50, assessed: 50, returned: 5 },
      usajobs: { submitted: 25, assessed: 25, returned: 5 },
        remotive: { submitted: 0, assessed: 0, returned: 0 },
        arbeitnow: { submitted: 0, assessed: 0, returned: 0 },
    },
  });
});

test('rankJobs emits call lifecycle diagnostics with job and request metrics', async () => {
  const events = [];
  const result = await rankJobs({
    jobs: [job(1, 'adzuna'), job(2, 'adzuna')],
    profile: {},
    resume: {},
    onBatch: (event) => events.push(event),
    openRouter: async (messages) => ({
      ok: true,
      message: { content: JSON.stringify(JSON.parse(messages[1].content).jobs.map((entry) => ({ externalId: entry.externalId, fitScore: 50 }))) },
    }),
  });
  assert.deepEqual(events.map((event) => event.status), ['started', 'success']);
  assert.equal(events[0].callNumber, 1);
  assert.equal(events[0].totalCalls, 1);
  assert.equal(events[0].submittedCount, 2);
  assert.ok(events[0].promptCharacters > 0);
  assert.ok(events[0].maxTokens > 0);
  assert.equal(events[1].assessedCount, 2);
  assert.ok(events[1].durationMs >= 0);
  assert.equal(result.rankingDiagnostics.totalCalls, 1);
});

test('rankJobs rejects an incomplete batch so retrieval fallback can be used', async () => {
  const jobs = Array.from({ length: RANKING_BATCH_SIZE + 1 }, (_, index) => job(index, 'adzuna'));
  await assert.rejects(
    () => rankJobs({
      jobs,
      profile: {},
      resume: {},
      openRouter: async (messages) => {
        const payload = JSON.parse(messages[1].content);
        return { ok: true, message: { content: JSON.stringify(payload.jobs.slice(0, -1).map((entry) => ({ externalId: entry.externalId, fitScore: 50 }))) } };
      },
    }),
    /did not assess every retrieved job/,
  );
});

test('rankJobs splits an 18-job search into bounded OpenRouter calls', async () => {
  const jobs = [
    ...Array.from({ length: 10 }, (_, index) => job(index, 'adzuna')),
    ...Array.from({ length: 5 }, (_, index) => job(index, 'remotive')),
    ...Array.from({ length: 2 }, (_, index) => job(index, 'arbeitnow')),
    job(0, 'usajobs'),
  ];
  const batches = [];
  const result = await rankJobs({
    jobs,
    profile: {},
    resume: {},
    openRouter: async (messages) => {
      const payload = JSON.parse(messages[1].content);
      batches.push(payload.jobs);
      return { ok: true, message: { content: JSON.stringify(payload.jobs.map((entry) => ({ externalId: entry.externalId, fitScore: 50 }))) } };
    },
  });

  assert.equal(batches.length, Math.ceil(jobs.length / RANKING_BATCH_SIZE));
  assert.ok(batches.every((batch) => batch.length <= RANKING_BATCH_SIZE));
  assert.equal(batches.flat().length, jobs.length);
  assert.equal(result.rankingDiagnostics.submittedCount, 18);
  assert.equal(result.rankingDiagnostics.totalCalls, 3);
  assert.equal(result.rankingDiagnostics.assessedCount, 18);
  assert.deepEqual(result.rankingDiagnostics.providerCounts, {
    usajobs: { submitted: 1, assessed: 1, returned: 1 },
    adzuna: { submitted: 10, assessed: 10, returned: 5 },
    remotive: { submitted: 5, assessed: 5, returned: 5 },
    arbeitnow: { submitted: 2, assessed: 2, returned: 2 },
  });
});

test('rankJobs selects the highest AI score without a second AI call', async () => {
  const jobs = [job(1, 'adzuna'), job(2, 'adzuna')];
  let assessmentCalls = 0;
  let callCount = 0;
  const result = await rankJobs({ jobs, profile: {}, resume: {}, openRouter: async (messages) => {
    callCount += 1;
    const payload = JSON.parse(messages[1].content);
    assessmentCalls += payload.jobs.length;
    return { ok: true, message: { content: JSON.stringify(payload.jobs.map((entry, index) => ({ externalId: entry.externalId, fitScore: index === 1 ? 80 : 1, fitTier: index === 1 ? 'strong-fit' : 'low-fit' }))) } };
  } });
  assert.equal(assessmentCalls, 2);
  assert.equal(callCount, 1);
  assert.deepEqual(result.map((entry) => entry.job.externalId), ['adzuna-2', 'adzuna-1']);
});

test('AI job projection excludes provider catalogs and keeps the payload bounded', async () => {
  const fullJob = {
    ...job(1, 'usajobs'),
    company: 'Example Agency',
    location: 'Dallas, Texas',
    description: 'Build machine learning systems.'.repeat(500),
    requirements: ['Python', 'Machine learning'],
    locations: Array.from({ length: 20_000 }, (_, index) => ({
      LocationName: `Synthetic City ${index}, United States`,
      Longitude: index,
      Latitude: index,
    })),
    rawData: { enormous: 'provider response should never be sent' },
    diagnostics: { responseBody: 'do not send this' },
  };
  const projected = jobForRanking(fullJob);
  assert.equal(projected.externalId, fullJob.externalId);
  assert.equal(projected.location, fullJob.location);
  assert.ok(projected.description.length <= 1800);
  assert.equal('locations' in projected, false);
  assert.equal('rawData' in projected, false);
  assert.equal('diagnostics' in projected, false);

  let rankingPayload;
  await rankJobs({
    jobs: [fullJob],
    profile: { targetRoles: ['AI engineer'] },
    resume: { rawText: 'Experienced engineer.' },
    openRouter: async (messages) => {
      const payload = JSON.parse(messages[1].content);
      if (payload.assessments) {
        return { ok: true, message: { content: JSON.stringify({ selections: { usajobs: [fullJob.externalId], adzuna: [], remotive: [], arbeitnow: [] } }) } };
      }
      rankingPayload = payload;
      return { ok: true, message: { content: JSON.stringify([{ externalId: fullJob.externalId, fitScore: 80, fitTier: 'strong-fit' }]) } };
    },
  });

  assert.ok(JSON.stringify(rankingPayload).length < MAX_RANKING_PROMPT_CHARS);
  assert.equal('locations' in rankingPayload.jobs[0], false);
  assert.equal('rawData' in rankingPayload.jobs[0], false);
  assert.equal('diagnostics' in rankingPayload.jobs[0], false);
});
