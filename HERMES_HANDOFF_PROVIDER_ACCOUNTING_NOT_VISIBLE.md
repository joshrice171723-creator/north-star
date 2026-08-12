# Hermes Handoff: Provider AI Accounting Is Still Not Visible in the Search Report

> **Status:** urgent unresolved handoff
> **Date:** 2026-08-11
> **Repository:** `C:\Users\joshr\OneDrive\Desktop\hermes\anthropic-certification-native`
>
> The previous implementation added fields in the backend and renderer but was not verified against the actual runtime payload/rendered report. The user reports that the provider-level AI accounting still does not appear. Treat this document as the current source of truth and verify the live Electron result before claiming completion.

## User-visible failure

After a search where 18 jobs were submitted to OpenRouter and ranking parsing failed, the report still does **not** show the provider breakdown or the additional accounting fields. The expected information is:

```text
USAJOBS:   1 submitted · 0 assessed · 0 returned
Adzuna:   10 submitted · 0 assessed · 0 returned
Remotive:  5 submitted · 0 assessed · 0 returned
Arbeitnow: 2 submitted · 0 assessed · 0 returned
Total:    18 submitted
```

The report also needs to show, per provider:

```text
API requests
raw jobs returned
unique jobs
filtered jobs
sent to AI / submitted
assessed
AI returned
shown / fallback results
failed requests
```

The user specifically says the report had “a couple more fields” than the text above. Preserve every existing request-level field; do not replace the request details with a summary-only display.

## Important correction to prior work

The prior agent claimed this was fixed after unit tests and a Vite build. That claim was premature. Unit tests only proved that an isolated `rankJobs()` error had `rankingDiagnostics`; they did not prove that the real IPC response was received by the renderer or that the displayed `SearchSourceReport` received the same object.

Do not mark this complete based only on:

- `node --test` passing;
- `node --check` passing;
- `npm run build` passing;
- a static grep showing `providerCounts` or `aiAssessed`.

The fix must be verified with a real or instrumented `jobs:search` IPC result and a rendered UI assertion/manual screenshot.

## Relevant current code

### Backend

`C:\Users\joshr\OneDrive\Desktop\hermes\anthropic-certification-native\electron\job-matcher.cjs`

- `providerRankingCounts(...)` was added near `selectJobsDeterministically(...)`.
- On failure, `cause.rankingDiagnostics.providerCounts` is populated.
- On success, `selected.rankingDiagnostics.providerCounts` is attached as a non-enumerable property.

`C:\Users\joshr\OneDrive\Desktop\hermes\anthropic-certification-native\electron\main.cjs`

Relevant flow is approximately lines 597–638:

1. `rankJobs(...)` runs.
2. On failure, `rankingError = { ..., diagnostics: cause.rankingDiagnostics || null }`.
3. Retrieval fallback is created in `ranked`.
4. `sourceStats` is mapped using `rankingProviderCounts`.
5. The IPC result returns `sourceStats` and `ranking: { ..., diagnostics: rankingDiagnostics }`.

Potential defects to investigate:

- `rankingDiagnostics` is selected from `ranked.rankingDiagnostics || rankingError?.diagnostics`; after a failure, `ranked` is replaced with a normal fallback array, so the error diagnostics must survive only through `rankingError`.
- The top-level `counts.aiSubmitted` is currently set to `relevantCount`, not the actual ranking submitted count. Do not use that top-level field for provider display.
- `sourceStats` may be generated correctly in main-process memory but lost, normalized, or overwritten by the preload/renderer boundary.
- Confirm that `rankingError?.diagnostics?.providerCounts` survives structured cloning through Electron IPC.
- Confirm that `sourceStats` is the exact property consumed by the renderer, rather than a different normalized report object.

### Renderer

`C:\Users\joshr\OneDrive\Desktop\hermes\anthropic-certification-native\src\JobsView.jsx`

- `SearchSourceReport` is near the top of the file and renders the provider summary.
- `RankingReport` is near lines 61–72 and renders `ranking.diagnostics.providerCounts`.
- The prior change added `aiAssessed`, `aiReturned`, and provider ranking text to JSX.

Potential defects to investigate:

- Find the exact call site that renders `SearchSourceReport` and log/inspect the `item` object there. Verify it is using the returned `sourceStats`, not an older `diagnostics.sources`, `counts`, or locally derived array.
- Verify the report passed to the renderer contains `ranking`, `sourceStats`, and `attemptsDiagnostics` after `window.electron`/preload serialization.
- Verify the provider key labels. The internal key is `usajobs`, while the display label is likely `USAJOBS / federal jobs`; do not render a blank row because of a key mismatch.
- Ensure zero-count providers are rendered. The user needs all four sources even when assessed/returned values are zero.
- If the ranking panel is conditionally hidden when ranking is unavailable, make it visible/open for the failed-ranking fallback state.
- Check CSS/layout. A long inline `<span>` may wrap or be clipped; use explicit rows/table/grid if necessary.

## Required debugging procedure

1. Read `PROJECT_BRIEF.md`, `.hermes/DOCUMENT_INDEX.md`, git status, and this file.
2. Inspect the complete `jobs:search` IPC handler, preload bridge, renderer search state assignment, and the JSX call site for `SearchSourceReport`.
3. Add temporary, safe diagnostics that log **counts and keys only**, never job descriptions, credentials, authorization headers, or response bodies.
4. Run an instrumented search or a deterministic test fixture with exactly 18 jobs:

   ```js
   {
     usajobs: 1,
     adzuna: 10,
     remotive: 5,
     arbeitnow: 2
   }
   ```

   Make OpenRouter return valid JSON containing only 17 assessments, so the failure is `ranking_incomplete_response`, not malformed JSON.
5. Inspect the object at each boundary:

   ```text
   rankJobs error.rankingDiagnostics
   main-process rankingError / sourceStats / final IPC return
   preload jobs:search resolved value
   renderer report state
   SearchSourceReport item prop
   RankingReport ranking prop
   ```

6. Add a renderer/component-level regression test or an equivalent deterministic extraction test proving the actual displayed labels and values.
7. Start/restart Electron and verify the visible report manually. Record the exact command used and the observed output.

## Acceptance criteria

The task is complete only when all are true:

- A failed/truncated OpenRouter response does not erase provider attribution.
- The actual Electron search report visibly shows all four providers.
- For the 18-job fixture it visibly shows `1 / 10 / 5 / 2` submitted and total `18`.
- It visibly shows assessed and AI-returned counts, including zeroes.
- It visibly shows API requests, raw returned, unique, filtered, sent-to-AI, assessed, AI-returned, shown/fallback, and failed counts.
- Provider request details remain expandable and retain HTTP status and result counts.
- OpenRouter HTTP success plus parser failure remains distinct from transport failure.
- No secrets or raw provider payloads are added to logs or UI diagnostics.
- Focused tests pass, full tests pass, syntax checks pass, build passes, and the Electron app is restarted and manually verified.

## Files changed by the previous attempt

The prior attempt modified these relevant files:

- `C:\Users\joshr\OneDrive\Desktop\hermes\anthropic-certification-native\electron\job-matcher.cjs`
- `C:\Users\joshr\OneDrive\Desktop\hermes\anthropic-certification-native\electron\main.cjs`
- `C:\Users\joshr\OneDrive\Desktop\hermes\anthropic-certification-native\src\JobsView.jsx`
- `C:\Users\joshr\OneDrive\Desktop\hermes\anthropic-certification-native\test\job-matcher.test.cjs`

Review the diff before changing behavior. Keep unrelated existing work intact. Do not assume the previous changes are correct merely because the test suite passed.

## Handoff instruction

Hermes should take ownership of this issue, trace the live data through every boundary, correct the first point where the provider accounting disappears, and verify the rendered Electron UI. Do not send back a “tests/build pass” completion without visible runtime confirmation.