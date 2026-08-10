# Hermes Handoff: AI-Only Job Search Issue

> **Document status:** active handoff · **Scope:** AI-only job-search debugging · **Last verified:** 2026-08-10 · **Loading:** read only for job-search tasks; source and fresh runtime evidence outrank this handoff.

Date: 2026-08-10
Repository: `C:\Users\joshr\OneDrive\Desktop\hermes\anthropic-certification-native`

This is a complete debugging handoff. It intentionally excludes API keys, app IDs, private credentials, `.env` contents, and the encrypted credential file contents.

## Goal

Make AI-only searches work across USAJOBS, Adzuna, Remotive, and Arbeitnow, with at least three real AI-selected jobs per provider and visible source labels.

The intended contract is:

- AI creates provider-specific queries for all four providers.
- Production does not generate fallback queries.
- Retrieval, filtering, AI-selected, required, and highest-match counts are separate.
- At least three AI-selected jobs are required per provider.
- Exactly two per provider are marked highest matches.

## Current user-visible failure

The user reported:

```text
Error invoking remote method 'jobs:search': Error: AI search planning failed. No provider requests were generated.
```

This happens before provider requests are started. It is in the OpenRouter/AI planning stage, not the Adzuna request stage.

The planner was subsequently patched to expose the actual OpenRouter/parser error, but no fresh live Electron search was run after that patch. Restart Electron before testing; main-process changes are not loaded by a renderer-only reload.

## Confirmed database path

```text
C:\Users\joshr\AppData\Roaming\ClaudeArchitectStudyCoachNative\executive-coach.sqlite
```

SQLite sidecar files:

```text
executive-coach.sqlite-wal
executive-coach.sqlite-shm
```

Electron config in `electron/main.cjs` sets:

```js
app.setPath('userData', path.join(app.getPath('appData'), 'ClaudeArchitectStudyCoachNative'));
```

Encrypted source credentials are stored separately at:

```text
C:\Users\joshr\AppData\Roaming\ClaudeArchitectStudyCoachNative\job-source-credentials.json
```

Do not print, inspect publicly, commit, or include that file in a handoff.

## Relevant files

```text
electron/job-search-planner.cjs   AI prompt, parser, provider validation
electron/job-search.cjs           provider retrieval and diagnostics recording
electron/adzuna-provider.cjs      Adzuna request construction and normalization
electron/public-job-providers.cjs Remotive and Arbeitnow providers
electron/job-matcher.cjs          AI ranking
electron/main.cjs                 OpenRouter wrapper and jobs:search IPC
electron/database.cjs              SQLite database and search diagnostics
electron/migrations/0004_job_search_diagnostics.sql
src/JobsView.jsx                  search UI/reporting
test/job-search-planner.test.cjs
test/job-search.test.cjs
test/adzuna-provider.test.cjs
```

## Previously confirmed successful run

Latest run recorded before the planner failure:

```text
Run ID: search-run-ea0d56f1-27a8-4fce-a33b-d07e2563b1e4
Status: completed
Started: 2026-08-10T07:00:29.844Z
Finished: 2026-08-10T07:00:33.071Z
Result count: 14
Warning: 4 job-source requests failed; available results are still shown.
```

Provider summary:

| Provider | Attempts | Retrieved count sum | Status | Lanes |
|---|---:|---:|---|---|
| USAJOBS | 8 | 8 | 200 | `usajobs-ai-dallas`, `usajobs-forward-deploy-dallas`, `usajobs-ai-austin`, `usajobs-forward-deploy-austin` |
| Adzuna | 4 | 0 | 400 | `adzuna-ai-dallas`, `adzuna-ai-austin` |
| Remotive | 2 | 38 | 200 | `remotive-ai`, `remotive-forward-deploy` |
| Arbeitnow | 2 | 100 | 200 | `arbeitnow-ai-dallas`, `arbeitnow-ai-austin` |

Prior run:

```text
Run ID: search-run-6e63f89e-57ad-4667-a2f2-73edf850aeb8
Status: completed
Result count: 18
Warning: 4 job-source requests failed; available results are still shown.
```

USAJOBS, Remotive, and Arbeitnow worked in both runs. Adzuna failed in both.

## Adzuna evidence

All four Adzuna requests returned HTTP 400. Before the latest request-shape patch, sanitized diagnostics stored:

```json
{
  "results_per_page": "50",
  "sort_by": "date",
  "what": "AI artificial intelligence machine learning forward deploy engineer",
  "where": "Dallas, Texas",
  "page": "1"
}
```

Austin used the same query with `where: "Austin, Texas"`.

The body was an HTML error page beginning approximately:

```text
<!DOCTYPE html>
<!-- This file is managed by Chef -->
<title>Uh oh, something isn't right</title>
```

No useful Adzuna JSON error identified credentials versus endpoint versus parameters.

### Adzuna patch already made

`electron/adzuna-provider.cjs` was changed to:

- remove query-string `page`;
- keep page in `/search/{page}` URL path;
- add `content-type=application/json` query parameter;
- support AI lane `what`, `where`, and `salaryMin`;
- continue excluding `app_id` and `app_key` from persisted diagnostics;
- retain credentials only in the actual request URL.

The next live run must confirm the new status/request. The database still contains only the old request because no new provider run occurred after the patch.

## Planner failure details

`electron/job-search-planner.cjs` calls the OpenRouter function passed from `electron/main.cjs`:

```js
const response = await openRouter(messages, { max_tokens: 1800 });
```

The OpenRouter wrapper uses:

- `process.env.OPENROUTER_API_KEY`
- `process.env.OPENROUTER_MODEL` or the default model
- `https://openrouter.ai/api/v1/chat/completions`
- bearer authorization
- JSON content type
- 30-second timeout

The `.env` file is loaded at startup if present:

```text
C:\Users\joshr\OneDrive\Desktop\hermes\anthropic-certification-native\.env
```

Do not print or commit its contents.

### Original problematic code behavior

The planner caught every OpenRouter/parser failure and discarded the cause:

```js
try {
  const response = await openRouter(messages, { max_tokens: 1800 });
  brief = parseSearchBriefResponse(response, profile);
} catch {
  brief = null;
}
if (!brief) throw new Error('AI search planning failed. No provider requests were generated.');
```

This made HTTP failures, missing keys, timeouts, malformed JSON, truncated JSON, and missing provider lanes look identical.

### Planner patch already made

`electron/job-search-planner.cjs` now:

- preserves `response.error` from OpenRouter;
- reports a parser-specific error for an `ok: true` response without valid JSON;
- reports thrown exception messages;
- accepts string `message.content`;
- accepts arrays of content parts with `.text`;
- strips an outer ```` ```json ... ``` ```` fence;
- still rejects any plan missing a provider query array.

Expected improved errors:

```text
AI search planning failed. No provider requests were generated. OpenRouter request failed (401).
```

or:

```text
AI search planning failed. No provider requests were generated. OpenRouter returned a response that was not valid planner JSON.
```

## Planner contract

The AI must return JSON with `searchBrief` and `providerQueries`. Provider query arrays are required for:

```text
usajobs
adzuna
remotive
arbeitnow
```

Validation currently requires:

- USAJOBS position-title lane: `positionTitle`.
- USAJOBS keyword-support lane: `keyword`.
- Adzuna: `what`.
- Adzuna bare two-letter `where` values are rejected.
- Remotive: `search`, `category`, or `company_name`.
- Arbeitnow: application-side `searchTerms`.

`electron/job-search.cjs` rejects plans without:

```js
plan.source === 'ai'
```

with:

```text
AI-generated search plan required. Fallback searches are disabled.
```

That rejection is intentional, although several old unit fixtures had to be marked as AI plans after the contract changed.

## Tests currently passing

After the planner repair:

```text
node --test test/*.test.cjs
79 passed
0 failed
```

Focused planner/Adzuna run:

```text
13 passed
0 failed
```

Passed syntax checks for planner, search, Adzuna provider, main process, and tests. `npm run build` passed. Vite emitted only its existing CommonJS/ESM config warning.

## Unfinished requirements

These are not complete and must not be reported as complete:

1. Enforce at least three AI-selected jobs per provider in production.
2. Mark exactly two selected jobs per provider as highest matches.
3. Fail the run explicitly if any provider cannot meet its minimum.
4. Preserve all valid provider listings for AI ranking; do not discard USAJOBS through local relevance scoring.
5. Separate retrieved, valid, AI-selected, required, and highest-match counts in reports/UI.
6. Add end-to-end tests for provider minimums and AI selection validation.
7. Persist planner failures or a planner diagnostic record; currently `job_search_runs` is created only after planning succeeds.

## Known risks

### Stale Electron process

The user may be running an already-open Electron process. Restart the entire app after changing `electron/main.cjs` or planner code.

### Parser still may be incomplete

Inspect the new live response structure. Possible cases include:

- content object rather than string/array;
- nested content fields;
- explanatory text around JSON;
- refusal response;
- truncated JSON due to 1800 output-token limit;
- provider-specific finish reason.

Do not silently accept malformed plans. Add redacted structural diagnostics first.

### Prompt/output budget

The planner prompt is long and requires four provider query sets while requesting only `max_tokens: 1800`. Truncation is plausible. Check raw response metadata/finish reason before weakening validation.

### Planner failures are not in SQLite

Because the run is created after planning, the current database contains no row explaining the new planner failure. Add safe planner diagnostics if needed, without persisting credentials or raw sensitive prompt data.

## Recommended immediate procedure

1. Fully close and restart Electron.
2. Run one search.
3. Capture the new exact error.
4. Determine whether it is API key, HTTP status, timeout, malformed JSON, truncation, or missing provider lanes.
5. If parsing fails, log only a redacted structural summary: `ok`, content type, content length, model, usage, finish reason, and error message. Do not log keys or raw sensitive context.
6. If planning succeeds, inspect the new SQLite run and Adzuna attempts.
7. Confirm the new Adzuna request has no query `page` and has the intended fields.
8. Test Adzuna credentials separately through the existing source-test action.
9. Implement provider minimum enforcement only after planner/retrieval stability is restored.

## Useful commands

```powershell
node --test test/*.test.cjs
npm run build
node --check electron/job-search-planner.cjs
node --check electron/job-search.cjs
node --check electron/adzuna-provider.cjs
```

Query latest runs:

```powershell
@'
const Database=require('better-sqlite3');
const p=process.env.APPDATA+'\\ClaudeArchitectStudyCoachNative\\executive-coach.sqlite';
const db=new Database(p,{readonly:true});
console.log(db.prepare('select id,status,started_at,finished_at,result_count,warning from job_search_runs order by started_at desc limit 5').all());
db.close();
'@ | node -
```

Query latest Adzuna attempts:

```powershell
@'
const Database=require('better-sqlite3');
const p=process.env.APPDATA+'\\ClaudeArchitectStudyCoachNative\\executive-coach.sqlite';
const db=new Database(p,{readonly:true});
const run=db.prepare('select id from job_search_runs order by started_at desc limit 1').get();
console.log(db.prepare("select provider,lane_id,request_json,http_status,result_count,error_code,error_message,error_detail from job_search_attempts where run_id=? and provider='adzuna'").all(run.id));
db.close();
'@ | node -
```

## Bottom line

The last confirmed provider search was partially successful: USAJOBS, Remotive, and Arbeitnow returned results; Adzuna returned four HTTP 400 responses. The later user error occurred earlier, during AI planning, so Adzuna did not cause that specific planner error based on the current call path. The planner now exposes the underlying failure, but a fresh restarted Electron run is required to identify it. Minimum-three-provider selection enforcement remains unfinished.