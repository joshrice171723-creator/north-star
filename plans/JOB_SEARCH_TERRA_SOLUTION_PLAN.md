# Job Search Terra Medium Solution Plan

## Objective

Make the job-search pipeline reliably execute this contract:

```text
retrieve up to 100 jobs per provider
    -> deduplicate and hard-filter
    -> deterministically rank each provider
    -> keep the best 20 eligible jobs per provider
    -> send up to 80 candidates to one final AI selector
    -> return up to 20 validated overall selections
```

Providers:

- USAJOBS
- Adzuna
- Remotive
- Arbeitnow

The final selector may choose any provider mix. If fewer than 20 eligible candidates exist overall, return all eligible candidates and report the shortfall explicitly.

## Scope and decisions

- The target retrieval quantity is **up to 100 unique jobs per provider**, not an artificial guarantee when the provider has fewer listings or fails.
- Retrieval is provider-specific and bounded. The application, not the AI planner, owns pagination, limits, retries, credentials, and endpoints.
- Hard exclusions are applied before deterministic ranking.
- Location policy is explicit: requested local geography must match local jobs; remote jobs are eligible only when the profile permits remote work. Remote worldwide feeds must not be treated as Dallas-local results.
- Public-feed search terms are hints, not authoritative relevance guarantees. Application-side filtering and rejection reasons are required.
- The final AI is asked for the best 20 when at least 20 candidates are supplied, but the response validator permits fewer only when the submitted pool contains fewer than 20 candidates. If a model returns fewer than 20 from a pool of 20+, mark the result as `under_selected` and decide whether to accept it or fill from deterministic candidates; default recommendation is to accept the model output while clearly reporting the count.

## Files in scope

- `electron/job-search.cjs` — retrieval orchestration, pagination, provider envelopes, deduplication, filtering, deterministic per-provider selection, accounting.
- `electron/adzuna-provider.cjs` — page/limit request behavior and response diagnostics.
- `electron/public-job-providers.cjs` — Remotive pagination/limits and Arbeitnow feed filtering/location handling.
- `electron/job-search-planner.cjs` — normalize planner limits without allowing the planner to bypass application bounds.
- `electron/job-matcher.cjs` — final selector contract and validation.
- `electron/main.cjs` — final-selection accounting, persisted run result semantics, fallback status.
- `src/JobsView.jsx` — unambiguous retrieval/eligibility/top-sent/final-selected labels.
- `test/job-search.test.cjs`, `test/job-matcher.test.cjs`, `test/ranking-fallback.test.cjs`, and new focused tests where useful.

Do not modify credentials, unrelated job-board CRUD behavior, or unrelated UI areas.

## Phase 1 — Define the internal accounting contract

Create one stable per-provider diagnostic shape:

```js
{
  provider,
  status: 'success' | 'empty' | 'failed' | 'skipped' | 'shortfall',
  requestsAttempted,
  pagesAttempted,
  retrievedRaw,
  uniqueCount,
  hardFilteredCount,
  eligibleCount,
  deterministicTopCount,
  finalSelectedCount,
  targetRetrievalCount: 100,
  targetTopCount: 20,
  errors,
  rejectionReasons,
  recoveryAttempts
}
```

Separate these values everywhere:

- raw provider rows;
- unique normalized jobs;
- hard-filtered jobs;
- eligible jobs scored for deterministic selection;
- top candidates submitted to final AI;
- final AI selections;
- displayed/fallback jobs.

Ensure `job_search_runs.result_count` has an explicit meaning. Recommended: store final displayed result count and expose retrieval counts separately in the report.

## Phase 2 — Implement bounded retrieval to 100 per provider

### Shared orchestration

1. Keep all four providers represented even when skipped, empty, or failed.
2. Start provider work concurrently and wait with `Promise.allSettled`.
3. Add a provider-specific bounded retrieval helper that continues pages until:
   - 100 unique jobs are collected;
   - the provider reports no more results;
   - the configured page limit is reached;
   - or a non-retryable error occurs.
4. Deduplicate after normalization using stable provider/external identity, while preserving provider identity and recording duplicate counts.
5. Never let one provider failure cancel the other providers.

### USAJOBS

- Request at most 100 results per provider using documented page size and page numbers.
- Continue pages until 100 unique jobs or exhaustion.
- On retryable network/timeout/5xx failures, perform a bounded retry with backoff, then execute the existing broad-title recovery only when appropriate.
- Recovery should run after zero successful AI-lane results and after retryable transport failure when credentials are valid; it must not run after unauthorized or malformed responses.
- Persist every normal and recovery request with page, lane type, recovery flag, status, and safe error details.

### Adzuna

- Request page 1, page 2, etc. using the existing URL page segment.
- Preserve `results_per_page` within the provider’s supported bound.
- Stop at 100 unique jobs or when `count` indicates exhaustion.
- Keep credentials out of diagnostics and request previews.

### Remotive

- Verify the provider’s actual pagination/limit semantics from its documented response and implement bounded continuation accordingly.
- Do not claim 100 retrieved if the endpoint returns only 20 and exposes no usable pagination. Mark the provider `shortfall` with the actual maximum/reason.
- Keep remote location semantics explicit.

### Arbeitnow

- Fetch the feed within a bounded request count.
- Apply application-side query and location filtering before truncating to 100.
- Do not use the first 50 matching rows as the provider’s complete candidate pool if more than 50 matches are present.
- Record rejection reasons such as `wrong_location`, `not_remote_eligible`, `query_mismatch`, `excluded_keyword`, and `duplicate`.
- If the feed itself contains fewer than 100 valid matches, report `shortfall` rather than silently treating 50 as complete.

## Phase 3 — Correct deterministic provider selection

Implement or refine `selectTopJobsPerProvider` so it:

1. Deduplicates before selection.
2. Applies hard exclusions.
3. Applies explicit geography/remote eligibility rules.
4. Scores title relevance, skill overlap, location, remote preference, seniority, salary/clearance signals where available, and recency where available.
5. Keeps the best 20 eligible jobs per provider, preserving fewer when fewer exist.
6. Records every filtering reason and count.
7. Ensures the exact selected IDs equal the IDs passed to the final AI.

Avoid using a hidden threshold that silently removes a provider. If a score threshold remains necessary, expose the threshold and the rejection count.

## Phase 4 — Final AI selector and fallback behavior

- Pass no more than 80 candidates, with no raw provider payloads or credentials.
- Keep one final selection call after all provider selection is complete.
- Validate JSON, candidate membership, duplicate IDs, and maximum 20 IDs.
- Record `submittedCount`, `returnedCount`, provider counts, prompt size, call status, and fallback status.
- If the call fails, show the deterministic top-per-provider candidates and mark `fallback` explicitly.
- Distinguish `finalSelectedCount` from `deterministicTopCount`; never label deterministic fallback jobs as AI-selected.
- Add an `under_selected` diagnostic when fewer than 20 are returned from a pool containing at least 20.

## Phase 5 — Repair report semantics

Replace ambiguous labels such as `relevant`, `assessed`, and `shown` with:

```text
Retrieved raw
Unique
Filtered
Eligible
Top 20 sent to final AI
Final AI selected
Displayed
Status / reason
```

The advanced report must show all four providers, including zeroes, shortfalls, recovery attempts, and errors. The run summary must show:

- total raw retrieved;
- total unique;
- total top candidates sent;
- final selected;
- whether results are AI-selected or deterministic fallback.

Update the stale “Find 10 jobs” and “Top federal matches” copy if the feature now searches four providers and returns up to 20 overall.

## Phase 6 — Regression tests

Add focused fixtures and tests for:

1. Four providers retrieve concurrently and all settle.
2. USAJOBS pagination reaches 100 across multiple pages.
3. Adzuna pagination reaches 100 and stops at provider exhaustion.
4. Remotive’s actual cap/pagination behavior is reported truthfully.
5. Arbeitnow filters location correctly and does not truncate before filtering.
6. Retryable USAJOBS network failure triggers bounded retry/recovery; unauthorized and malformed responses do not.
7. One provider failure does not hide successful providers.
8. Duplicate jobs are removed before selection.
9. Hard exclusions and wrong-geography jobs are rejected with reasons.
10. Each provider contributes no more than 20 deterministic candidates.
11. Fewer-than-20 providers are preserved.
12. The exact deterministic candidate IDs equal final-AI input IDs.
13. Final AI never receives more than 80 candidates.
14. Final AI rejects invented, duplicate, malformed, and over-limit IDs.
15. Final AI failure falls back without losing provider diagnostics.
16. Run and renderer counts distinguish retrieved, top-sent, final-selected, and displayed.
17. A final AI response of 5 from 80 is marked `under_selected` rather than silently presented as a complete top-20 result.
18. No credentials or raw provider payloads enter prompts, logs, or renderer diagnostics.

## Verification

Run:

```text
node --test test/*.test.cjs
node --check electron/job-search.cjs
node --check electron/adzuna-provider.cjs
node --check electron/public-job-providers.cjs
node --check electron/job-search-planner.cjs
node --check electron/job-matcher.cjs
npm.cmd run build
```

Then run a live search with each provider intentionally configured or skipped and verify:

- up to 100 retrieval accounting per provider;
- up to 20 deterministic candidates per provider;
- exact final-AI input count;
- final selected count;
- provider failure/recovery visibility;
- rendered advanced report semantics.

Preserve unrelated working-tree changes. Do not commit credentials, raw provider responses, or local database files.

## Terra Medium assessment

Terra Medium should be sufficient for the implementation and regression-test work because the scope is localized, the target contract is now explicit, and the repository already has provider adapters, diagnostics, a final selector, and test coverage.

Medium should be used with this bounded execution order:

1. Implement one provider/pagination contract at a time.
2. Run focused tests after each provider.
3. Do not redesign the planner or unrelated UI while fixing retrieval/accounting.
4. Use fixtures for most correctness checks and reserve live calls for final verification.

A stronger model or manual review may still be useful for verifying current third-party API pagination limits and for resolving whether a model that returns fewer than 20 should be accepted or deterministically backfilled. Those are external/product decisions, not reasons the coding work requires a larger model.

## Completion criteria

The work is complete only when a trace can demonstrate:

```text
Provider A: <=100 retrieved -> <=20 top sent
Provider B: <=100 retrieved -> <=20 top sent
Provider C: <=100 retrieved -> <=20 top sent
Provider D: <=100 retrieved -> <=20 top sent
Combined final-AI input: <=80
Final output: <=20 validated IDs
```

The report must make every shortfall, failure, recovery attempt, fallback, and under-selection visible.
