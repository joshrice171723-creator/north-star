# USAJOBS AI Search Strategy and Results Experience

> **Document status:** reference/historical design · **Scope:** USAJOBS retrieval strategy · **Loading:** read selectively; current implementation and `HERMES_HANDOFF_AI_JOB_SEARCH.md` take precedence.

> **For Hermes/Codex/Cline:** Execute this plan task-by-task. Do not change unrelated Academy, learning, roadmap, executive-coach, or three-pane shell behavior.

**Goal:** Replace the current fragile “keyword search plus local filtering” behavior with a deliberate search pipeline that understands the user's target, uses the USAJOBS API correctly, retrieves a useful candidate pool, ranks it against the user's evidence, and clearly explains why each result was shown.

**Target project:** `C:\Users\joshr\OneDrive\Desktop\hermes\anthropic-certification-native`

**Architecture:** Electron main process owns USAJOBS requests, credential storage, planning calls, ranking calls, normalization, and persistence. React owns the search form, progress states, results, and explanations. The search planner converts user intent into structured search lanes. USAJOBS performs retrieval. A deterministic filter removes obvious mismatches. AI and deterministic scoring rank the retrieved pool. The app never submits applications automatically.

**Tech stack:** Electron, React, Vite, CommonJS, SQLite/Drizzle, Node test runner, OpenRouter, USAJOBS REST API.

---

## 1. Product Decision: How Searches Should Work

The current implementation sends broad terms through `Keyword`, then tries to repair relevance afterward. That is the main design problem.

USAJOBS documents two different search behaviors:

- `Keyword` searches all words or synonyms throughout the announcement. This can match boilerplate, qualifications, duties, and unrelated text.
- `PositionTitle` searches the job title using a contains-style match. This is the better primary field for role discovery.

The new strategy is:

```text
User intent + profile + resume
  -> structured search brief
  -> job-family and title expansion
  -> USAJOBS title-first query lanes
  -> optional skill/mission keyword lanes
  -> location and eligibility filters
  -> retrieve a bounded candidate pool
  -> normalize and deduplicate
  -> deterministic relevance gate
  -> evidence-based AI/deterministic ranking
  -> explainable result cards and search report
```

### Core rule

Do not send the raw user phrase as the only provider query. Do not use broad `Keyword` searches as the primary discovery mechanism for technical roles. Use `PositionTitle` for title intent and reserve `Keyword` for a small number of supporting searches when title-only retrieval is too narrow.

### USAJOBS limitation to explain to the user

USAJOBS is a federal-government job source. It cannot reliably find private-sector roles. The UI must label results as federal jobs and explain that a private-sector provider would be needed for broader market coverage. Do not pretend USAJOBS represents the whole job market.

---

## 2. Project Context and Current Code

### Confirmed paths

- Electron entry: `electron/main.cjs`
- Preload: `electron/preload.cjs`
- Renderer job view: `src/JobsView.jsx`
- Provider module: `electron/job-search.cjs`
- Planner module: `electron/job-search-planner.cjs`
- Matcher module: `electron/job-matcher.cjs`
- Database: `electron/database.cjs`
- Migrations: `electron/migrations/`
- Existing job-search tests: `test/job-search-planner.test.cjs`
- Build: `npm run build`
- Desktop production run: `npm run desktop:prod`
- Tests currently run with: `node --test test/*.test.cjs`

### Current behavior that must be replaced or preserved

`electron/job-search.cjs` currently:

- sends `Keyword` queries;
- uses `ResultsPerPage`, `WhoMayApply`, and sometimes `LocationName`;
- tries city/state, state, and sometimes nationwide locations;
- normalizes `SearchResult.SearchResultItems`;
- deduplicates and locally filters jobs;
- calls the planner and matcher through the main process.

Preserve:

- local-first Electron architecture;
- encrypted main-process credential storage;
- existing manual job-pipeline save/reload behavior;
- no automatic applications;
- no LinkedIn, Indeed, Glassdoor, or other scraping;
- no destructive database migration unless required by verified evidence.

### Existing working-tree warning

The job-search work is already uncommitted. Review `git diff` first. Do not reset or overwrite unrelated changes.

---

## 3. Information the User Must Provide

The search form should collect enough information to make the search useful without forcing the user to write exact job titles.

### Required minimum

The user must provide at least one of:

- a rough target or outcome, such as `AI FDW`, `build AI systems`, or `move into cloud security`;
- one target job family or role;
- one target location;
- one meaningful interest or skill area.

The resume is strongly recommended. Without it, the app can discover jobs but cannot make a reliable fit assessment.

### Recommended search brief fields

Store these in the existing profile model where possible. Add fields only when the current schema cannot represent them.

| Field | Example | Why it matters |
|---|---|---|
| Target intent | `AI FDW` | Gives the planner the user's real goal, not just a title |
| Target job families | `AI engineering`, `cloud architecture` | Produces title families |
| Seniority | `entry`, `mid`, `senior`, `lead`, `director` | Prevents poor-level matches |
| Locations | `Dallas, TX`; `Texas` | Controls city/state searches |
| Search radius | `25`, `50`, `100` miles | Uses USAJOBS `Radius` when appropriate |
| Remote preference | `any`, `remote`, `hybrid`, `onsite` | Uses `RemoteIndicator` where supported |
| Minimum salary | `$120,000` | Uses salary filter cautiously |
| Work authorization | `US citizen`, `authorized to work` | Helps explain eligibility, but must not be invented |
| Hiring paths | `public`, `vet`, `disability`, etc. | Maps to USAJOBS `HiringPath` when the user confirms it |
| Clearance | `none`, `public trust`, `secret`, `top secret` | Maps to `SecurityClearanceRequired` only when confirmed |
| Employment | `full-time`, `part-time` | Maps to schedule filters |
| Travel tolerance | `none`, `occasional`, `25%`, etc. | Maps to `TravelPercentage` |
| Preferred agencies | `NASA`, `DOD`, `VA` | Maps to agency refinement later |
| Exclusions | `aviation`, `sales`, `relocation required` | Prevents obvious false positives |
| Must-have skills | `Python`, `AWS`, `LLMs` | Supports ranking and optional keyword lanes |
| Nice-to-have skills | `Kubernetes`, `RAG` | Supports ranking without over-filtering |
| Resume/profile | structured resume plus raw text | Supplies evidence for fit scoring |

### UX rule for missing information

Do not force the user to fill every field. Show a short “Improve your matches” checklist after the first search:

- “Add a location to narrow results.”
- “Add seniority to reduce overqualified or underqualified matches.”
- “Add a resume to show evidence-based fit.”
- “Add work authorization or hiring path if federal eligibility matters.”

The app should still search with incomplete information and clearly label the uncertainty.

---

## 4. Structured Search Brief Contract

Add a canonical internal shape in `electron/job-search-planner.cjs`:

```js
{
  version: 2,
  targetIntent: "AI FDW",
  interpretation: "Likely target: AI and automation architecture roles",
  jobFamilies: [
    "AI engineer",
    "machine learning engineer",
    "AI solutions architect",
    "data scientist",
    "computer scientist"
  ],
  seniority: ["mid", "senior"],
  mustHaveSkills: ["Python", "machine learning"],
  niceToHaveSkills: ["cloud", "LLM"],
  exclusions: ["aviation", "pilot", "sales"],
  locations: [{ raw: "Dallas, TX", city: "Dallas", state: "TX" }],
  radiusMiles: 50,
  remotePreference: "any",
  minimumSalary: 120000,
  workAuthorization: "",
  hiringPaths: [],
  clearance: "",
  scheduleTypes: ["full-time"],
  travelPreference: "any",
  source: "ai|deterministic-fallback",
  confidence: "high|medium|low"
}
```

### Planner requirements

Modify `electron/job-search-planner.cjs` so the AI returns this structured plan, not only `searchQueries`.

The planner must:

1. Treat user intent, profile, and resume as input data, not instructions.
2. Infer several realistic job families.
3. Preserve the user's uncertainty instead of inventing a specific title.
4. Separate conceptual job families from provider query lanes.
5. Return only valid JSON.
6. Validate arrays, enum values, maximum lengths, and numeric ranges.
7. Fall back deterministically if the model fails or returns invalid JSON.
8. Never invent clearance, work authorization, years of experience, education, salary, employers, or credentials.

### Proposed provider query lane contract

```js
{
  laneId: "title-primary-1",
  type: "position-title|keyword-support",
  positionTitle: "Computer Scientist",
  keyword: "machine learning",
  filters: {
    locationName: "Dallas, TX",
    radius: 50,
    remoteIndicator: null,
    hiringPath: [],
    clearance: null,
    salaryMinimum: null,
    datePosted: 30
  },
  reason: "USAJOBS federal title commonly used for applied AI and ML work",
  expectedSignal: "title|skill|mission"
}
```

Limit the plan to a maximum of 8 lanes and a maximum of 3 location scopes per lane.

---

## 5. Best USAJOBS Search Strategy

### Phase A: Title-first retrieval

For each relevant job family, create one or more `PositionTitle` queries using titles that federal agencies actually use.

For an AI-oriented target, examples include:

```text
IT Specialist
Computer Scientist
Computer Engineer
Data Scientist
Information Technology Specialist
Operations Research Analyst
Program Analyst
Mathematical Statistician
```

Do not use `Artificial Intelligence` or `Machine Learning` alone as the main title query unless the planner has evidence that those phrases are actual titles for the target. They are often better as supporting keywords.

### Phase B: Supporting keyword retrieval

Use a small number of `Keyword` lanes for domain evidence, such as:

```text
machine learning
artificial intelligence
generative AI
natural language processing
cloud architecture
```

Each keyword lane must be paired with a title or category filter where possible. Avoid a broad keyword-only search because USAJOBS searches the entire announcement and may match unrelated boilerplate.

### Phase C: Location scopes

For each lane, use this order:

1. exact city/state;
2. city/state with radius when the user allows nearby work;
3. state-only;
4. nationwide only when the user selected remote, nationwide, or no location.

Do not silently run nationwide searches for a user who entered a location and did not permit broader results. Label broader fallback results in the UI.

### Phase D: Apply provider filters only when confirmed

Map confirmed user preferences to USAJOBS parameters:

- `PositionTitle` for title-first searches;
- `Keyword` for supporting domain terms;
- `LocationName` for city/state;
- `Radius` with `LocationName` when supported by the user's radius;
- `RemoteIndicator=True` only for remote-only preference;
- `RemoteIndicator=False` only when the user explicitly excludes remote jobs;
- `RemunerationMinimumAmount` for salary, with a note that USAJOBS uses salary buckets;
- `HiringPath` only for confirmed paths;
- `SecurityClearanceRequired` only for confirmed clearance requirements;
- `PositionScheduleTypeCode` for confirmed schedule;
- `TravelPercentage` for confirmed travel limits;
- `DatePosted` when the user chooses freshness;
- `Fields=Full` for the final retrieval needed by ranking, otherwise use the minimum response during discovery;
- `ResultsPerPage` capped at 50 per lane and `Page` capped by the total request budget.

Do not set `WhoMayApply=All` by default unless the credential/account is authorized for it. Prefer the user's confirmed hiring path or a documented supported default.

### Phase E: Retrieval budget

Default budget:

- maximum 8 query lanes;
- maximum 3 location scopes per lane;
- maximum 24 HTTP requests per user search;
- maximum 50 results per request;
- maximum 200 unique normalized jobs before local ranking;
- stop early when at least 80 strong candidate records have been collected across lanes;
- no automatic retries for the same request except one bounded retry for transient network/5xx errors.

Return the lane and scope that produced each job so the UI can explain the result.

---

## 6. Normalized Job Data Required for Useful Matching

Modify `electron/job-search.cjs` normalization so each job includes, when available:

```js
{
  providerKey: "usajobs",
  externalId: "...",
  title: "...",
  company: "...",
  agency: "...",
  subAgency: "...",
  canonicalUrl: "...",
  applicationUrl: "...",
  locations: [],
  location: "...",
  remoteType: "remote|onsite|unknown",
  salaryMin: 0,
  salaryMax: 0,
  salaryCurrency: "USD",
  salaryInterval: "yearly|hourly|unknown",
  employmentType: "Full-time",
  scheduleCodes: [],
  hiringPaths: [],
  clearanceRequired: "",
  securityClearance: "",
  jobCategories: [],
  jobCategoryCodes: [],
  payPlan: "",
  lowGrade: "",
  highGrade: "",
  duties: "",
  qualifications: "",
  requirements: [],
  education: "",
  benefits: "",
  travel: "",
  postedAt: "",
  closingAt: "",
  description: "",
  searchEvidence: {
    laneId: "title-primary-1",
    positionTitleQuery: "Computer Scientist",
    keywordQuery: "machine learning",
    locationScope: "Dallas, TX",
    relevanceRank: null
  }
}
```

Do not pass unnecessary raw provider payloads to the renderer. Keep raw data only where the existing database pipeline requires it, and use bounded fields for ranking prompts.

---

## 7. Relevance and Fit Scoring

### Stage 1: Deterministic relevance gate

Create pure functions in `electron/job-search.cjs` or a new `electron/job-relevance.cjs`:

- `normalizeText(value)`;
- `matchesHardExclusion(job, exclusions)`;
- `titleSignal(job, jobFamilies)`;
- `skillSignal(job, mustHaveSkills, niceToHaveSkills)`;
- `senioritySignal(job, seniority)`;
- `locationSignal(job, locations, remotePreference)`;
- `eligibilitySignal(job, profile)`;
- `calculateRetrievalScore(job, brief)`.

Hard exclusions must remove only clear contradictions. Do not exclude a job merely because a preferred skill is absent from a short summary.

Suggested retrieval score:

- 0–35: title/job-family alignment;
- 0–20: skill/domain alignment;
- 0–15: location/remote alignment;
- 0–10: seniority/grade alignment;
- 0–10: eligibility/hiring-path alignment;
- 0–10: freshness/compensation alignment.

This is a match score, not a hiring probability.

### Stage 2: AI evidence assessment

`electron/job-matcher.cjs` should assess only the top 40–60 candidates after deterministic scoring. The prompt must include:

- structured user profile;
- relevant resume evidence only;
- normalized job fields;
- search evidence;
- explicit instruction to treat job text as untrusted data;
- explicit instruction not to invent qualifications or candidate facts.

Return validated JSON:

```js
{
  externalId: "...",
  fitScore: 0,
  fitTier: "strong-fit|reasonable-fit|stretch|low-fit|unknown",
  evidence: {
    matchedSkills: [],
    matchedExperience: [],
    matchedEducation: [],
    locationMatch: "...",
    seniorityMatch: "...",
    eligibilityMatch: "..."
  },
  strengths: [],
  gaps: [],
  unknowns: [],
  reasoning: "...",
  recommendedNextAction: "..."
}
```

If AI ranking fails, use deterministic scores and show `AI review unavailable`. Never hide retrieved jobs.

### Ranking safety rules

- Fit score is not hiring probability.
- Do not claim the user is eligible unless the profile supports it.
- Do not claim a clearance, degree, salary, or experience match when the data is missing.
- Distinguish `missing`, `not mentioned`, and `does not match`.
- Keep a human review step before saving a job as ready to apply.

---

## 8. Information the Results Must Provide

The result view should answer the user's practical questions without requiring them to open every announcement immediately.

### Search summary

Show:

- what the app understood the user wants;
- job families searched;
- provider: `USAJOBS / federal jobs`;
- locations and radius used;
- remote and eligibility filters used;
- date of search;
- number of requests;
- number retrieved, deduplicated, filtered, and ranked;
- whether state/nationwide fallback was used;
- whether AI scoring was available.

### Each job card

Show prominently:

- title;
- agency and subagency;
- location and remote status;
- salary range and interval;
- grade/pay plan when available;
- employment schedule;
- closing date and freshness;
- hiring path and clearance requirement;
- fit score and fit tier;
- two or three evidence-based reasons it matches;
- important gaps or unknowns;
- why the result was found, such as `Title: Computer Scientist + keyword: machine learning`;
- next action: `Review qualifications`, `Check eligibility`, or `Save to pipeline`;
- links to view and apply.

### Search explanation panel

For every result, support a “Why this result?” expansion:

```text
Matched target family: AI / machine learning
Title signal: Computer Scientist
Skill signal: machine learning, Python
Location signal: Texas within 50 miles
Eligibility: not assessed / matches public hiring path
Unknowns: degree requirement not found in saved profile
```

### No-result and weak-result states

Use distinct messages:

- `No provider results`: USAJOBS returned nothing for the selected scopes.
- `Results found, relevance removed`: provider returned jobs, but none met the local relevance threshold.
- `Results found, low confidence`: jobs exist, but the user's profile lacks enough information.
- `Provider unavailable`: the API failed; this is not a zero-result search.
- `Federal source limitation`: USAJOBS does not cover private-sector jobs.

Offer user-controlled adjustments:

- broaden location;
- allow remote/nationwide;
- remove a nonessential exclusion;
- lower the salary filter;
- add another job family;
- add resume/profile evidence.

Do not silently loosen filters.

---

## 9. Backend Modules and Contracts

### `electron/job-search-planner.cjs`

Add:

- `createSearchBrief(input)`;
- `parseSearchBriefResponse(response, profile)`;
- `fallbackSearchBrief(profile, resume)`;
- `buildProviderLanes(brief)`.

Return a validated brief and provider lanes.

### `electron/job-search.cjs`

Add or refactor:

- `buildUsaJobsParams(lane, scope, page)`;
- `searchUsaJobs({ credentials, lane, scope, page })`;
- `normalizeUsaJobsItem(item, searchEvidence)`;
- `searchProviderLanes({ brief, lanes, credentials })`;
- `dedupeJobs(jobs)`;
- `filterRelevantJobs(jobs, brief)`;
- `buildSearchDiagnostics(...)`.

Each provider attempt should return:

```js
{
  laneId: "title-primary-1",
  scope: "Dallas, TX",
  page: 1,
  httpStatus: 200,
  resultCount: 25,
  totalAvailable: 142,
  durationMs: 1234,
  jobs: [],
  error: null
}
```

### `electron/main.cjs`

The `jobs:search` IPC handler should return:

```js
{
  ok: true,
  searchBrief: {},
  provider: { key: "usajobs", label: "USAJOBS / federal jobs" },
  jobs: [],
  matches: [],
  counts: {
    requests: 0,
    retrieved: 0,
    unique: 0,
    relevant: 0,
    ranked: 0
  },
  diagnostics: {},
  ranking: { status: "available|fallback|unavailable" },
  warnings: [],
  adjustments: []
}
```

A failure must include a stable code and user-facing message without converting the failure into an empty successful response.

### `electron/preload.cjs`

Expose only the existing search operation unless a separate preview/search-plan operation is required by the UI. Prefer returning the complete safe search report from `searchJobs()` instead of adding many IPC channels.

### `src/JobsView.jsx`

Add or extract pure helpers for:

- search brief display;
- result projection;
- external-ID matching;
- diagnostics formatting;
- “why this result” evidence.

Keep every returned job visible even when AI matches are absent.

---

## 10. Database and Persistence

Prefer the existing `job_opportunities` fields and add only missing normalized fields required for the saved pipeline, such as:

- `agency`;
- `subAgency`;
- `searchEvidenceJson`;
- `hiringPathsJson`;
- `jobCategoriesJson`;
- `clearanceRequired`;
- `salaryInterval`;
- `searchBriefJson`.

Do not add a migration until the implementer confirms the current schema cannot support the result cards and saved-job explanation. Search diagnostics may remain in the IPC response and do not need permanent storage in MVP.

If a migration is required:

- use the next migration number after the actual existing inventory;
- use nullable/default-safe columns;
- preserve all existing records;
- test a temporary database upgrade;
- verify the new columns after migration.

---

## 11. Implementation Order

### Phase 1: Search brief and planner

1. Add the structured search brief contract.
2. Add parser validation and deterministic fallback.
3. Add provider lane generation.
4. Add planner tests for rough intent, missing fields, exclusions, seniority, and location.

**Acceptance:** `AI FDW` produces multiple federal-compatible title lanes, supporting keyword lanes, exclusions, and a confidence level without copying the raw phrase as the only query.

### Phase 2: Title-first USAJOBS provider

1. Add `PositionTitle` support.
2. Add optional `Keyword` support per lane.
3. Add location/radius/remote/date/salary/hiring-path filters only when confirmed.
4. Add pagination and bounded request budget.
5. Normalize the full result fields needed for ranking.
6. Preserve lane/scope evidence.

**Acceptance:** Mocked requests show correct parameters, no accidental keyword-only search for title intent, bounded request count, and correct normalization.

### Phase 3: Relevance and ranking

1. Add deterministic scoring and hard-exclusion tests.
2. Rank only the bounded candidate pool.
3. Add validated AI assessment output.
4. Add deterministic fallback when AI is unavailable.

**Acceptance:** Jobs remain visible with deterministic scores when OpenRouter fails. Unrelated FAA/aviation results do not outrank technical AI results merely because they mention software.

### Phase 4: Results experience

1. Display search brief and search summary.
2. Display complete job cards with salary, location, dates, eligibility, and evidence.
3. Add “Why this result?” details.
4. Add weak-result/no-result adjustment actions.
5. Preserve manual save-to-pipeline behavior.

**Acceptance:** A user can understand what was searched, why a job appeared, what is missing, and what to do next.

### Phase 5: Live verification

1. Rebuild and launch the actual Electron app.
2. Use a real configured USAJOBS connection.
3. Search with a rough intent and incomplete profile.
4. Confirm the app explains missing information rather than failing.
5. Search again with location, resume, and preferences.
6. Confirm title-first lanes and visible results.
7. Confirm provider errors, empty results, and ranking fallback are distinct.
8. Save and reload one result.

Stop when this phase passes. Do not add a second provider or automatic applications.

---

## 12. Tests and Verification

### Unit tests

Create or modify:

- `test/job-search-planner.test.cjs`
- `test/job-search.test.cjs`
- `test/job-matcher.test.cjs`
- a pure renderer helper test only if the current setup supports it.

Cover:

- rough target expansion;
- provider title lanes versus keyword-support lanes;
- missing profile fields;
- seniority and location parsing;
- USAJOBS parameter construction;
- `PositionTitle` use;
- keyword-only lanes restricted and bounded;
- radius and remote behavior;
- salary/hiring-path/clearance filters only when supplied;
- page/request budget;
- normalization of agency, grades, categories, salary interval, duties, qualifications, and closing dates;
- deduplication;
- hard exclusions;
- deterministic relevance score;
- AI match validation;
- ranking fallback;
- visible jobs when matches are empty;
- distinct provider-empty versus filter-empty versus provider-failure states.

### Required commands

```bash
cd /c/Users/joshr/OneDrive/Desktop/hermes/anthropic-certification-native
node --test test/*.test.cjs
npm run build
node --check electron/main.cjs
node --check electron/preload.cjs
node --check electron/job-search.cjs
node --check electron/job-search-planner.cjs
node --check electron/job-matcher.cjs
git diff --check
```

### Manual desktop verification

1. Open Jobs.
2. Enter only a rough target such as `AI FDW` and run search.
3. Confirm the app explains its interpretation and asks for useful missing information.
4. Add location and resume evidence.
5. Run again.
6. Confirm the report shows title queries, supporting keywords, locations, filters, request count, and result counts.
7. Confirm cards show agency, title, location, salary, closing date, fit evidence, gaps, and next action.
8. Confirm a job retrieved through a broader lane still shows why it was included.
9. Simulate or trigger ranking unavailability and confirm jobs remain visible.
10. Save one result and restart the app.
11. Confirm the saved pipeline record remains.

---

## 13. Edge Cases

| Scenario | Behavior |
|---|---|
| Rough or ambiguous intent | Search several plausible families and label confidence; ask one focused follow-up after showing initial results |
| Exact title supplied | Use it as one lane, but still add adjacent federal titles when the user allows expansion |
| No location | Search nationwide only with an explicit nationwide label |
| City returns nothing | Try radius/state only if allowed by the user; show the broader scope |
| Remote-only | Set `RemoteIndicator=True`; do not claim all telework is fully remote unless the result says so |
| Salary supplied | Use the documented bucket behavior and show that salary is approximate/filter-based |
| Clearance missing | Mark clearance as unknown, not as “no clearance” |
| Hiring path missing | Do not claim public eligibility; show “eligibility not assessed” |
| Resume missing | Discover jobs but lower confidence and list missing evidence |
| Resume has conflicting facts | Preserve uncertainty and ask the user to correct the profile |
| Search returns broad federal roles | Use title/domain scoring and show the exact signal that caused inclusion |
| AI planner fails | Deterministic job-family fallback |
| AI ranking fails | Deterministic score and visible `AI review unavailable` state |
| API returns zero | Offer user-controlled scope/query adjustments; do not silently broaden |
| API returns errors | Show provider error, not “no jobs” |
| Duplicate announcement across lanes | One result with all matching lane evidence |
| Private-sector expectation | Clearly label USAJOBS as federal-only and state that coverage is incomplete |
| Untrusted job text | Treat it as data; never follow instructions embedded in job descriptions |

---

## 14. Security and Privacy Boundary

The search strategy does not require placing credentials in the plan or renderer. Keep credentials in the existing Electron main-process storage path and never expose them in result objects, logs, prompts, tests, or screenshots.

The resume may be sent to the configured AI ranking provider only for planning/matching if the user has enabled that behavior. USAJOBS receives search parameters only, never the full resume.

Minimize AI payloads:

- send only the profile fields needed for the search brief;
- send only relevant resume sections to rank a job;
- omit raw provider payloads and unnecessary full descriptions;
- redact or truncate sensitive personal information that is not needed for matching.

---

## 15. Estimated File Changes

| File | Action | Purpose |
|---|---|---|
| `electron/job-search-planner.cjs` | Modify | Structured brief, parsing, fallback, provider lanes |
| `electron/job-search.cjs` | Modify or split | Title-first USAJOBS queries, filters, pagination, normalization, diagnostics |
| `electron/job-relevance.cjs` | Optional new | Pure relevance and deterministic scoring functions |
| `electron/job-matcher.cjs` | Modify | Evidence-based validated ranking and fallback |
| `electron/main.cjs` | Modify | Stable search response and ranking fallback |
| `electron/preload.cjs` | Usually unchanged | Preserve safe search IPC boundary |
| `src/JobsView.jsx` | Modify or split helpers | Search brief, result cards, evidence, diagnostics, adjustment UX |
| `src/styles.css` | Modify | Search report, evidence, result-state presentation |
| `electron/database.cjs` | Modify only if needed | New normalized saved-job fields |
| `electron/migrations/0004_job_search_metadata.sql` | Conditional new | Additive persistence migration only if required |
| `test/job-search-planner.test.cjs` | Modify | Planner and lane tests |
| `test/job-search.test.cjs` | New | Provider parameter, pagination, normalization, diagnostics tests |
| `test/job-matcher.test.cjs` | New | Ranking schema and fallback tests |

---

## 16. Final Acceptance Contract

Complete only when all are true:

1. Rough user intent produces a structured search brief instead of one raw keyword.
2. USAJOBS searches use `PositionTitle` for primary role discovery.
3. `Keyword` is limited to deliberate supporting lanes.
4. Search lanes include clear reasons and preserve their evidence.
5. Location, radius, remote, salary, schedule, hiring path, clearance, and travel filters are applied only from confirmed user information.
6. Request count, page count, and candidate-pool size are bounded.
7. Jobs are normalized with enough information to assess title, agency, location, salary, closing date, duties, qualifications, categories, grade, eligibility, and remote status.
8. Results are deduplicated and ranked using deterministic evidence before optional AI review.
9. AI output is validated and cannot invent candidate facts or job facts.
10. Retrieved jobs remain visible when AI ranking fails.
11. Each result explains why it appeared, what evidence supports the fit, what is missing, and what the user should do next.
12. No-result, filter-empty, provider-error, low-confidence, and federal-only states are distinct.
13. The user can improve a search through explicit adjustments without silent filter broadening.
14. Existing manual job-pipeline save/reload behavior remains intact.
15. Tests, build, syntax checks, and the actual desktop smoke test pass with real output.
16. No scraping, automatic applications, second provider, scheduling, or unrelated product changes are introduced.
17. Stop after this contract passes.
