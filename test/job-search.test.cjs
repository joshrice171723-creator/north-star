const assert = require('node:assert/strict');
const test = require('node:test');
const {
  buildUsaJobsParams,
  normalizeUsaJobsItem,
  searchUsaJobs,
  searchJobs,
  calculateRetrievalScore,
  filterJobs,
} = require('../electron/job-search.cjs');
const { fallbackSearchBrief, buildProviderLanes } = require('../electron/job-search-planner.cjs');

function aiSearchPlan(brief, includeAdzuna = false) {
  return {
    ...brief,
    source: 'ai',
    searchBrief: brief,
    providerLanes: buildProviderLanes(brief),
    ...(includeAdzuna ? { adzunaQueries: [{ laneId: 'adzuna-test', type: 'adzuna-query', what: 'AI engineer' }] } : {}),
  };
}

function usaItem(overrides = {}) {
  return {
    MatchedObjectId: '123',
    MatchedObjectDescriptor: {
      PositionID: 'AI-123',
      PositionTitle: 'Computer Scientist',
      PositionURI: 'https://www.usajobs.gov/job/AI-123',
      ApplyURI: ['https://www.usajobs.gov/job/AI-123/apply'],
      OrganizationName: 'Example Agency',
      DepartmentName: 'Example Department',
      SubAgencyName: 'Example Subagency',
      PositionLocationDisplay: 'Dallas, Texas',
      PositionLocation: [{ LocationName: 'Dallas, Texas', CityName: 'Dallas', StateCode: 'TX' }],
      PositionRemuneration: [{ MinimumRange: '100000', MaximumRange: '140000', RateIntervalCode: 'PA' }],
      PositionSchedule: [{ Name: 'Full-time', Code: '1' }],
      JobCategory: [{ Name: 'Computer Science', Code: '1550' }],
      JobGrade: [{ Code: 'GS-13' }],
      LowGrade: '13',
      HighGrade: '14',
      PublicationStartDate: '2026-08-01',
      ApplicationCloseDate: '2026-08-31',
      QualificationSummary: 'Experience with machine learning and Python.',
      PositionFormattedDescription: [{ Label: 'Major Duties', Content: 'Build machine learning systems.' }],
      UserArea: { Details: { JobSummary: 'Build machine learning systems.', MajorDuties: 'Build AI systems.', Education: 'Degree or equivalent.', Requirements: 'Public trust.', Benefits: 'Benefits.' } },
      ...overrides,
    },
  };
}

test('title-first lane uses PositionTitle and does not send broad Keyword', () => {
  const params = buildUsaJobsParams({ laneId: 'title-1', type: 'position-title', positionTitle: 'Computer Scientist', filters: {} }, { locationName: 'Dallas, TX', radiusMiles: 50 }, 1);
  assert.equal(params.get('PositionTitle'), 'Computer Scientist');
  assert.equal(params.get('Keyword'), null);
  assert.equal(params.get('LocationName'), 'Dallas, TX');
  assert.equal(params.get('Radius'), '50');
  assert.equal(params.get('Fields'), 'Full');
});

test('keyword support lane is bounded and carries title context when supplied', () => {
  const params = buildUsaJobsParams({ laneId: 'keyword-1', type: 'keyword-support', keyword: 'machine learning', positionTitle: 'Computer Scientist', filters: {} }, { locationName: '', radiusMiles: null }, 1);
  assert.equal(params.get('Keyword'), 'machine learning');
  assert.equal(params.get('PositionTitle'), 'Computer Scientist');
  assert.equal(params.get('LocationName'), null);
});

test('fallback brief expands rough AI intent into federal job families and lanes', () => {
  const brief = fallbackSearchBrief({ targetRoles: ['AI FDW'], interests: ['automation'], targetLocations: ['Dallas, TX'] }, { rawText: '' });
  assert.ok(brief.jobFamilies.some((value) => /computer scientist|it specialist|data scientist/i.test(value)));
  const lanes = buildProviderLanes(brief);
  assert.ok(lanes.some((lane) => lane.type === 'position-title'));
  assert.ok(lanes.some((lane) => lane.type === 'keyword-support'));
});

test('USAJOBS item normalization exposes matching evidence fields', () => {
  const job = normalizeUsaJobsItem(usaItem(), { laneId: 'title-1', type: 'position-title', positionTitle: 'Computer Scientist', locationScope: 'Dallas, TX' });
  assert.equal(job.externalId, 'AI-123');
  assert.equal(job.agency, 'Example Agency');
  assert.equal(job.salaryMin, 100000);
  assert.equal(job.salaryInterval, 'yearly');
  assert.equal(job.jobCategoryCodes[0], '1550');
  assert.equal(job.searchEvidence.laneId, 'title-1');
  assert.match(job.duties, /machine learning|AI systems/i);
});

test('normalization never leaks object placeholders into searchable text', () => {
  const job = normalizeUsaJobsItem(usaItem({ UserArea: { Details: { JobSummary: { Content: 'Build machine learning systems.' }, MajorDuties: [{ Content: 'Deploy AI services.' }], Requirements: [{ Label: 'Requirement', Content: 'Python.' }] } } }), { laneId: 'title-1', type: 'position-title', positionTitle: 'Computer Scientist' });
  assert.doesNotMatch(job.description, /\[object Object\]/);
  assert.doesNotMatch(job.duties, /\[object Object\]/);
  assert.match(job.description, /machine learning/i);
  assert.match(job.duties, /AI services/i);
});

test('searchUsaJobs reports request diagnostics and valid empty results', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    assert.match(String(url), /PositionTitle=Computer\+Scientist/);
    return { ok: true, status: 200, json: async () => ({ SearchResult: { SearchResultItems: [], SearchResultCountAll: 0 } }) };
  };
  try {
    const result = await searchUsaJobs({ credentials: { usajobsEmail: 'test@example.com', usajobsApiKey: 'test-key' }, lane: { laneId: 'title-1', type: 'position-title', positionTitle: 'Computer Scientist', filters: {} }, scope: { locationName: '' }, page: 1 });
    assert.equal(result.error, null);
    assert.equal(result.resultCount, 0);
    assert.equal(result.totalAvailable, 0);
    assert.equal(result.diagnostics.httpStatus, 200);
  } finally { global.fetch = originalFetch; }
});

test('searchUsaJobs distinguishes unauthorized responses without leaking credentials', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: false, status: 401, json: async () => ({}) });
  try {
    const result = await searchUsaJobs({ credentials: { usajobsEmail: 'test@example.com', usajobsApiKey: 'secret-key' }, lane: { laneId: 'title-1', type: 'position-title', positionTitle: 'Computer Scientist', filters: {} }, scope: { locationName: '' }, page: 1 });
    assert.equal(result.error.code, 'unauthorized');
    assert.doesNotMatch(JSON.stringify(result), /secret-key|test@example.com/);
  } finally { global.fetch = originalFetch; }
});

test('searchJobs keeps relevant jobs and exposes lane counts', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ SearchResult: { SearchResultCountAll: '1', SearchResultItems: [usaItem()] } }) });
  try {
    const brief = fallbackSearchBrief({ targetRoles: ['AI engineer'], targetLocations: ['Dallas, TX'] }, {});
    const result = await searchJobs({ profile: { targetRoles: ['AI engineer'], targetLocations: ['Dallas, TX'], remotePreference: 'any' }, credentials: { usajobsEmail: 'test@example.com', usajobsApiKey: 'test-key' }, plan: aiSearchPlan(brief) });
    assert.ok(result.jobs.length >= 1);
    assert.ok(result.diagnostics.attempts.length >= 1);
    assert.equal(result.counts.retrieved, 16);
    assert.equal(result.counts.unique, 1);
    assert.equal(result.counts.filtered, 0);
    assert.equal(result.counts.aiSubmitted, 1);
    assert.equal(result.sourceStats[0].fetched, 16);
    assert.equal(result.sourceStats[0].filtered, 0);
    assert.equal(result.sourceStats[0].aiSubmitted, 1);
  } finally { global.fetch = originalFetch; }
});

test('Adzuna failure does not hide successful USAJOBS results', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => String(url).includes('api.adzuna.com')
    ? { ok: false, status: 400, json: async () => ({ error: 'Invalid location parameter' }) }
    : { ok: true, status: 200, json: async () => ({ SearchResult: { SearchResultCountAll: '1', SearchResultItems: [usaItem()] } }) };
  try {
    const brief = fallbackSearchBrief({ targetRoles: ['AI engineer'], targetLocations: ['Dallas, TX'] }, {});
    const result = await searchJobs({ profile: { targetRoles: ['AI engineer'], targetLocations: ['Dallas, TX'], remotePreference: 'any' }, credentials: { usajobsEmail: 'test@example.com', usajobsApiKey: 'test-key', adzunaAppId: 'app-1', adzunaApiKey: 'key-1' }, plan: aiSearchPlan(brief, true) });
    assert.ok(result.jobs.length >= 1);
    assert.equal(result.error, null);
    assert.match(result.warning, /job-source requests failed/);
    assert.ok(result.sourceStats.some((source) => source.key === 'adzuna' && source.errors > 0));
    assert.doesNotMatch(JSON.stringify(result), /app-1|key-1/);
  } finally { global.fetch = originalFetch; }
});

test('retrieval score favors title and skills and hard exclusions remove aviation', () => {
  const brief = fallbackSearchBrief({ targetRoles: ['AI engineer'], excludedKeywords: ['aviation'] }, {});
  const relevant = normalizeUsaJobsItem(usaItem(), { laneId: 'title-1', type: 'position-title', positionTitle: 'Computer Scientist' });
  const unrelated = { ...relevant, title: 'Aviation Safety Inspector', description: 'aircraft and aviation operations', company: 'FAA' };
  assert.ok(calculateRetrievalScore(relevant, brief) > calculateRetrievalScore(unrelated, brief));
  assert.equal(filterJobs([unrelated], brief).length, 0);
});

test('retrieval uses a 40-point minimum and does not score salary', () => {
  const brief = fallbackSearchBrief({ targetRoles: ['AI engineer'], targetLocations: ['Dallas, TX'] }, {});
  const relevant = normalizeUsaJobsItem(usaItem(), { laneId: 'title-1', type: 'position-title', positionTitle: 'Computer Scientist' });
  const withoutSalary = { ...relevant, salaryMin: null, salaryMax: null };
  assert.equal(calculateRetrievalScore(withoutSalary, brief), calculateRetrievalScore(relevant, brief));
  assert.ok(calculateRetrievalScore(withoutSalary, brief) >= 40);
  const weak = { ...relevant, title: 'Administrative Assistant', description: '', duties: '', qualifications: '', requirements: [] };
  assert.ok(calculateRetrievalScore(weak, brief) < 40);
  assert.deepEqual(filterJobs([withoutSalary, weak], brief), [withoutSalary]);
});


test('provider failure remains distinct from an empty successful search', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
  try {
    const brief = fallbackSearchBrief({ targetRoles: ['AI engineer'] }, {});
    const result = await searchJobs({ profile: { targetRoles: ['AI engineer'], targetLocations: [] }, credentials: { usajobsEmail: 'test@example.com', usajobsApiKey: 'test-key' }, plan: aiSearchPlan(brief) });
    assert.ok(result.error);
    assert.equal(result.error.code, 'provider_error');
    assert.equal(result.counts.retrieved, 0);
  } finally { global.fetch = originalFetch; }
});


test('network failure is retryable and safe', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => { throw new Error('network down'); };
  try {
    const result = await searchUsaJobs({ credentials: { usajobsEmail: 'test@example.com', usajobsApiKey: 'test-key' }, lane: { laneId: 'title-1', type: 'position-title', positionTitle: 'Computer Scientist', filters: {} }, scope: { locationName: '' }, page: 1 });
    assert.equal(result.error.code, 'network');
    assert.equal(result.error.retryable, true);
  } finally { global.fetch = originalFetch; }
});
