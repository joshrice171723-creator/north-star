# North Star bug report

Date: 2026-08-18

Scope: static review of the current Electron/React source, focused tests, and production build. No application source was changed during this review.

## Verification summary

- `npm run build`: passed.
- `node --check electron/main.cjs; node --check electron/preload.cjs`: passed.
- `node --test test/*.test.cjs` equivalent PowerShell invocation: 210 tests total, 208 passed, 2 failed.
- The two failing tests are included at the end as test-suite maintenance findings; they do not both prove user-facing runtime failures.

## Confirmed or high-confidence application bugs

### BUG-001 — External-account passwords cross the IPC boundary and are rendered as plain text

- Severity: Critical
- Files/lines: `electron/main.cjs:67-70`, `electron/main.cjs:1331`, `src/jobs/ApplicationBrowserPanel.jsx:27-30`
- Description: `externalAccountCredentialStatus()` decrypts and returns the saved password. The `jobs:applications:external-account:get` handler sends that object to the renderer, and `ExternalAccountDock` copies the password into React state and renders the password field with `type="text"`.
- Likely cause: the credential status DTO was implemented by returning the full decrypted credential instead of a status-only DTO; the UI then used the returned password to prefill edits.
- Expected behavior: the renderer should receive only non-secret metadata such as `configured`, `host`, `username`, and secure-storage status. A saved password should never be returned from IPC or placed in renderer state.
- Desired behavior: display a masked password input that starts blank. Saving a blank password should either preserve the existing secret or require an explicit “replace/clear password” action.
- Potential fix: remove `password` from `externalAccountCredentialStatus()` and from the `get` IPC response; change the account UI input to `type="password"`; add a main-process save path that preserves the existing secret when the user leaves the replacement field blank. Add a regression test asserting that the GET response has no `password` property.

### BUG-002 — External-account credentials fall back to plaintext when OS secure storage is unavailable

- Severity: High
- Files/lines: `electron/main.cjs:67-69`
- Description: `writeExternalAccountCredentials()` uses the raw `credentials` object when `safeStorage.isEncryptionAvailable()` is false. The resulting JSON file therefore contains the username and password in plaintext, despite the product rule that approved credentials must be OS-backed and encrypted.
- Likely cause: a convenience fallback was added for storage availability instead of failing closed, while the other credential stores already reject saves when encryption is unavailable.
- Expected behavior: saving an external account should fail with a clear message when OS-backed encryption is unavailable; existing encrypted credentials should remain untouched.
- Desired behavior: no credential file should contain plaintext secrets under any runtime condition.
- Potential fix: reject `saveExternalAccountCredentials()` before writing when `safeStorage` is unavailable; detect and quarantine/remove any legacy plaintext credential file only with an explicit migration policy; add a test for the unavailable-storage branch.

### BUG-003 — New employer/ATS hosts are auto-approved even though the UI promises a user checkpoint

- Severity: High
- Files/lines: `electron/jobs/application-browser.cjs:50-59`, `electron/jobs/application-browser.cjs:73-76`, `electron/jobs/application-browser.cjs:108`, `src/jobs/ApplicationBrowserPanel.jsx:55`
- Description: when navigation reaches a new HTTPS host, `requestNavigation()` adds the host to `approvedHosts` and immediately loads it. The code never sets `active.pendingHost` or `active.pendingUrl`, so the renderer's “Allow secure application host?” checkpoint cannot appear. The pure `decideNavigation()` unit test returns `ask_user`, but the actual navigation handler bypasses that result.
- Likely cause: the implementation changed the handoff policy to automatic approval, but the pending-navigation state and UI were left in place.
- Expected behavior: a job-board-to-ATS redirect to a new host should pause and show the exact domain before loading it.
- Desired behavior: only the user-approved host is added to the session allowlist; denied or unreviewed hosts remain blocked.
- Potential fix: on `ask_user`, store `pendingHost` and `pendingUrl`, publish state, and do not call `loadURL`; let `approveHost()` perform the load after an exact host match. If automatic approval is intentional, remove the misleading checkpoint UI and update the security contract/tests instead.

### BUG-004 — Browser IPC validates application IDs but does not bind requests to the active application session

- Severity: High
- Files/lines: `electron/main.cjs:1341-1346`, `electron/main.cjs:1404`, `electron/jobs/application-browser.cjs:42`, `electron/jobs/application-browser.cjs:108`
- Description: the browser is a singleton (`active` holds one session). `jobs:browser:snapshot` validates the requested `applicationId` but returns `applicationBrowser.publicState()` without comparing it to that ID. Submission confirmation also validates the supplied ID but records `applicationBrowser.publicState().currentUrl`, which can belong to a different active application after a stale panel or overlapping request.
- Likely cause: input-shape validation was added without an active-session ownership check.
- Expected behavior: a browser snapshot, fill plan, navigation action, or confirmation should either operate on the requested application or fail with a session-mismatch error.
- Desired behavior: stale UI calls cannot display another application's page or attach another application's URL to the current submission record.
- Potential fix: add a `requireActiveApplication(applicationId)` helper and use it in snapshot/rescan/fill/confirmation handlers; close or replace the current browser view before opening another application; add a race/stale-request test.

### BUG-005 — The application assistant can show missing selected-file paths even when paths are persisted

- Severity: Medium
- File/lines: `src/jobs/ApplicationBrowserPanel.jsx:13-21`, `src/jobs/ApplicationBrowserPanel.jsx:40`, `src/jobs/ApplicationBrowserPanel.jsx:55`
- Description: `DocumentDock` accepts an `application` prop and initializes `resolvedApplication` from it, but the caller renders `<DocumentDock>` without passing `application={application}`. The fallback fetch depends on the mutable global `window.__activeApplicationId`; when the parent later loads the application, `resolvedApplication` is not synchronized from the newly available application prop. The selected resume/cover-letter path labels can therefore remain on “No selected ... exists” while the database has paths.
- Likely cause: the application prop was added to the component contract but omitted at the call site, leaving an asynchronous global fallback as the only source of truth.
- Expected behavior: the assistant should display the selected resume and cover-letter paths for the current application after its initial load.
- Desired behavior: file-path status updates whenever the current application changes or documents are selected.
- Potential fix: pass `application={application}` at the call site and render that prop directly, or synchronize `resolvedApplication` whenever the prop changes; remove the global fallback if it is no longer needed.

### BUG-006 — The ATS indicator is permanently shown as “unknown”

- Severity: Medium
- Files/lines: `src/jobs/ApplicationBrowserPanel.jsx:55`, `electron/jobs/application-browser.cjs:108`, `electron/jobs/application-inspector.cjs:15-20`
- Description: the renderer displays `state.atsKey`, but `publicState()` never returns an `atsKey` field and `normalizeSnapshot()` does not create one. The displayed ATS value is therefore always the fallback `unknown`.
- Likely cause: the UI retained an older ATS field after the browser public-state contract was reduced to page and field metadata.
- Expected behavior: the assistant should show a detected ATS when one is available, or omit the label when detection is unavailable.
- Desired behavior: the value shown in the UI must be backed by the current public-state contract.
- Potential fix: implement bounded ATS detection from the approved host/page metadata and return it from `publicState()`, or remove the ATS label and add a clear “not detected” state.

### BUG-007 — Search-result merging can drop jobs from different providers that reuse an external ID

- Severity: Medium
- Files/lines: `src/JobsView.jsx:46-52`, `src/JobsView.jsx:533`, `src/JobsView.jsx:655`, `electron/job-search.cjs:88,196`
- Description: `mergeRankedMatches()` keys results only by `job.externalId`. USAJOBS, Dice, Adzuna, Greenhouse, and other providers can independently issue the same listing ID. A refinement or appended search can therefore overwrite one provider's result with another's; the React list also uses only `externalId` as its key. The backend already treats identity as provider plus listing ID, which makes the frontend mismatch visible in the source.
- Likely cause: provider identity was omitted from the renderer merge/key helper even though the search layer uses a provider-qualified identity.
- Expected behavior: two listings with the same external ID but different providers remain separate candidates and retain their own scores, links, and save actions.
- Desired behavior: every displayed candidate is keyed by a stable provider-qualified identity.
- Potential fix: use a shared helper such as `${providerKey}:${externalId || canonicalUrl}` for merge maps, React keys, and any result lookup; add a test with two providers returning the same external ID.

### BUG-008 — Duplicate company/role cards receive the wrong contact and notification metadata

- Severity: Medium
- File/lines: `src/JobsView.jsx:584-588`, `src/JobsView.jsx:590-605`, `src/JobsView.jsx:617-625`
- Description: a React-rendered card is keyed by `job.id`, but the post-render DOM augmentation locates cards using only the visible company and role text. If two pipeline records have the same company and role, notifications, phone/email metadata, and title-click navigation are attached to the first matching card rather than the correct job.
- Likely cause: imperative DOM updates use display text as identity instead of the card's stable job ID.
- Expected behavior: each card shows only its own unread counts/contact information, and clicking its title opens that exact job record.
- Desired behavior: duplicate role/company records remain independently addressable.
- Potential fix: render badges, contact metadata, and title navigation declaratively in the card JSX, or add a `data-job-id` attribute and query by the stable ID. Avoid `document.querySelectorAll()` mutations for React-owned content.

### BUG-009 — Manually moving a pipeline card to “Applied” does not record `appliedAt`

- Severity: Medium
- Files/lines: `src/JobsView.jsx:355-384`, `electron/main.cjs:1264`, `electron/database.cjs:231-243`, `electron/database.cjs:318`
- Description: the board stage selector calls the lightweight `update-stage` IPC path. `updateJobStage()` updates only `stage` and `updated_at`; it does not set `applied_at`. The separate confirmed-submission path does set `applied_at`, so the same “Applied” state has different persistence depending on which UI path the user used.
- Likely cause: the manual stage-transition path was implemented separately from submission completion and does not share the applied-date invariant.
- Expected behavior: a manually applied job should have a persisted application date, or the user should be required to use the confirmation/application workflow instead of directly selecting Applied.
- Desired behavior: stage, application date, application status, and follow-up behavior remain consistent across all supported paths.
- Potential fix: either block direct movement to Applied and route the user to the application workflow, or update `updateJobStage()` transactionally to set `applied_at` when entering Applied and add the corresponding application record/status rules. Add tests for both manual and confirmed transitions.

## Test-suite maintenance findings

### TEST-001 — Application-view test asserts obsolete copy, not the current behavior

- Severity: Low (test maintenance)
- File/line: `test/job-application-view.test.cjs:4`
- Description: the test requires the strings `Verified name fields` and `Save verified names`, but the current component has separate first/last-name inputs and uses the current copy `VERIFIED PROFILE` / `Save verified fields` at `src/jobs/ApplicationBrowserPanel.jsx:54-55`.
- Likely cause: the UI copy changed without updating a brittle source-text assertion.
- Expected behavior: the test should verify separate accessible first- and last-name controls and the save action, not exact historical wording.
- Desired behavior: the test passes while still protecting the name-field contract.
- Potential fix: assert the field definitions or rendered accessibility labels, or update the expected strings if the old copy is still required.

### TEST-002 — Profile hydration test relies on an obsolete implementation pattern

- Severity: Low (test maintenance)
- File/line: `test/jobs-profile-persistence.test.cjs:12`
- Description: the test searches for one exact `setProfile` source string. The implementation now performs equivalent normalization through a `restored` object and returns a merged profile at `src/JobsView.jsx:487`; the exact regex no longer matches even though the controlled input still uses `profileValue(profile[key])` at `src/JobsView.jsx:42`.
- Likely cause: the test couples behavior to a prior one-line implementation rather than exercising `normalizeProfileLists()` or rendering the component.
- Expected behavior: persisted list values should load into controlled fields and remain editable.
- Desired behavior: the test validates the observable hydration behavior and survives harmless refactors.
- Potential fix: unit-test the exported normalization helper and use a component/integration test for hydration; remove the exact source-text regex.

