# Hermes Current Handoff: Job Search, Credentials, and `[object Object]` Failure

> **Document status:** active handoff · **Date:** 2026-08-10 · **Repository:** `C:\Users\joshr\OneDrive\Desktop\hermes\anthropic-certification-native`
>
> This file is the current operational handoff for Hermes job-search debugging. It supersedes older assumptions when fresh runtime evidence disagrees.
## Executive summary

The job-search feature is currently unreliable and must be stabilized before adding more ranking or provider-selection behavior.

The latest user-visible failure is:

```text
[object Object]
```

This is a confirmed renderer error-handling bug, not a useful provider diagnosis. The main process can return a structured error object, but the renderer passes that object directly into `new Error(...)`; JavaScript stringifies it as `[object Object]`.

The user also reports that API keys/credentials are not working. Existing evidence shows:

- Adzuna previously returned HTTP 400 for every attempted request.
- USAJOBS has recently shown zero retrieved jobs in the report.
- The current credential UI intentionally does not return secret values when loading saved credentials, so the renderer cannot prove that the encrypted secrets decrypt correctly.
- A credential file was previously confirmed to exist with all four fields, but that does not prove the runtime is successfully decrypting or using the values.
- OpenRouter/AI planning can fail before any provider request is made.

Do not treat a successful syntax check, build, or unit test run as proof that live credentials work.

## Confirmed `[object Object]` root cause

Current renderer code in `src/JobsView.jsx` contains this logic inside `runSearch`:

```js
if (!result?.ok) {
  if (result?.needsProfile) setProfileOpen(true);
  throw new Error(result?.message || result?.error || 'Search failed.');
}
```

`electron/main.cjs` and provider code return structured errors such as:

```js
{
  code: 'provider_error',
  message: 'Adzuna returned HTTP 400.',
  retryable: true
}
```

When `result.message` is absent and `result.error` is an object, `new Error(result.error)` produces an Error whose message is `[object Object]`.

### Required fix

Add one safe error-normalization helper in the renderer or shared preload boundary. It must prefer useful nested fields and never stringify an object directly:

```js
const errorMessage = (cause, fallback = 'Search failed.') => {
  if (typeof cause === 'string' && cause.trim()) return cause;
  if (cause?.message && typeof cause.message === 'string') return cause.message;
  if (cause?.error?.message && typeof cause.error.message === 'string') return cause.error.message;
  if (cause?.error && typeof cause.error === 'string') return cause.error;
  if (cause?.code && typeof cause.code === 'string') return `${cause.code}: ${fallback}`;
  return fallback;
};
```

Use it for `runSearch`, source save/test/load errors, and any IPC failure display. Add a regression test or renderer-level test that passes `{ error: { code: 'unauthorized', message: 'Adzuna credentials were rejected.' } }` and verifies that the UI displays the nested message.

## Current user-visible symptoms

1. Clicking **Find 10 jobs** can display `[object Object]` instead of the actual failure.
2. API keys/app IDs appear not to work.
3. Search reports have shown:

```text
Multiple job sources · 8 requests · 32 unique · 5 shown
USAJOBS / federal jobs: 4 requests · 0 retrieved · 0 unique · 0 shown · 0 failed
Adzuna: 2 requests · 0 retrieved · 0 unique · 0 shown · 0 failed
Remotive: 1 request · 20 retrieved · 20 unique · 3 shown · 0 failed
Arbeitnow: 1 request · 12 retrieved · 12 unique · 2 shown · 0 failed
```

4. Request parameters were initially not visible because the renderer read `searchReport.attemptsDiagnostics`, while the Electron response stored attempts under `searchReport.diagnostics.attempts`. A compatibility alias and fallback lookup were added, but the app must be restarted and retested.
5. The active database profile previously contained empty role/location/interest arrays. The user must save at least one target role, location, or interest before searching.
6. The available pre-reset backup predates the job-search schema and did not recover the missing search-profile data.

## Credential/storage facts

### Encrypted credential location

```text
C:\Users\joshr\AppData\Roaming\ClaudeArchitectStudyCoachNative\job-source-credentials.json
```

The file must not be printed or copied into this repository. It is outside the repository and is intended to remain encrypted.

### Credential fields

The four expected fields are:

- `usajobsEmail`
- `usajobsApiKey`
- `adzunaAppId`
- `adzunaApiKey`

The UI only exposes the saved USAJOBS email and masked/configured state. It intentionally does not return decrypted API keys to the renderer.


## Provider-specific issues

### OpenRouter planner

The planner runs before provider retrieval. If it fails, no USAJOBS or Adzuna request is sent.

Possible causes:

- missing/invalid `OPENROUTER_API_KEY`;
- OpenRouter HTTP error;
- timeout;
- malformed or truncated planner JSON;
- missing provider query arrays;
- response content shape not handled by the parser;
- output-token limit too small for four provider query sets.

The planner must return provider-specific query sets for:

- USAJOBS
- Adzuna
- Remotive
- Arbeitnow

Planner errors must preserve safe status/code/message metadata. Do not persist API keys, raw prompts, resume text, or raw provider responses.

### USAJOBS

Recent report evidence showed zero retrieved USAJOBS results without failures. This could be a real empty response, invalid/unused credentials, query construction, account/header requirements, or an upstream response parsing issue. Capture the HTTP status, safe response summary, outbound parameter object, and result-shape summary on the next live run.

USAJOBS request parameters are intended to include safe fields such as:

- `PositionTitle`
- `Keyword` only for keyword-support lanes
- `LocationName`
- `Radius`
- `RemoteIndicator`
- salary/schedule/date filters
- `ResultsPerPage`, `Page`, `Fields`, and sorting

Do not persist the USAJOBS API key or email header value.

### Adzuna

All previously observed Adzuna attempts returned HTTP 400. Earlier diagnostics showed an HTML error page rather than useful JSON. The current provider patch:

- uses `/search/{page}` for page placement;
- removes query-string `page`;
- adds `content-type=application/json`;
- supports lane `what`, `where`, and salary fields;
- excludes `app_id` and `app_key` from persisted request diagnostics;
- still includes credentials only in the actual outbound request URL.

A live post-patch run has not yet proven that Adzuna credentials or endpoint parameters work. The next diagnostic must capture the exact HTTP status and safe body summary while redacting the URL credentials.

### Remotive

Remotive previously returned results. Its diagnostics now record the actual safe query fields such as `search`, `category`, `company_name`, and `limit`.

### Arbeitnow

Arbeitnow uses a fixed URL with no HTTP query parameters. Search filtering occurs locally after fetching the feed. Diagnostics should clearly distinguish:

- actual URL/query sent over HTTP;
- local search filter;
- local location context.

Do not report the local filter as if it were an Arbeitnow API parameter.

## Search-report implementation state

Completed or recently changed:

- expandable provider reports;
- per-request count/status/error display;
- persisted request previews and total available counts;
- safe USAJOBS and Adzuna request diagnostics;
- Remotive actual query-parameter diagnostics;
- Arbeitnow fixed-URL/local-filter diagnostics;
- renderer fallback from `attemptsDiagnostics` to `diagnostics.attempts`;
- top-level `attemptsDiagnostics` response alias.

Still incomplete:

- full raw-response audit trail;
- candidate-stage filtering audit trail;
- AI planner/matcher decision audit trail;
- global candidate/ranking limits and guaranteed provider-aware top-five behavior;
- minimum selected-job enforcement per provider;
- reliable live credential validation;
- planner failure persistence in the database;
- regression coverage for credential decryption failure and profile persistence;
- renderer regression coverage for structured IPC errors such as `[object Object]`.

## Relevant files

```text
electron/main.cjs                 IPC, OpenRouter wrapper, credential flow, jobs:search
electron/preload.cjs              renderer IPC bridge
electron/job-search-planner.cjs  AI plan creation/parser/validation
electron/job-search.cjs          USAJOBS orchestration and provider diagnostics
electron/adzuna-provider.cjs     Adzuna request construction and errors
electron/public-job-providers.cjs Remotive and Arbeitnow
electron/database.cjs             search-run/attempt persistence
electron/migrations/0004_job_search_diagnostics.sql
electron/migrations/0005_job_search_attempt_previews.sql
src/JobsView.jsx                  profile, source credentials, search UI, report UI
src/styles.css                    report and credentials styling
test/job-search.test.cjs
test/adzuna-provider.test.cjs
test/job-search-planner.test.cjs
```

## Current worktree warning

The repository has a broad set of uncommitted changes from the preceding debugging session. At handoff time, modified/untracked job-search-related files include:

```text
electron/adzuna-provider.cjs
electron/database.cjs
electron/job-matcher.cjs
electron/job-search-planner.cjs
electron/job-search.cjs
electron/main.cjs
electron/preload.cjs
electron/public-job-providers.cjs
electron/migrations/0004_job_search_diagnostics.sql
electron/migrations/0005_job_search_attempt_previews.sql
src/JobsView.jsx
src/styles.css
test/adzuna-provider.test.cjs
test/job-search-planner.test.cjs
test/job-search.test.cjs
```

Review the complete diff before making additional edits. Do not reset or discard these changes without first preserving the handoff and confirming which changes are intentional.

## Required recovery order

1. Fix structured error normalization so no user-visible path can show `[object Object]`.
2. Restart the entire Electron app, not only the Vite renderer.
3. Save a minimal profile containing one target role, one location, or one interest.
4. Test OpenRouter planning separately and display its safe HTTP/code/message result.
5. Test USAJOBS and Adzuna credentials separately through the existing source-test action.
6. Verify that a decrypted credential is used at runtime without logging its value.
7. Run one search with all provider attempts and inspect safe request/status diagnostics.
8. Determine separately whether each failure is planning, decryption, authentication, endpoint/parameter validation, response parsing, local filtering, or ranking.
9. Add regression tests for each confirmed failure before implementing provider minimums or new ranking behavior.
10. Only after live retrieval is stable, resume candidate-stage and provider-aware selection work.

## Validation commands

Run from:

```text
C:\Users\joshr\OneDrive\Desktop\hermes\anthropic-certification-native
```

```powershell
node --test test/*.test.cjs
npm run build
node --check electron/main.cjs
node --check electron/job-search-planner.cjs
node --check electron/job-search.cjs
node --check electron/adzuna-provider.cjs
node --check electron/public-job-providers.cjs
git diff --check
```

## Bottom line

The immediate blocker is not “add more diagnostics”; it is that the renderer hides structured failures behind `[object Object]`. Fix that first. Then establish whether the live failure is OpenRouter planning, credential decryption, USAJOBS authentication/request behavior, Adzuna HTTP 400 behavior, or response parsing. Keep all secrets out of diagnostics and handoffs. Do not claim API credentials work until a restarted Electron process completes a provider-specific authenticated test.