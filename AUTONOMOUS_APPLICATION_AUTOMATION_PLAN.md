# Autonomous Application Queue Automation

## Implementation status (updated 2026-08-23)

The delivery is organized into five stages. Stages 1 through 4 are complete; Stage 5 remains gated until its preceding provider contracts are verified in the operational workflow.

### Five-stage roadmap

1. **Queue and state foundation** — durable autonomous state/checkpoints, one-at-a-time eligible queue selection, restart recovery, bounded retry policy, and visible unknown-question pause/resume workflow. **Complete.**
2. **Generic autonomous applications** — HTTPS page opening, generic form inspection/fill, approved document upload, simple multi-page navigation, and confirmation-page detection. **Complete.**
3. **Account creation and Gmail activation** — secure employer-account references, login/create flows, activation-code/link matching, resume-after-activation, and duplicate-account prevention. **Complete.**
4. **Provider adapters** — production-gated Greenhouse, Lever, Ashby, SmartRecruiters, Workday, and iCIMS/Taleo adapters, each backed by local fixtures and end-to-end tests. **Complete.**
5. **Reliability and operations** — restart-safe execution, pause/resume controls, diagnostics, failure classification, email confirmation correlation, follow-up actions, and audit history.

### Stage 1 completion criteria

Stage 1 is complete when the application can:

- Identify only `ready` jobs with a valid HTTPS application URL and approved selected resume and cover letter.
- Claim at most one eligible application at a time and persist its attempt/checkpoint before work begins.
- Recover interrupted non-submission work after Electron restart without retrying final submission.
- Pause an application on an unknown question, show the bounded question context, persist a reusable answer, and resume the application state.
- Expose queue state and unknown-question actions through the existing Jobs UI without exposing credentials or raw page snapshots.
- Leave the existing document-preparation queue behavior unchanged.

The first foundation slice is complete and committed in the repository:

- Added the autonomous state vocabulary in `electron/jobs/application-automation.cjs` (`queued` through `submitted`, plus `needs_user_answer`, `blocked`, and `failed`).
- Added durable automation state, attempt count, checkpoint metadata, and retry timestamp to each application through migration `0025_autonomous_application_foundation.sql`.
- New application workspaces now begin in autonomous state `queued`; existing records keep the migration-safe `idle` default until explicitly queued.
- Added durable unknown-question records containing only bounded workflow metadata: provider host, page fingerprint, control label/type, normalized question key/text, and answer options.
- Added main-process and preload APIs to update checkpoints, list/save unknown questions, and resolve a question into a reusable approved answer. Resolving moves the application back to `answering_questions`.
- Added a reopen/persistence test covering queue initialization, unknown-question pause, database restart, answer reuse, and resume state.

Stage 1 is now complete. The queue claims one eligible `Ready to apply` application at a time, persists an `opening` checkpoint, exposes queue and unknown-question controls in the Jobs UI, and recovers interrupted non-submission states after restart. Opening URLs, inspecting/filling forms, uploading documents, creating accounts, and browser/email submission evidence remain intentionally deferred to Stages 2 and 3.

Stage 1 implementation commits:

- `12ea2a3` — autonomous application state foundation.
- `56dedb8` — five-stage roadmap and Stage 1 completion criteria.
- `b42ad64` — durable queue eligibility, claim, release, and recovery primitives.
- `3137f4b` / `60275d6` — queue IPC wiring and syntax correction.
- `b2a8e2f` — Jobs UI queue controls and unknown-question answer flow.
- `1a4c0ad` / `cfe9981` — queue recovery tests and eligibility-claim correction.

Verification completed: focused application persistence and preparation-queue tests, Stage 1 queue/restart tests, Node syntax checks, Vite production build, and `git diff --check`.

### Next session handoff — begin Stage 5

1. Add restart-safe queue execution and pause/resume controls around the existing browser and provider contracts.
2. Add bounded provider diagnostics and failure classification to the queue and audit UI.
3. Implement submission-email confirmation correlation and missing-email handling before any `Applied` transition.
4. Preserve the Stage 3 account host/email identity boundary and Stage 4 production gate.

### Stage 2 progress — 2026-08-23

Completed and committed:

- Extended `electron/jobs/application-browser.cjs` with bounded selected-document uploads through Chromium `DOM.setFileInputFiles`.
- Added safe page advancement that only activates uniquely matched `Next`, `Continue`, `Save and continue`, `Proceed`, or `Review` controls; final-submit controls are never eligible.
- Added durable `detecting_form`, `uploading_documents`, and `navigating_form` checkpoints through the existing application automation state API.
- Added main-process IPC and preload methods for approved document upload and safe next-page navigation.
- Added Jobs application assistant controls for upload and next safe page.
- Added `test/fixtures/generic-application-form.json` and Stage 2 contract tests for inspection, page fingerprints, file controls, navigation controls, and final-submit exclusion.
- Preserved the existing reviewed fill-plan and stale-page protections.

Stage 2 commits:

- `aa84e29` — generic application form navigation and uploads.
- `078158b` — generic single-file upload control handling.
- `2b2d6b7` — generic application fixture contracts.
- `e8d6826` — queue claim to isolated browser opening and first-page checkpoint.
- `0120620` — queue/browser handoff contract coverage.
- `b44f632` / `d0961d0` — deterministic fixture-backed browser orchestration coverage.

Verification completed for this slice: nine focused browser/Stage 1/Stage 2 tests, zero failures, Electron restart after each commit, Electron syntax checks, production build, and `git diff --check`.

### Stage 2 completion — 2026-08-23

Stage 2 is complete. The generic workflow now opens one claimed HTTPS application in the isolated browser, persists the first inspection checkpoint, builds and executes a reviewed fill plan using verified profile/reusable-answer data, pauses unsupported questions through the existing `needs_user_answer` workflow, uploads only selected approved documents, advances through uniquely matched safe controls, detects bounded confirmation evidence, and leaves final submission manual.

Final Stage 2 commits:

- `13127bf` — isolated browser confirmation detection.
- `5b68702` — confirmation evidence IPC checkpoint.
- `a880df7` / `4a2451f` — assistant confirmation control and reusable-answer preservation.
- `f1de70e` / `9c45b99` — confirmation and safe-review fixture pages.
- `deb96c8` / `832ecb3` / `8a7e17b` / `c391fac` / `ac89f22` / `d67ca20` / `777799a` / `1f9623a` — complete fixture orchestration coverage and deterministic lifecycle simulation.
- `f3184c6` — review-control navigation policy alignment.

Acceptance verification: 15 focused tests passed; Electron syntax checks passed for main, preload, browser, and policy modules; production build passed; `git diff --check` passed; Electron was restarted after task-related commits. Existing build warnings are limited to Vite's config-loader notice and the pre-existing large generated chunks.

Stage 3 completion follows the Stage 2 confirmation checkpoint; final submission remains approval-gated until the later reliability and email-confirmation stage.

### Stage 3 completion — 2026-08-23

Stage 3 is complete. Employer account references now use a deterministic host-and-candidate-email credential identity, are stored through the Electron main-process secure-storage boundary, and return only safe metadata to the renderer. Account saves record `creating_account` or `reusing_account` checkpoints, while activation waits are durable and restart-safe.

The existing Gmail synchronization boundary now feeds bounded activation matching. Matching requires the current employer host, approved application email, recent activation language, and either a matching HTTPS activation path or a bounded one-time code. Only redacted URLs, message IDs, code hashes, and bounded signals are persisted; raw passwords, activation links, and codes are never written to application state, events, diagnostics, or renderer DTOs.

The isolated application browser can consume a matching activation link or code in memory, verify the resulting page inspection, mark the activation attempt used, mark the account active, and resume the application at `detecting_form`. Duplicate account creation is prevented for the same normalized host and candidate email by reusing the same credential reference.

Stage 3 commits:

- `67e0f8d` — bounded employer activation matching and deterministic matcher tests.
- `1449548` — durable application activation attempts migration.
- `74afaab` / `672afb9` — reusable account and activation database persistence/API.
- `e12751c` / `08aa726` / `eccde9b` — secure credential responses, activation coordinator, and create/reuse transitions.
- `33a89d2` / `4d147e3` — isolated browser activation resume and preload boundary.
- `bf4d750` — assistant account reuse and Gmail activation controls.
- `8acc0db` — restart-safe Stage 3 contract coverage.

Acceptance verification: Stage 3 activation/account tests and Stage 2 regression tests passed; restart persistence preserved account and activation metadata; Electron main, database, browser, activation, and preload syntax checks passed; production build passed; `git diff --check` passed; Electron was restarted after every task-related commit. Existing build warnings remain limited to Vite's config-loader notice and large generated chunks.

### Stage 4 completion — 2026-08-23

Stage 4 is complete. Provider-specific application rules now live behind `electron/jobs/adapters/` and share the generic Stage 2/3 inspection, account, navigation, and confirmation boundaries without mutating remote forms directly. The registry supports Greenhouse, Lever, Ashby, SmartRecruiters, Workday, and the combined iCIMS/Taleo lane.

Each provider has a local multi-page fixture and an end-to-end contract test covering HTTPS/provider detection, tracking-parameter URL normalization, form-step detection, required-field discovery, unambiguous control lookup, account-flow markers, confirmation evidence, duplicate-application markers, bounded retry policy, and diagnostics. Provider selection is explicitly gated; unknown pages, non-HTTPS URLs, and all default production paths continue to use the fail-closed generic adapter until controlled live validation enables a provider.

Stage 4 commits:

- `c6a57cb` — gated provider adapter contracts and provider-specific rules.
- `b6a1331` — provider fixtures and end-to-end contract coverage.

Acceptance verification: 65 application/autonomous tests passed; all adapter and regression tests passed; adapter module syntax checks passed; production build passed; `git diff --check` passed; Electron was restarted after each Stage 4 commit. Existing build warnings remain limited to Vite's config-loader notice and large generated chunks.

## Purpose

This document is the implementation reference for extending North Star's application queue from document preparation into autonomous job submission.

The target workflow is:

`Ready to apply` -> open job application -> create or reuse employer account -> retrieve activation email if needed -> complete the application -> upload approved documents -> submit -> verify confirmation -> `Applied`.

The system must not mark a job as applied unless it has evidence that the employer accepted the application.

## Product goal

The normal application path should require no user intervention. The AI should use the approved candidate profile, approved resume, approved cover letter, and the local answer database to complete applications across different employer and ATS websites.

When a question is not represented in the answer database, the system should:

1. Pause that application without submitting it.
2. Show the exact question and available context to the user.
3. Save the user's answer in a reusable local answer record.
4. Resume the application when the answer is available.
5. Reuse the answer on future applications when the question matches.

This is the one intentional user-assisted path: unknown information must be collected once so future applications can become more autonomous.

## Existing implementation boundaries

The implementation should extend the existing Electron/React and SQLite architecture.

Relevant components:

- `electron/main.cjs` — queue orchestration, IPC, application lifecycle, job-stage transitions, Gmail synchronization.
- `electron/preload.cjs` — renderer-to-main application APIs.
- `electron/database.cjs` — jobs, applications, profiles, email records, activity, and persistence.
- `electron/jobs/application-browser.cjs` — isolated Chromium application session, navigation, page inspection, filling, and browser state.
- `electron/jobs/application-inspector.cjs` — form controls, labels, fingerprints, and page snapshots.
- `electron/jobs/application-fill-engine.cjs` — fill-plan creation and current-page validation.
- `electron/jobs/application-fill-planner.cjs` — AI-assisted application-answer planning.
- `electron/jobs/application-policy.cjs` — field classification and action decisions; this must be changed for the new answer policy.
- `electron/jobs/application-confirmation.cjs` — confirmation-page and confirmation-language detection.
- `electron/jobs/adapters/` — provider-specific application behavior. The current registry has only the generic adapter.
- `electron/migrations/0021_external_application_accounts.sql` — existing external-account persistence foundation.
- Existing application document selection/materialization — job-specific selected resume and cover letter files.
- Existing Gmail OAuth and email sync — activation links, verification codes, application confirmations, and follow-up emails.

## Policy change: application questions are not permanently protected

The current `application-policy.cjs` uses a `BLOCKED` set for sensitive disclosure, legal-signature, authentication/CAPTCHA, file-upload, final-submit, and navigation categories. It also requires approval for several ordinary application-answer categories.

The requested policy is:

- Do not permanently protect ordinary application-question categories.
- Give the AI enough approved profile, employment, education, preference, and reusable-answer data to answer all supported questions.
- Let the AI answer free-text, work-authorization, compensation, relocation, travel, availability, and other application questions when the answer is supported by stored information or an existing approved answer.
- Treat unknown questions as missing knowledge, not as permanent policy blocks.
- Save newly supplied answers for exact or carefully normalized future matches.

Operational controls are different from application questions. Submit controls, navigation controls, file controls, account authentication, and CAPTCHA detection are workflow actions rather than questions for the AI to answer. They must be implemented as automation capabilities with explicit state transitions, diagnostics, and retry rules.

The system must not invent personal facts. If the database does not support an answer, it must create an unknown-question record instead of hallucinating.

## Target application state machine

Each application runs through durable states:

1. `queued`
2. `opening`
3. `detecting_form`
4. `creating_account` or `reusing_account`
5. `awaiting_activation`
6. `filling_profile`
7. `answering_questions`
8. `uploading_documents`
9. `navigating_form`
10. `ready_to_submit`
11. `submitting`
12. `verifying_confirmation`
13. `verifying_email_confirmation`
14. `submitted`
15. `needs_user_answer`
16. `blocked`
17. `failed`

Every transition should record an application event containing the application ID, job ID, provider, redacted URL, page fingerprint, state, outcome, reason code, and timestamp. Sensitive field values, passwords, access tokens, and raw authentication codes must not be written to logs or diagnostics.

## Queue behavior

The queue should process one application at a time initially.

For each `ready` job:

1. Confirm that the job has a valid HTTPS application URL.
2. Confirm that the application has approved, selected resume and cover-letter files.
3. Confirm that the candidate profile is complete enough for the current workflow.
4. Create or resume the application record.
5. Select the provider adapter.
6. Open the URL in the isolated application browser session.
7. Complete the state machine.
8. Verify the browser confirmation.
9. Verify a matching application-submission email through the existing Gmail sync.
10. Mark the application submitted and move the job to `applied` only after both confirmation sources pass.
11. Schedule the existing follow-up action.

The queue must be idempotent. A restart, timeout, or retry must not submit the same application twice. Before final submission, check the application record, provider page, account history, and any known confirmation state.

## Browser and page automation

The existing `WebContentsView` and Chromium DevTools Protocol path should remain the browser runtime.

For every page:

1. Capture a DOM snapshot.
2. Identify the provider and current form step.
3. Detect all visible and required controls.
4. Match each control using label, name, ID, autocomplete, field type, and surrounding text.
5. Build a page-specific plan.
6. Fill or interact with one control at a time.
7. Reinspect after each control that may cause a reactive DOM update.
8. Verify the resulting value.
9. Resolve deterministic validation errors.
10. Advance only when the current page is valid.

Page fingerprints must invalidate stale plans. React, Vue, and Workday-style forms frequently replace controls after an input or selection.

## Provider adapter roadmap

Implement adapters in this order:

1. Generic hosted forms.
2. Greenhouse.
3. Lever.
4. Ashby.
5. SmartRecruiters.
6. Workday.
7. iCIMS.
8. Taleo.

Each adapter should define:

- Provider detection.
- Application URL normalization.
- Form-step detection.
- Required-field detection.
- Text, select, checkbox, radio, and file-input handling.
- Next/continue/save button handling.
- Account creation and sign-in form handling.
- Confirmation markers.
- Duplicate-application markers.
- Safe retry behavior.
- Bounded adapter diagnostics.

The generic adapter must reject ambiguous fields instead of guessing based on position.

## Candidate information and answer database

The answer system should combine:

- Verified profile fields.
- Employment history.
- Education history.
- Skills and certifications.
- Work authorization and sponsorship information.
- Salary and compensation preferences.
- Location, relocation, travel, and availability preferences.
- Resume-grounded facts.
- Cover-letter context.
- User-provided reusable answers.
- Previously answered normalized questions.

Each reusable answer should store:

- Stable ID.
- Normalized question key.
- Original question text.
- Answer text or structured value.
- Answer type.
- Source and provenance.
- Created and updated timestamps.
- Optional confidence or review status.
- Match history.

Matching should prefer exact normalized labels and provider-specific question identifiers. Semantic matching may be used only when the system can show the matched source question and the answer remains factually supported.

## Unknown-question workflow

When the AI cannot produce a supported answer:

1. Store the question without storing unnecessary sensitive page data.
2. Store the provider, job, application, page, control label, type, and allowed answer options.
3. Set the application to `needs_user_answer`.
4. Notify the application queue UI.
5. Ask the user for the answer once.
6. Save it as a reusable answer.
7. Rebuild the current page plan.
8. Resume without restarting the application unless the provider requires it.

Unknown questions must never be answered with a guessed value merely to keep the queue moving.

## Account creation and authentication

If a provider requires an account:

1. Detect the account-creation flow.
2. Generate a unique password that satisfies the provider's requirements.
3. Use the approved application email address.
4. Submit account creation.
5. Save the account record linked to the application and provider host.
6. Wait for the activation or verification email.
7. Use Gmail sync to locate the matching activation message.
8. Extract a bounded activation URL or one-time code.
9. Open the activation link or enter the code.
10. Verify the account is active.
11. Resume the application.

Account storage requirements:

- Passwords and credential material must be encrypted using Electron `safeStorage` or an equivalent main-process-only encrypted store.
- The renderer must receive only safe metadata such as host, username/email, status, and last-used timestamp.
- Credentials must never appear in logs, DOM snapshots, application events, AI prompts, exported artifacts, or memory notes.
- Account reuse must be scoped to the matching provider host and candidate email.
- The system must not use a stored account for a different host without explicit provider identity verification.

The existing `job_application_external_accounts` table is a starting point, but the account model may need credential-reference support, activation state, provider account ID, last verification time, and failure metadata.

## Gmail activation and confirmation sync

The existing Gmail sync should support two related workflows:

### Activation messages

- Search recent messages using sender, recipient, provider host, subject, and activation language.
- Match the message to the current provider and application email.
- Extract only an activation URL or one-time code.
- Reject unrelated links and messages.
- Record a redacted email ID and activation outcome.
- Do not persist the raw code in application diagnostics after use.

### Submission confirmations

- A matching submission email is required before the job can move to `Applied`. Every successfully submitted application is expected to produce an email confirmation; absence of that message is treated as an unverified submission rather than success.
- Match confirmation emails to the job using multiple signals: provider, employer, role title, application URL or host, recipient account, sender, subject, message body, timestamp, and any confirmation number.
- Require strong submission language such as application received, application submitted, thank you for applying, or an equivalent provider-specific signal. Job alerts, newsletters, recruiter messages, and generic account emails do not qualify.
- Correlate the email to the current application ID through provider/job metadata and a bounded post-submit time window. Do not assign a confirmation email to a different job solely because the company name matches.
- After the browser reports success, enter `verifying_email_confirmation` and trigger or await Gmail sync. Poll with bounded intervals and a maximum verification window.
- If a matching email arrives, record the email ID, matching evidence, confirmation timestamp, and optional confirmation number, then mark the application `submitted` and the job `applied`.
- If the browser reports success but no matching email arrives before the verification window expires, keep the application in `verifying_email_confirmation` or `blocked` with `email_confirmation_missing`. Do not move the job to `Applied` and do not blindly resubmit.
- If an email arrives before browser confirmation, retain it as supporting evidence but still reconcile it against browser state and application history before completing the transition.
- Preserve the existing conservative email-to-job matching rules and existing manual email-linking capability for ambiguous cases.

## Document upload behavior

Before upload:

- Verify the selected resume and cover letter exist.
- Verify they belong to the current job application.
- Verify they passed approval and validation.
- Verify file extension and MIME type.
- Record a file hash and selected-document ID.

After upload:

- Confirm the provider displays the expected filename.
- Confirm required upload controls are satisfied.
- Never discover or upload arbitrary files from the filesystem.

## Final submission and confirmation

Before clicking submit, verify:

- No unknown required question remains.
- All required fields are filled.
- Required documents are attached.
- The submit control is unambiguous.
- The current page belongs to the expected application flow.
- The application has not already been submitted.
- No CAPTCHA, bot challenge, payment step, or unsupported authentication challenge is present.

After clicking submit:

1. Wait for navigation or a bounded response period.
2. Inspect the resulting page.
3. Detect confirmation language, confirmation number, or provider-specific success state.
4. If browser confirmation is strong, transition to `verifying_email_confirmation`.
5. Trigger Gmail sync and search for a matching submission email within the bounded verification window.
6. If both browser confirmation and email confirmation are strong, mark the application `submitted` and move the job to `applied`.
7. If either source is ambiguous or the email is missing, preserve the unverified state and do not retry final submission automatically.
8. If the provider reports a clear failure, store the reason and apply bounded retry rules.

## Bottlenecks and planned responses

| Risk | Planned response |
|---|---|
| Different ATS HTML structures | Provider adapters plus conservative generic detection. |
| Dynamic DOM replacement | Reinspect and rebuild plans after every mutation or navigation. |
| Unknown application question | Pause, collect the answer, save it, and resume. |
| AI lacks factual support | Do not invent; create an unknown-question record. |
| Required file upload differs by provider | Adapter-specific file-input discovery and upload verification. |
| Account activation required | Create account, securely save credential reference, and use Gmail sync for activation. |
| Activation email is delayed | Persist `awaiting_activation`, poll with bounded intervals, and avoid duplicate account creation. |
| Password or login failure | Retry bounded times, then mark the account/application state with a clear failure. |
| CAPTCHA or bot challenge | Detect and stop; never falsely mark submitted or attempt bypass behavior. |
| Employer requires a new certification or legally binding action | Represent it as an unsupported workflow action and stop with a precise reason. |
| Network timeout | Retry navigation and non-submission operations; never blindly retry final submission. |
| Ambiguous final result | Verify using page state and email evidence before changing the job stage. |
| Provider UI changes | Preserve adapter diagnostics and fixture coverage; route unknown structures to the generic detector. |
| Duplicate application risk | Use durable application state, provider history, and idempotency keys before submission. |

## Delivery phases

### Phase 1 — Queue and state foundation

- Add autonomous application state machine.
- Add durable events and retry checkpoints.
- Process `ready` jobs one at a time.
- Add unknown-question persistence and queue UI state.
- Preserve existing preparation queue behavior.

### Phase 2 — Generic autonomous applications

- Open saved HTTPS application URLs.
- Fill all supported profile and answer fields.
- Upload selected documents.
- Navigate simple multi-page forms.
- Submit and verify confirmation.
- Move confirmed jobs to `applied`.

### Phase 3 — Account creation and Gmail activation

- Add secure account credential references.
- Add account-create and login flows.
- Add activation email/code matching.
- Resume applications after activation.
- Add account reuse and duplicate-account prevention.

### Phase 4 — Provider adapters

- Greenhouse.
- Lever.
- Ashby.
- SmartRecruiters.
- Workday.
- iCIMS/Taleo.

### Phase 5 — Reliability and operations

- Recovery after Electron restart.
- Queue pause/resume.
- Provider diagnostics.
- Failure classification.
- Email confirmation correlation.
- Follow-up scheduling.
- Application history and audit display.

## Testing requirements

Tests must cover:

- Ready-to-applied queue transitions.
- Restart and resume behavior.
- Duplicate-submission prevention.
- Generic one-page forms.
- Generic multi-page forms.
- React-controlled inputs.
- Required selects, checkboxes, radios, and file uploads.
- Unknown-question pause and resume.
- Reusable-answer matching.
- Account creation.
- Encrypted credential persistence.
- Activation-code extraction from Gmail fixtures.
- Activation-link handling.
- Provider redirects.
- Confirmation-page detection.
- Submission-email correlation and bounded post-submit polling.
- Missing-email handling without a false `Applied` transition.
- Ambiguous submission results.
- Provider failure and bounded retry.
- CAPTCHA detection.
- No sensitive values in logs or diagnostics.

Each provider adapter should have a local HTML fixture and a successful end-to-end fixture test before being enabled for production queue execution.

## Definition of done

The project is complete when the system can demonstrate that it:

- Selects an eligible `ready` job.
- Opens the correct application URL.
- Detects the correct form/provider.
- Creates or reuses an account when required.
- Activates the account through Gmail sync when required.
- Answers supported questions from approved stored information.
- Flags unknown questions and saves future answers.
- Uploads only the selected resume and cover letter.
- Navigates the complete application.
- Submits without duplicate retries.
- Detects a real confirmation.
- Finds and matches the expected submission email through Gmail sync.
- Records `submitted` application state and audit events.
- Moves the job to `applied`.
- Creates the existing follow-up action.
- Recovers safely after a restart or transient failure.

## First implementation recommendation

Start with the queue/state foundation and the unknown-question database before adding broad provider coverage. Then complete one generic fixture flow and one Greenhouse flow end to end, including account activation and confirmation evidence. This will establish the durable contracts needed for the remaining adapters without expanding the scope into unsupported websites prematurely.
