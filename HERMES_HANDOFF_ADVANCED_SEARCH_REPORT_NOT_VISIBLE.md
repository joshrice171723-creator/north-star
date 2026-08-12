# Hermes Handoff: Advanced Search Report Not Visible

## User-reported issue

The expandable advanced search report was implemented, but the user still cannot see it in the running application.

## Intended behavior

After running a job search, the Jobs view should show a visible, expandable **Advanced search report** section. It should expose:

- API method
- Safe URL
- Query parameters/request data
- Request headers
- Request body
- Response status
- Response headers
- Response body
- Duration and errors
- First two jobs returned for each provider request

## Files changed for the attempted restoration

- `C:\Users\joshr\OneDrive\Desktop\hermes\anthropic-certification-native\src\JobsView.jsx`
- `C:\Users\joshr\OneDrive\Desktop\hermes\anthropic-certification-native\src\styles.css`
- `C:\Users\joshr\OneDrive\Desktop\hermes\anthropic-certification-native\electron\main.cjs`
- `C:\Users\joshr\OneDrive\Desktop\hermes\anthropic-certification-native\test\jobs-view-error.test.cjs`

## Current renderer implementation

`src/JobsView.jsx` contains:

```jsx
{searchReport && <details className="job-search-report">
  <summary>
    <b>Advanced search report</b>
    ...
  </summary>
  ...
</details>}
```

Provider previews are capped in the renderer with:

```js
const preview = Array.isArray(attempt.preview)
  ? attempt.preview.slice(0, 2)
  : [];
```

The low-level API section is rendered by `ApiCallReport`.

## Current backend implementation

In `electron/main.cjs`, after `searchJobs` completes:

```js
const attempts = coachDatabase.listJobSearchAttempts(runId);
found.diagnostics = { ...found.diagnostics, runId, attempts };
found.attemptsDiagnostics = attempts;
```

Successful searches return:

```js
return {
  ok: true,
  ...found,
  sourceStats,
  warning,
  jobs: found.jobs,
  searchPlan: plan,
  apiCalls,
  rankingBatches,
  ...
};
```

All-provider failures now return their persisted diagnostics too:

```js
return {
  ok: false,
  ...found,
  searchPlan: plan,
  apiCalls
};
```

## Most likely causes to investigate

### 1. The app is running a stale renderer bundle

Run:

```powershell
cd C:\Users\joshr\OneDrive\Desktop\hermes\anthropic-certification-native
npm run build
```

Then fully restart Electron. Verify the loaded renderer bundle contains the text:

```text
Advanced search report
```

Do not rely only on hot reload if Electron is loading a packaged or cached renderer.

### 2. The report is collapsed

The current markup intentionally uses a collapsed `<details>` element. If the summary is visible but closed, click it. To make it open by default, change:

```jsx
<details className="job-search-report">
```

to:

```jsx
<details className="job-search-report" open>
```

If the summary itself is not visible, this is not just a collapsed-details issue.

### 3. `searchReport` is never populated

Temporarily log the IPC result in `src/JobsView.jsx`, immediately after `searchJobs`:

```js
const result = await window.desktopShell?.searchJobs?.();
console.log('[JobsView] search result', result);
console.log('[JobsView] report fields', {
  ok: result?.ok,
  attempts: result?.attemptsDiagnostics,
  diagnostics: result?.diagnostics,
  apiCalls: result?.apiCalls,
  sourceStats: result?.sourceStats,
});
```

The renderer currently only sets the report on failure if diagnostics exist:

```js
if (!result?.ok) {
  if (result?.attemptsDiagnostics || result?.apiCalls) setSearchReport(result);
  ...
}
```

### 4. The preload bridge is stale or mismatched

Inspect:

```text
C:\Users\joshr\OneDrive\Desktop\hermes\anthropic-certification-native\electron\preload.cjs
```

Confirm it exposes:

```js
searchJobs: () => ipcRenderer.invoke('jobs:search')
```

Also confirm the running Electron window uses this preload file.

### 5. The report exists in the DOM but is hidden by CSS

Use Electron/Chromium devtools and search the DOM for:

```html
<details class="job-search-report">
```

Interpretation:

- No element: `searchReport` is null or the running bundle is stale.
- Element exists and summary is visible: click the summary; it is collapsed intentionally.
- Element exists but is invisible: inspect computed styles and later CSS rules.
- Element exists but is empty: inspect the runtime IPC payload fields.

Search for conflicting rules affecting:

- `details`
- `summary`
- `.job-search-report`
- `.job-search-report-body`

## Backend logging to add temporarily

Before the successful return in `electron/main.cjs`:

```js
console.log('[jobs:search] report payload', {
  ok: true,
  attempts: found.attemptsDiagnostics?.length,
  apiCalls: apiCalls?.length,
  sourceStats: sourceStats?.length,
});
```

Before the all-provider-failure return:

```js
console.log('[jobs:search] failed report payload', {
  attempts: found.attemptsDiagnostics?.length,
  apiCalls: apiCalls?.length,
});
```

## Validation already completed

- Full test suite: 99 passed
- Focused report/search tests: 42 passed
- `npm run build`: passed
- Node syntax checks: passed
- `git diff --check`: passed

These checks do not prove that the running Electron instance is loading the edited renderer or that the runtime IPC object has the expected shape.

## Important working-tree warning

The repository already contains substantial pre-existing job-search work. Preserve unrelated changes. Do not reset the working tree.

## Recommended next action

First determine which of these is true:

1. `.job-search-report` is absent from the DOM.
2. It is present but collapsed.
3. It is present but hidden by CSS.
4. It is present but has no report data.
5. The running renderer is stale.

The fastest discriminator is a devtools DOM search for `.job-search-report` plus a console log of the actual `window.desktopShell.searchJobs()` result.