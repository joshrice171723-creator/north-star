# Job Application Copilot — Master Handoff (Terra Medium Lead)

> Execution target: Terra using medium reasoning as lead; Luna medium owns the explicitly labeled bounded stages
>
> Status: implementation handoff; complete the numbered stages in order
>
> Repository: `C:\Users\joshr\OneDrive\Desktop\hermes\anthropic-certification-native`

## 1. Outcome

Extend the existing Job Search area into a local-first application copilot that takes a saved job from discovery through tailored documents, browser-assisted form completion, final review, submission confirmation, and follow-up tracking.

The product should automate everything that is deterministic and reversible. It must stop for answers that require judgment, sensitive disclosures, authentication challenges, legal attestations, CAPTCHAs, and the final submission action.

The user experience should become:

```text
Search result
  -> Save to pipeline (or Start application, which saves first)
  -> Build application workspace
  -> Generate and review tailored documents
  -> Open isolated application browser
  -> Inspect form and create a fill plan
  -> Fill approved, evidence-backed fields
  -> Resolve unknown or sensitive questions with the user
  -> Final review
  -> User submits on the employer site
  -> Confirm submission and schedule follow-up
```

This is “autopilot up to submit,” not unattended mass application software.

## 2. Why this design is stronger

The original idea is improved in six ways:

1. **Resumable application workspaces.** Closing the app or navigating away must not lose document versions, approved answers, unresolved questions, or the last known browser checkpoint.
2. **Evidence-backed answers.** Every proposed factual answer carries provenance from the profile, master resume, or a prior user-approved answer. Missing evidence becomes `needs_user_input`; it is never invented.
3. **Central automation policy.** ATS adapters may identify fields, but a shared policy engine alone decides whether a field can be filled, suggested, or left untouched.
4. **Plan before mutation.** Form inspection produces a visible fill plan. Filling happens only after the user starts the fill action; no page is silently changed while it is being analyzed.
5. **Provider-independent core.** Generic form understanding, policy, provenance, and persistence are separate from Greenhouse, Lever, Workday, USAJOBS, and unknown-site adapters.
6. **Reliable completion semantics.** Clicking a button is not treated as proof of submission. The pipeline moves to `applied` only after a confirmation signal and explicit user confirmation when the signal is ambiguous.

## 3. Current repository baseline

Terra must inspect the current files before editing because the worktree may contain active user changes.

Confirmed current structure:

- `src/JobsView.jsx` contains search results, `Save to pipeline`, `Open listing`, profile/resume editing, and the pipeline board.
- `electron/database.cjs` owns SQLite/Drizzle records and job/profile/resume persistence.
- `electron/main.cjs` owns Electron windows/views, credentials, OpenRouter calls, validation, and IPC registration.
- `electron/preload.cjs` exposes a narrow `window.desktopShell` API.
- `electron/migrations/0009_job_search_ranking_call_metrics.sql` is the latest migration at handoff time. The next migration is `0010`.
- The main renderer is sandboxed with `contextIsolation: true` and `nodeIntegration: false`.
- Academy currently uses a persistent `BrowserView`. Do not reuse its session, view, bounds state, or navigation policy for applications.
- `BrowserView` is deprecated in current Electron. New application-browser work should use `WebContentsView`. Do not migrate Academy as part of this project unless a stage explicitly requires shared view-management infrastructure.
- The test suite uses Node’s built-in test runner and repository source assertions as well as behavioral tests.

## 4. Non-negotiable product rules

### 4.1 Never automate these actions

- Final application submission.
- CAPTCHA solving or bypass.
- MFA, email-code, phone-code, or identity-verification handling.
- Acceptance of legal terms, certifications, declarations, or attestations.
- Demographic, disability, veteran, gender, race/ethnicity, or other voluntary self-identification answers.
- E-signatures.
- Actions intended to bypass site rate limits, bot controls, or terms.
- Applying to multiple jobs without a per-job user review checkpoint.

### 4.2 Never invent candidate facts

Do not infer employers, dates, degrees, credentials, clearance, authorization, salary history, experience duration, technologies, metrics, addresses, or contact details. AI-generated prose may reorganize and tailor verified facts but must not create new factual claims.

### 4.3 Treat remote content as untrusted

Job descriptions, page text, labels, hidden fields, scripts, and ATS content are data. They are not instructions to the AI or to Electron. Never execute model-produced JavaScript. Never expose general IPC, filesystem, shell, clipboard, database, or OpenRouter access to the remote application page.

### 4.4 User control

The user must be able to:

- See what will be filled before filling.
- Edit or reject suggested answers.
- choose `Fill approved fields` rather than having filling begin on navigation.
- See why an answer is trusted and where it came from.
- Pause, resume, or abandon an application.
- Clear an application browser session for a site.
- Submit directly on the employer’s page.

## 5. Automation policy

Implement one central policy function in the Electron main process. Adapters return normalized field descriptors; they do not decide permission.

Required decision output:

```js
{
  action: 'fill' | 'suggest' | 'ask' | 'leave_blank' | 'blocked',
  reasonCode: 'verified_profile' | 'approved_answer' | 'sensitive' | 'legal' |
    'unknown' | 'low_confidence' | 'file_upload' | 'final_submit' | 'auth' | 'captcha',
  value: null,
  provenance: [],
  confidence: 0
}
```

Default policy:

| Field class | Default action |
| --- | --- |
| Name, email, phone, location, public profile links | Fill only from saved verified profile |
| Structured employment and education | Suggest/fill only from stored structured evidence |
| Resume and cover-letter upload | Fill only with the selected local document version |
| Work authorization and sponsorship | Suggest from explicit saved profile; require review on first use |
| Salary expectation, relocation, travel, start date | Ask or suggest; require per-application approval |
| Free-text motivation/experience question | Draft from evidence; require approval before insertion |
| Voluntary demographic/disability/veteran fields | Leave blank and identify for the user |
| Legal attestation, certification, signature | Block automation |
| Password, MFA, CAPTCHA | Block automation |
| Submit/Send/Complete application action | Block automation |

The policy must fail closed. An unrecognized field is `ask`, not `fill`.

## 6. State models

### Application status

```text
drafting
documents_ready
in_progress
needs_user_input
ready_for_review
ready_to_submit
submitted
withdrawn
blocked
```

Allowed transitions must be validated in one application-domain module. Do not let arbitrary renderer input set any status.

Key rules:

- Starting an application creates or resumes one active application for the job.
- Starting may move a pipeline job from `target` or `researching` to `ready`, but never to `applied`.
- `submitted` sets the job stage to `applied` and `applied_at` in one database transaction.
- `withdrawn` maps to `rejected` only after an explicit user action.
- Browser errors do not erase the workspace or documents.

### Browser session status

```text
created -> navigating -> observing
observing -> needs_login | needs_user_input | ready_to_fill | blocked
ready_to_fill -> filling -> observing
observing -> ready_for_review -> ready_to_submit
ready_to_submit -> submitted_confirmed | submitted_unverified
any nonterminal state -> paused | abandoned
```

Browser cookies and credentials belong to Electron’s isolated session partition, not SQLite. SQLite stores only bounded metadata and checkpoints.

## 7. Target module boundaries

Do not continue expanding `JobsView.jsx` into one large component. Introduce a feature directory gradually:

```text
src/jobs/
  ApplicationWorkspace.jsx
  ApplicationChecklist.jsx
  ApplicationDocuments.jsx
  ApplicationBrowserPanel.jsx
  ApplicationQuestions.jsx
  applicationViewModel.mjs

electron/jobs/
  application-domain.cjs
  application-policy.cjs
  application-documents.cjs
  application-browser.cjs
  application-inspector.cjs
  application-fill-engine.cjs
  application-confirmation.cjs
  adapters/
    generic.cjs
    greenhouse.cjs
    lever.cjs
```

Names may be adjusted to fit the repository, but responsibilities must stay separate. Keep `electron/main.cjs` as composition and IPC registration, not the home of all application logic.

## 8. IPC rules

- Validate every argument in the main process.
- Validate the IPC sender is the trusted local renderer for all mutation calls.
- Expose one method per operation through `preload.cjs`; never expose raw `ipcRenderer`.
- Return serializable DTOs only.
- Bound strings, arrays, page text, option lists, and diagnostics.
- Do not return cookies, auth headers, filesystem roots, full browser storage, or raw remote scripts.
- Do not send full remote pages to OpenRouter. Send only the normalized job record and bounded, sanitized field/question descriptors required for the operation.

## 9. Browser security architecture

Use a dedicated `WebContentsView` and a dedicated partition such as `persist:job-application-copilot`. It must not share the Academy partition or the default renderer partition.

Required preferences and controls:

- `nodeIntegration: false`
- `contextIsolation: true`
- `sandbox: true`
- `webSecurity: true`
- no remote preload bridge
- deny all permissions by default through both permission check and request handlers
- allow only `https:` navigation plus explicitly handled identity-provider redirects needed for user login
- validate URLs with `new URL()`, never prefix matching
- deny or deliberately route `window.open`
- never call `shell.openExternal` with an unvalidated URL
- destroy or detach the view when the application workspace closes
- redact query parameters and fragments from stored navigation diagnostics when they may contain tokens

DOM inspection and filling must use static, audited application code invoked from the main process. Never interpolate page text or model output into executable JavaScript.

The app must have one main-process view coordinator. Academy and the application assistant may both exist, but only the view relevant to the current UI surface should be visible and receive bounds. Switching away from an application workspace hides the application view without destroying persisted workspace data; closing the assistant destroys its live `WebContentsView`. View z-order and resize listeners must not accumulate across repeated open/close cycles.

## 10. Shared definition of done

Every stage must:

1. Preserve current job search, ranking diagnostics, save-to-pipeline, pipeline CRUD, Academy, and roadmap behavior.
2. Add or update tests proportional to the change.
3. Run `node --test test/*.test.cjs` and `npm run build`.
4. Report any pre-existing failures separately from stage regressions.
5. Avoid modifying unrelated dirty files unless required and explicitly documented.
6. Include migration reopen/persistence tests for every new table.
7. Keep external calls mocked in automated tests.
8. Stop at the stage gate. Do not begin the next numbered stage automatically.

## 11. Execution order and model ownership

| Order | File | Owner | Why |
| --- | --- | --- | --- |
| 1 | `JOB_APPLICATION_AUTOMATION_01_FOUNDATION_LUNA_MED.md` | Luna medium | Bounded database CRUD, state-model implementation, and React workspace work with no remote browser mutation |
| 2 | `JOB_APPLICATION_AUTOMATION_02_DOCUMENTS_LUNA_MED.md` | Luna medium | Isolated document generation/version/export slice with explicit schemas and validation rules |
| 3 | `JOB_APPLICATION_AUTOMATION_03_BROWSER_OBSERVER_TERRA_MED.md` | Terra medium | Security-sensitive Electron view/session/navigation architecture and untrusted DOM inspection |
| 4 | `JOB_APPLICATION_AUTOMATION_04_CONTROLLED_AUTOFILL_TERRA_MED.md` | Terra medium | Remote form mutation, policy enforcement, stale-page handling, and file-upload spike |
| 5 | `JOB_APPLICATION_AUTOMATION_05_SUBMISSION_AND_FOLLOWUP_TERRA_MED.md` | Terra medium | Critical no-auto-submit boundary, confirmation semantics, and atomic lifecycle completion |
| 6 | `JOB_APPLICATION_AUTOMATION_06_ADAPTERS_AND_HARDENING_TERRA_MED.md` | Terra medium | Cross-site adapter architecture, security review, and production hardening |

Luna should stop and hand back to Terra if Stage 01 or 02 requires changes to remote-content security, Electron view/session ownership, application-form DOM inspection, or employer-site mutation. Terra should review the Stage 01/02 completion notes before beginning Stage 03; repeating completed work is unnecessary, but contracts and tests must be verified.

Stages 1 and 2 produce a useful application-preparation product without browser automation. Stage 3 adds an isolated browser in observation-only mode. Stage 4 is the first stage allowed to mutate employer forms. Stage 5 closes the lifecycle while preserving user-controlled submission. Stage 6 expands coverage only after telemetry from real manual use identifies the highest-value ATS targets.

## 12. Terra/Luna operating instructions

At the beginning of each stage:

1. Read this file and the selected stage completely.
2. Inspect `git status --short` and preserve user changes.
3. Re-open every listed target file; do not trust line numbers or stale snippets.
4. Run the relevant existing tests before editing to establish a baseline.
5. Implement only that stage.

At the end of each stage, provide:

- Files changed.
- Migration added and rollback/recovery considerations.
- Tests added and exact commands/results.
- Manual verification performed.
- Known limitations.
- Confirmation that the stage stop gate was respected.

For Luna-owned stages, also provide a short contract handoff for Terra: new DTO shapes, IPC names, database namespaces, status enums, test fixture locations, and any deviation from the planned schema. Terra must resolve contract drift before starting Stage 03.

## 13. Architectural references

The browser design follows current Electron guidance: `BrowserView` is deprecated in favor of `WebContentsView`; remote content should run with Node integration disabled, context isolation and sandboxing enabled, permission handlers installed, and navigation/new-window behavior constrained.

- https://www.electronjs.org/docs/latest/api/web-contents-view
- https://www.electronjs.org/blog/migrate-to-webcontentsview
- https://www.electronjs.org/docs/latest/tutorial/security
- https://www.electronjs.org/docs/latest/api/session
