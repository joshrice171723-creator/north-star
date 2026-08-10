const assert = require('node:assert/strict');
const test = require('node:test');
const { createSearchPlan, parsePlannerResponse, fallbackPlan } = require('../electron/job-search-planner.cjs');
const { filterJobs } = require('../electron/job-search.cjs');

test('planner accepts structured AI output and preserves user exclusions', () => {
  const plan = parsePlannerResponse({ ok: true, message: { content: JSON.stringify({ interpretation: 'AI architecture work', jobTypes: ['AI Solutions Architect', 'AI Automation Architect'], searchQueries: ['AI solutions architect', 'AI automation architect'], preferredIndustries: ['technology'], excludedTerms: ['aviation'], locationStrategy: 'near target location' }) } }, { excludedKeywords: ['government'] });
  assert.deepEqual(plan.searchQueries, ['AI solutions architect', 'AI automation architect']);
  assert.deepEqual(plan.excludedTerms, ['government', 'aviation']);
});

test('planner fallback creates related queries instead of using one raw target phrase', () => {
  const plan = fallbackPlan({ targetRoles: ['AI FDW'], targetIndustries: ['technology'], interests: ['automation'] });
  assert.ok(plan.searchQueries.length >= 2);
  assert.ok(plan.excludedTerms.includes('aviation'));
  assert.ok(plan.providerQueries.includes('IT Specialist'));
});

test('provider filter removes excluded aviation listings before ranking', () => {
  const plan = { jobTypes: ['AI Solutions Architect'], excludedTerms: ['aviation', 'aircraft'] };
  const jobs = [
    { title: 'PUBLIC NOTICE - Aviation Safety Inspector', company: 'FAA', description: 'aircraft airworthiness', requirements: [] },
    { title: 'AI Solutions Architect', company: 'Example', description: 'design generative AI platforms', requirements: [] }
  ];
  assert.deepEqual(filterJobs(jobs, plan).map((job) => job.title), ['AI Solutions Architect']);
});

test('provider filter accepts common USAJOBS AI and technical title variants', () => {
  const plan = { jobTypes: ['AI Engineer'], excludedTerms: ['aviation'] };
  const jobs = [
    { title: 'Artificial Intelligence Engineer', description: '', requirements: [] },
    { title: 'IT Specialist (Artificial Intelligence)', description: 'machine learning and software systems', requirements: [] },
    { title: 'Computer Scientist', description: 'develop machine learning models and artificial intelligence systems', requirements: [] },
    { title: 'Accounting Technician', description: 'financial records', requirements: [] }
  ];
  assert.deepEqual(filterJobs(jobs, plan).map((job) => job.title), [
    'Artificial Intelligence Engineer',
    'IT Specialist (Artificial Intelligence)',
    'Computer Scientist'
  ]);
});

test('planner uses AI output when available', async () => {
  const plan = await createSearchPlan({ profile: { targetRoles: ['AI FDW'] }, resume: { rawText: 'cloud architecture and automation' }, openRouter: async () => ({ ok: true, message: { content: JSON.stringify({ interpretation: 'AI architecture', jobTypes: ['AI Architect'], searchQueries: ['AI architect'], excludedTerms: ['aviation'] }) } }) });
  assert.equal(plan.source, 'ai');
  assert.deepEqual(plan.searchQueries, ['AI architect']);
});

test('AI planner preserves provider-compatible queries separately from conceptual queries', () => {
  const plan = parsePlannerResponse({ ok: true, message: { content: JSON.stringify({ interpretation: 'AI engineering', jobTypes: ['AI Engineer'], searchQueries: ['Applied AI Engineer'], providerQueries: ['IT Specialist', 'Computer Scientist', 'Artificial Intelligence'], excludedTerms: [] }) } }, {});
  assert.deepEqual(plan.searchQueries, ['Applied AI Engineer']);
  assert.deepEqual(plan.providerQueries, ['IT Specialist', 'Computer Scientist', 'Artificial Intelligence']);
});