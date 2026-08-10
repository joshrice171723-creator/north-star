# Fix USAJOBS Zero-Results Search

> **For Hermes/Cline:** Execute this plan task-by-task. Do not change unrelated Academy, study-coach, roadmap, or executive-coach behavior.

**Goal:** Make the desktop app reliably accept USAJOBS credentials, search the live USAJOBS API, display returned jobs, and show useful diagnostics when a request or ranking step fails.

**Target project:** `C:\Users\joshr\OneDrive\Desktop\hermes\anthropic-certification-native`

**Known evidence:**
- A direct request to `https://data.usajobs.gov/api/search` with the user-provided USAJOBS credentials returned HTTP 200 and listings.
- `electron/job-search.cjs` was exercised directly and returned 25 normalized jobs.
- `npm run build` passed.
- `node --check` passed for the relevant Electron files.
- The remaining failure is therefore in the credential UI, Electron IPC/runtime path, profile/query state, or result projection—not the USAJOBS API itself.

**Security:** The API key was exposed in chat. Do not commit, log, print, or write the exposed key to project files. After verification, the owner must revoke it and create a replacement key.

---

## Phase 0: Establish the real failure

### Task 1: Inspect repository state and baseline

**Files:** Read only.

Read:
- `package.json`
- `electron/main.cjs`
- `electron/preload.cjs`
- `electron/job-search.cjs`
- `electron/job-matcher.cjs`
- `src/JobsView.jsx`
- all files under `electron/migrations/`

Run:

```bash
cd /c/Users/joshr/OneDrive/Desktop/hermes/anthropic-certification-native
npm run build
node --check electron/main.cjs
node --check electron/preload.cjs
node --check electron/job-search.cjs
node --check electron/job-matcher.cjs
git diff --check
```

Record the real output. Do not claim the app works from source inspection alone.

### Task 2: Reproduce through the actual Electron IPC path

Launch the actual app using the repository’s supported production command. If needed, use a temporary Electron remote-debugging port for inspection; do not modify app source only to enable debugging.

Exercise these exact boundaries:

1. `window.desktopShell.getJobSource()`
2. Save credentials through `window.desktopShell.saveJobSource(...)` using a replacement key, not the exposed key.
3. Read `getJobSource()` again and confirm only `{ configured: true, email }` is returned.
4. Save a profile containing at least one target role, such as `artificial intelligence`.
5. Invoke `window.desktopShell.searchJobs()`.
6. Capture the complete structured response, redacting credentials and job descriptions if not needed.

Record separately:
- credential save result
- credential status result
- profile result
- search result
- renderer console errors
- Electron main-process errors

Stop and identify the first failing boundary before editing.

---

## Phase 1: Fix credential entry and persistence

### Task 3: Remove invalid masked-key source values

**Likely file:** `src/JobsView.jsx`

Replace any literal invalid placeholder such as `***` used as a JavaScript value with an empty string:

```js
const emptySourceForm = () => ({
  usajobsEmail: '',
  usajobsApiKey: ''
});
```

Use the helper for initial state and clear/reset operations. When credentials are already configured:

- keep the API key input empty
- use a placeholder such as `Saved — enter a new key to replace it`
- disable Save unless both email and a newly entered key are present
- never put a masked value into the input’s actual `value`

The exact UI behavior must distinguish:
- empty/unconfigured
- configured with no replacement key entered
- replacement key entered but not yet saved

### Task 4: Make credential-save errors visible and structured

**Files:** `electron/main.cjs`, `src/JobsView.jsx`

Keep the API key in the main process only. Do not return it to React.

In the main process:
- validate trimmed email and key
- preserve encrypted storage using Electron `safeStorage`
- return `{ configured: true, email }` only
- return a clear error code/message for missing fields or unavailable secure storage
- avoid logging request headers, credentials, or full error objects containing secrets

In the renderer:
- display the actual save error
- do not swallow errors in the initial credential/profile loading effect
- show configured status only after the save IPC call succeeds

### Task 5: Add a credential connection test

**Files:** `electron/main.cjs`, `electron/preload.cjs`, `src/JobsView.jsx`

Add a narrow IPC operation such as:

```js
jobs:source:test
```

It must make one bounded USAJOBS request using the stored main-process credentials and return:

```js
{ ok: true, status: 200, count: number }
```

or:

```js
{ ok: false, code: 'unauthorized|rate_limited|network|invalid_response|not_configured', message: string }
```

Do not return the raw response, API key, or request headers.

Add a **Test connection** button beside the credential controls. This separates “key was saved” from “USAJOBS accepted the key.”

---

## Phase 2: Fix search diagnostics and result flow

### Task 6: Return structured source diagnostics

**File:** `electron/job-search.cjs`

Change provider results so the caller can distinguish:

- missing credentials
- HTTP 401/403
- HTTP 429
- HTTP 5xx
- timeout/network failure
- malformed JSON
- valid HTTP 200 with zero results
- valid HTTP 200 with jobs

Use a stable shape, for example:

```js
{
  jobs: [],
  warning: '',
  error: {
    code: 'unauthorized',
    message: 'USAJOBS rejected the credentials.' ,
    retryable: false
  }
}
```

Do not hide a provider failure as “0 listings.” A valid empty search and an API failure must display differently.

Preserve the successful live behavior already verified with the USAJOBS endpoint.

### Task 7: Make search query construction tolerant

**File:** `electron/job-search.cjs`

Verify and test:

- target roles are trimmed and bounded
- target locations are optional
- empty role plus a location still creates a valid search
- multiple roles produce bounded queries
- no accidental literal placeholder values reach the API
- `LocationName` is only sent when non-empty
- query strings are URL-encoded by `URLSearchParams`

Use a safe default query only when both role and location are absent, and make the UI’s profile validation consistent with that rule.

### Task 8: Add bounded request logging for diagnostics

**File:** `electron/job-search.cjs`

Do not log secrets or full job payloads. Return or record only safe diagnostics:

```js
{
  provider: 'usajobs',
  httpStatus: 200,
  query: 'artificial intelligence',
  resultCount: 25,
  durationMs: 1234
}
```

Use this diagnostic data in the IPC response or a development-only safe log. Never include `Authorization-Key`, full headers, credentials, or raw API payloads.

### Task 9: Harden the main-process search handler

**File:** `electron/main.cjs`

The `jobs:search` handler must:

1. Load the profile and resume.
2. Validate that the profile has a usable role or location.
3. Load credentials only in the main process.
4. Run the provider search.
5. If the provider fails, return a structured safe error.
6. If jobs are returned, rank them.
7. If OpenRouter ranking fails, preserve jobs and use the existing deterministic fallback.
8. Return jobs and matches with stable matching IDs.
9. Never turn a valid job list into an empty UI result because the AI ranking call failed.

Return a response such as:

```js
{
  ok: true,
  jobs,
  matches,
  warning,
  diagnostics,
  sourceStats
}
```

The renderer must be able to display jobs even if `matches` is empty or partially ranked.

---

## Phase 3: Fix renderer state and display

### Task 10: Make result projection independent of AI matches

**File:** `src/JobsView.jsx`

Current behavior maps matches to jobs and filters out entries without a matching AI result. Change it so:

- every returned job can be displayed
- a matching AI assessment is attached when present
- missing match data gets a visible `Not scored`/`AI scoring unavailable` state
- no job is silently dropped because `matches` is empty

Use the external ID as the join key, but normalize it with `String(...)` on both sides.

Example approach:

```js
const matchById = new Map(
  (result.matches || []).map((match) => [String(match.externalId), match])
);

const visibleMatches = (result.jobs || []).map((job) => ({
  job,
  ...(matchById.get(String(job.externalId)) || {
    fitScore: null,
    fitTier: 'unknown',
    strengths: [],
    gaps: ['AI scoring was unavailable.'],
    reasoning: 'Job retrieved successfully; review it manually.'
  })
}));
```

Set the search success message from the number of jobs found, not only the number of AI matches.

### Task 11: Show source diagnostics in the UI

**File:** `src/JobsView.jsx`

Display safe information after search:

- source name
- number of jobs fetched
- search terms used
- whether AI scoring succeeded, fell back, or was unavailable
- actionable errors for missing/invalid credentials
- retryable rate-limit/network messages

Do not display API keys or raw server responses.

### Task 12: Verify profile save before search

**File:** `src/JobsView.jsx`

The current `runSearch` calls `saveProfile()` but does not verify its result before starting the search. Change the save function to return a success/failure result or throw on failure. Only invoke search after profile and resume persistence succeeds.

Do not close the profile panel or show “saved” when persistence failed.

---

## Phase 4: Tests before final verification

### Task 13: Add unit tests for provider behavior

**Files:** repository-equivalent test directory; follow existing conventions.

Add mocked tests for:

- HTTP 200 with jobs returns normalized jobs
- HTTP 200 with zero jobs is a valid empty result
- 401/403 returns unauthorized error
- 429 returns retryable rate-limit error
- 500 returns retryable provider error
- timeout/network failure returns network error
- malformed JSON returns invalid-response error
- missing credentials returns not-configured error
- query and location parameters are correct
- credentials never appear in returned diagnostics

Do not call the live API in the test suite.

### Task 14: Add regression tests for result projection

Test that:

- jobs remain visible when AI matches are empty
- jobs with matching AI results are joined by external ID
- numeric and string external IDs join correctly
- missing AI results show an unknown/unscored state
- zero jobs and provider failure display as different states

### Task 15: Add IPC/credential tests where practical

Verify:

- empty credentials are rejected
- successful save returns status without the key
- get-status returns only configured/email
- search reads credentials from the main process
- no credential is passed to the renderer result

Use temporary user-data paths or mocks. Never use the exposed key in committed tests.

---

## Phase 5: Required verification

Run from:

```bash
cd /c/Users/joshr/OneDrive/Desktop/hermes/anthropic-certification-native
```

Required commands:

```bash
npm test                 # only if package.json defines it
npm run build
node --check electron/main.cjs
node --check electron/preload.cjs
node --check electron/job-search.cjs
node --check electron/job-matcher.cjs
git diff --check
```

Then launch the actual app and perform this manual smoke test:

1. Open Jobs.
2. Open Profile & resume.
3. Enter a target role, such as `artificial intelligence`.
4. Enter a valid replacement USAJOBS email and API key.
5. Click **Save credentials**.
6. Click **Test connection** and verify HTTP 200 with a positive count.
7. Save the profile.
8. Click **Find 10 jobs**.
9. Confirm visible job cards appear.
10. Confirm the status says how many jobs were fetched.
11. Confirm AI scoring is either displayed or clearly marked unavailable/fallback.
12. Save one result to the pipeline.
13. Restart the app.
14. Confirm the saved pipeline record remains.

Record real results for each step. A passing Vite build alone is not sufficient.

---

## Definition of done

- USAJOBS credentials can be entered as real strings, saved securely, and tested.
- The exposed key is not present in source, logs, tests, or commits.
- The app’s actual Electron IPC search returns live USAJOBS jobs.
- A provider error is not mislabeled as zero jobs.
- Jobs remain visible when AI ranking is unavailable.
- AI ranking failures use the existing fallback instead of hiding successful API results.
- Search diagnostics are safe and actionable.
- Focused tests pass.
- Existing app build passes.
- Actual Electron smoke test confirms visible jobs.
- No automatic application submission or unrelated feature changes are introduced.

**Stop condition:** After the complete runtime smoke test passes, stop. Do not add a second provider, scheduling, document generation, or unrelated UI polish in this fix.