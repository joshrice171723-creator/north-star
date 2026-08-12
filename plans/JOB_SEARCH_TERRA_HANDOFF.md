# Job Search Pipeline — Terra Implementation Handoff

## Objective

Refactor the job-search pipeline so that AI plans provider-specific searches, all four providers are retrieved before selection, the application deterministically keeps the best 20 candidates from each provider, and a final AI call selects the best 20 overall from up to 80 candidates.

Providers:

- USAJOBS
- Adzuna
- Remotive
- Arbeitnow

## Agreed product behavior

1. The AI planner uses the user's resume, target job titles, industries, interests, skills, location, remote preference, seniority, salary, clearance, work authorization, and exclusions.
2. The AI expands abbreviations and private-sector titles. `FDE` means `Forward Deployed Engineer`.
3. The AI creates provider-compatible search lanes, but the application owns endpoints, authentication, allowed parameters, limits, retries, and request construction.
4. All four providers must be started and allowed to finish before per-provider selection begins.
5. A provider failure, empty response, missing credentials, timeout, or malformed response must not cancel successful providers.
6. Keep the top 20 eligible jobs per provider, or all eligible jobs when a provider has fewer than 20.
7. The final AI may choose any best 20 overall. Do not enforce source diversity.
8. If the final AI fails, show the deterministic per-provider candidates with a clear fallback status.
9. No provider may silently disappear from diagnostics. Show zero counts and the exact failure/empty/skipped reason.

## Current relevant files

- `electron/job-search-planner.cjs` — AI search planning and provider-lane validation.
- `electron/job-search.cjs` — provider retrieval, normalization, filtering, and diagnostics.
- `electron/adzuna-provider.cjs` — Adzuna request construction.
- `electron/public-job-providers.cjs` — Remotive and Arbeitnow providers.
- `electron/job-matcher.cjs` — current AI assessment and deterministic selection.
- `electron/main.cjs` — OpenRouter wrapper, IPC search orchestration, persistence, and report payload.
- `src/JobsView.jsx` — search progress, result rendering, and advanced report.
- `test/job-search-planner.test.cjs`
- `test/job-search.test.cjs`
- `test/job-matcher.test.cjs`
- `test/ranking-fallback.test.cjs`

## Current problems to correct

- Provider retrieval currently runs mostly sequentially.
- Retrieved jobs are filtered before ranking, which can discard useful provider results.
- Current AI ranking assesses batches of retrieved jobs and fails the ranking phase when a batch is incomplete.
- Current selection is deterministic and limited to five per provider.
- The report can make a provider with zero results ambiguous.
- USAJOBS can receive an overly narrow query such as `FDE` and return zero results.
- Documentation URLs in the AI prompt are not a guarantee that the model has inspected the documentation.

## Target pipeline

```text
Profile + resume
    -> AI search planner
    -> validate provider lanes against an application-owned API capability registry
    -> run USAJOBS, Adzuna, Remotive, and Arbeitnow concurrently
    -> wait for all provider promises with Promise.allSettled
    -> normalize and deduplicate all jobs
    -> apply hard exclusions and deterministic relevance scoring
    -> select top 20 per provider
    -> send up to 80 candidates to final AI selector
    -> validate final IDs and return best 20
```

## Provider retrieval design

Use a stable provider result envelope:

```js
{
  provider: 'usajobs',
  status: 'success' | 'failed' | 'empty' | 'skipped',
  jobs: [],
  error: null,
  diagnostics: {}
}
```

Use `Promise.allSettled` or an equivalent wrapper so one provider exception becomes a provider result instead of rejecting the entire search.

Ensure all four providers appear in the final result, even when they have no requests because of missing credentials or no valid lane.

Do not expose credentials in diagnostics, prompts, UI, or logs.

## AI planner requirements

The planner receives bounded, explicit context from the profile and resume. Include:

- target roles and target intent;
- target industries and interests;
- resume summary, skills, experience, certifications, and relevant accomplishments;
- must-have and nice-to-have skills;
- seniority and years of experience;
- target locations, remote preference, radius, salary, work authorization, clearance, and job type;
- exclusions.

The planner must return provider-compatible lanes, not arbitrary URLs or HTTP instructions. The application validates and constructs actual requests.

USAJOBS strategy:

- Do not rely only on an acronym or exact private-sector title.
- Expand `FDE` to `Forward Deployed Engineer`.
- Generate exact-title, adjacent-title, and skill-keyword lanes.
- For an FDE/AI/software profile, possible federal equivalents include `IT Specialist`, `Computer Scientist`, `Computer Engineer`, `Systems Engineer`, `Program Analyst`, and `Operations Research Analyst`, but the AI must justify each lane from the user's context.
- Use keyword lanes for skills such as artificial intelligence, machine learning, cloud, automation, and deployment.
- If all USAJOBS AI lanes return zero, run a bounded recovery set of validated broad federal titles and record those requests as `recovery` attempts.

Do not assume an API accepts arrays of titles. Use separate lanes/requests unless the provider capability registry explicitly documents batching.

## Deterministic per-provider selection

Implement a function similar to:

```js
selectTopJobsPerProvider(jobs, plan, { limitPerProvider: 20 })
```

Rules:

- Preserve every provider's identity.
- Deduplicate before selection.
- Apply hard exclusions.
- Calculate a transparent deterministic score using title relevance, skill overlap, location, remote preference, seniority, salary/clearance signals where available, and recency where available.
- Do not require a score threshold that can reduce a provider to zero without recording the filtered count. Prefer selecting the best available eligible jobs per provider.
- Return at most 20 for each provider.
- Attach `scoreType: 'deterministic'` or equivalent to these candidates.

## Final AI selector

Create a separate final-selection function. It receives:

- the bounded profile/resume context needed for comparison;
- up to 80 candidates;
- only normalized fields needed for selection;
- deterministic scores as supporting evidence, not as an instruction to copy the ranking.

The AI must return strict JSON such as:

```json
{
  "selectedExternalIds": ["provider-id-1", "provider-id-2"]
}
```

Validation must reject:

- invented IDs;
- duplicate IDs;
- IDs not present in the submitted candidates;
- malformed JSON;
- more than 20 IDs;
- invalid or missing selection fields.

Fewer than 20 selections are allowed when fewer than 20 are genuinely suitable. The AI may select all 20 from one provider.

If selection fails, return deterministic candidates and set a structured fallback diagnostic. Do not erase provider retrieval diagnostics.

## Diagnostics and UI

Per-provider reporting should distinguish:

- requests attempted;
- raw jobs returned;
- unique jobs;
- hard-filtered jobs;
- deterministic top candidates sent to final AI;
- final AI selections;
- provider errors;
- empty successful responses;
- skipped/missing-credential status;
- USAJOBS recovery attempts and results.

The report should show all four providers, including zero values. Keep planner, retrieval, deterministic-selection, final-selection, and fallback errors separate.

Suggested summary:

```text
Provider      Retrieved  Eligible  Top sent  Final selected  Status
USAJOBS       0          0         0         0               recovered/empty/failed
Adzuna        30         30        20        8               success
Remotive      20         20        20        7               success
Arbeitnow     2          2         2         2               success
```

## Required tests

Add or update tests for:

1. All four providers start concurrently.
2. The search waits for all providers before selection.
3. One provider failure does not hide successful providers.
4. Empty, skipped, missing-credential, timeout, and malformed-provider responses are distinct.
5. Every provider is represented in diagnostics, including zero-result providers.
6. Deduplication works across provider requests.
7. Top-20 selection returns no more than 20 per provider and keeps fewer when fewer exist.
8. USAJOBS broad-title and keyword recovery runs after zero AI-lane results.
9. Final AI receives no more than 80 candidates.
10. Final AI accepts valid IDs and rejects invented, duplicate, malformed, and over-limit selections.
11. Final AI failure falls back to deterministic candidates without losing diagnostics.
12. Resume/profile context is bounded and includes the fields needed for planning.
13. No credentials or raw provider payloads enter AI prompts, logs, or renderer diagnostics.
14. Existing tests and production build continue to pass.

## Verification expectations

Before claiming completion:

1. Run focused planner, provider, matcher, and fallback tests.
2. Run the complete test suite.
3. Run the production build.
4. Run a live search with all four providers configured or intentionally skipped.
5. Verify the rendered advanced report, not only backend objects.
6. Confirm a USAJOBS zero-result case clearly shows the original query, recovery attempt, and final status.
7. Confirm the final AI receives the combined top-per-provider set and returns no more than 20.

Preserve unrelated working-tree changes. Do not print or commit secrets from `.env` or encrypted credential storage.
