# North Star Application Automation: Meta-Workflow Handoff

## Handoff purpose

This document turns the recent design discussion into an implementation handoff for a reusable, multi-site application automation system.

The goal is not to add another site-specific click path. The goal is to create a durable workflow platform that can:

1. Run known application paths deterministically.
2. Use AI to understand a new or changed page.
3. Convert a successful AI repair into a reusable site playbook.
4. Retry the same application from the same checkpoint instead of starting a new job.
5. Automate approved profile, salary, relocation, authorization, and other reusable answers.
6. Stop only for genuine ambiguity, authentication challenges, CAPTCHA, or irreversible submission approval.

The target loop is:

```text
observe -> classify -> load playbook -> plan -> execute one safe step
        -> verify -> persist evidence -> continue or repair
```

The current application automation foundation is approximately 50–60% complete. The meta-layer—central orchestration, playbooks, AI browser repair, and replay evaluation—is approximately 20% complete. This handoff defines the work required to close that gap.

## Implementation progress

### Milestone 1 — Contracts and policy: complete (2026-08-23)

Completed in commit `efaad61`:

- Added [electron/jobs/automation/result-contract.cjs](../electron/jobs/automation/result-contract.cjs) with the canonical workflow outcomes, step statuses, sources, bounded evidence IDs, and confidence validation.
- Added [electron/jobs/automation/transition-policy.cjs](../electron/jobs/automation/transition-policy.cjs) with the central outcome-to-application/job/queue policy matrix.
- Added [test/application-automation-result-contract.test.cjs](../test/application-automation-result-contract.test.cjs).
- Added [test/application-automation-transition-policy.test.cjs](../test/application-automation-transition-policy.test.cjs).
- Verified the unavailable-listing path: one `listing_unavailable` result sets the application to `blocked`, moves the job to `rejected`, removes it from the ready queue through the existing archive boundary, and records one transition event.
- Verified idempotency: reapplying an already terminal unavailable-listing result performs no additional repository writes.

Validation completed:

- Focused contract and transition tests: 5 passing.
- Production renderer build: passing.
- Electron app restarted and inspected from the UI with Computer Use. The autonomous queue drawer showed 10 queued/eligible items, 0 active, 0 blocked, and the separate application queue showed 1 failed item requiring deliberate review.
- No UI bottleneck required a code change in this milestone. `Checkpoint next` was not activated during inspection because it claims a real application and may open an external application flow.

Known unrelated full-suite failures observed during validation:

- Existing browser-source contract assertion in `application-browser-view.test.cjs`.
- Windows temporary-directory cleanup `EPERM` in `autonomous-application-foundation.test.cjs`.

Next milestone: wrap the existing Dice browser path behind the orchestrator, observation, planning, execution, and verification boundaries without moving final submission authority out of the existing approval-gated path.

### Phase 2 — Observe, plan, execute, verify: complete (2026-08-23)

Completed in commits `7cd0458` and `1bedf68`:

- Added [electron/jobs/automation/observation.cjs](../electron/jobs/automation/observation.cjs) to normalize the existing sanitized browser snapshot into bounded, provider-neutral observations.
- Added [electron/jobs/automation/planner.cjs](../electron/jobs/automation/planner.cjs) with deterministic page classification for job listings, login, application forms, CAPTCHA, confirmation, and unavailable listings. It proposes only bounded handoff/login navigation or a user pause for protected states.
- Added [electron/jobs/automation/executor.cjs](../electron/jobs/automation/executor.cjs) as the safe Dice browser adapter. It permits exact-label handoff and Google-login navigation only; it has no submit path.
- Added [electron/jobs/automation/verifier.cjs](../electron/jobs/automation/verifier.cjs) to require verified navigation, classify unavailable listings, and keep blocked/protected actions inconclusive or user-gated.
- Wired the existing autonomous Dice checkpoint in [electron/main.cjs](../electron/main.cjs) through `createApplicationOrchestrator()`. The main-process repository adapter persists step evidence through existing application events, replays successful idempotency keys, and routes outcomes through the central transition policy.
- Preserved the latest redacted URL and automation checkpoint when a user returns an active application to the queue, allowing the next claim to reopen the same boundary.
- Kept uploads, approved-field filling, final submission, confirmation detection, and employer-email verification behind their existing safety boundaries. Phase 2 does not authorize autonomous submission.
- Added [test/application-automation-contracts.test.cjs](../test/application-automation-contracts.test.cjs) covering observation, page classification, planning, safe execution, verification, unavailable listings, login, and protected-form pauses.

Phase 2 exit criteria are met: the existing Dice path runs through the observe/plan/execute/verify wrapper; the renderer does not own workflow transitions; one application persists a redacted URL/checkpoint and can be released/reclaimed from the same checkpoint; and final submission remains approval-gated.

Validation completed:

- Focused Phase 2, orchestrator, result-contract, and transition-policy tests: 11 passing.
- `node --check electron/main.cjs` and all new automation modules: passing.
- `npm.cmd run build`: passing, with only the existing Vite CommonJS/ESM and large-chunk warnings.
- Electron restarted after both Phase 2 commits.
- Computer Use inspection after restart: North Star rendered normally; autonomous queue showed `PAUSED`, `10 eligible`, `0 active`, `0 failed`, `0 blocked`; application queue showed its existing `PAUSED` / `1 failed` review state. No UI change was required.

Known unrelated full-suite failures remain documented from the prior baseline: the existing browser-source contract assertion, the Stage 3 source contract assertion, and a Windows temporary-directory cleanup `EPERM` in the autonomous foundation test. These do not affect the focused Phase 2 validation or production build.

### Phase 1 — Normalize the workflow core: complete (2026-08-23)

The remaining Phase 1 gaps are now closed in commit `0282a9a`:

- Added [electron/jobs/automation/idempotency.cjs](../electron/jobs/automation/idempotency.cjs) for stable application/checkpoint/action/target keys.
- Added [electron/jobs/automation/orchestrator.cjs](../electron/jobs/automation/orchestrator.cjs), an independent repository-driven one-safe-step orchestrator that observes, plans, checks prior completion, executes, verifies, records, and applies the central transition policy.
- Extended [electron/jobs/application-reliability.cjs](../electron/jobs/application-reliability.cjs) with workflow-level classification. Network, provider-change, and activation-pending failures become `retryable_failure`; unsupported sites become `unsupported_site`; authentication, CAPTCHA, protected actions, and unknown questions become `needs_user`; invalid state becomes `terminal_failure`.
- Added [test/application-automation-orchestrator.test.cjs](../test/application-automation-orchestrator.test.cjs) for idempotency and replay behavior.
- Extended [test/application-reliability.test.cjs](../test/application-reliability.test.cjs) for the workflow outcome distinctions.

Phase 1 exit criteria are met: browser and renderer paths have a central policy boundary available, repeated safe actions can replay a recorded success instead of executing twice, and failure classes no longer collapse into an undifferentiated retry or failure state. Existing `main.cjs` browser behavior remains unchanged until Phase 2 migrates the Dice path through these contracts.

## Current repository anchors

These are the existing execution boundaries. Preserve them unless a change is required to centralize workflow ownership.

- [electron/main.cjs](../electron/main.cjs) — Electron main-process IPC, autonomous queue runner, browser checkpoint flow, safe form pass, submission gates, and LangSmith job-search tracing.
- [electron/database.cjs](../electron/database.cjs) — SQLite schema declarations, migrations, job/application persistence, queue claiming/recovery, unknown-question answers, application events, and terminal job transitions.
- [electron/preload.cjs](../electron/preload.cjs) — renderer-to-main IPC surface for queue actions and browser actions.
- [electron/jobs/application-browser.cjs](../electron/jobs/application-browser.cjs) — isolated `WebContentsView` browser, navigation policy, page inspection, handoff controls, fill execution, upload execution, confirmation detection, and submit boundary.
- [electron/jobs/application-inspector.cjs](../electron/jobs/application-inspector.cjs) — sanitized page inspection script, field descriptors, page signals, and page fingerprint generation.
- [electron/jobs/application-fill-planner.cjs](../electron/jobs/application-fill-planner.cjs) — AI fill-plan prompt, protected field categories, profile evidence rules, response normalization, and malformed-plan repair prompt.
- [electron/jobs/application-fill-engine.cjs](../electron/jobs/application-fill-engine.cjs) — deterministic fill-plan construction and validation against current page fields/profile.
- [src/JobsView.jsx](../src/JobsView.jsx) — queue panel, needs-answer UI, return-to-queue behavior, checkpoint controls, pipeline board, and user-facing status.
- [src/ApplicationAssistantView.jsx](../src/ApplicationAssistantView.jsx) — application assistant/browser checkpoint UI, review controls, answer handling, uploads, navigation, and submission review surface.

### Existing tests to preserve and extend

- [test/autonomous-application-foundation.test.cjs](../test/autonomous-application-foundation.test.cjs)
- [test/autonomous-application-queue.test.cjs](../test/autonomous-application-queue.test.cjs)
- [test/application-browser-policy.test.cjs](../test/application-browser-policy.test.cjs)
- [test/application-browser-view.test.cjs](../test/application-browser-view.test.cjs)
- [test/application-inspector.test.cjs](../test/application-inspector.test.cjs)
- [test/application-fill-planner.test.cjs](../test/application-fill-planner.test.cjs)
- [test/application-fill-plan.test.cjs](../test/application-fill-plan.test.cjs)
- [test/application-fill-browser-contract.test.cjs](../test/application-fill-browser-contract.test.cjs)
- [test/application-stage2-contract.test.cjs](../test/application-stage2-contract.test.cjs)
- [test/application-stage3-contract.test.cjs](../test/application-stage3-contract.test.cjs)
- [test/application-reliability.test.cjs](../test/application-reliability.test.cjs)
- [test/application-recovery-planner.test.cjs](../test/application-recovery-planner.test.cjs)
- [test/application-adapters.test.cjs](../test/application-adapters.test.cjs)
- [test/job-pipeline-archive.test.cjs](../test/job-pipeline-archive.test.cjs)

## Current phase assessment

### Phase 1 — Normalize the workflow core: partial

Already present:

- Main-process queue ownership.
- One-application-at-a-time claiming.
- Application automation states such as `queued`, `opening`, `detecting_form`, `needs_user_answer`, `failed`, `blocked`, `ready_to_submit`, and verification states.
- Restart recovery for active/legacy queue records.
- Manual return-to-queue behavior.
- Central unavailable-listing archive operation through `jobs.archiveUnavailable`.
- Terminal pipeline visibility for unavailable records.

Still missing:

- A single standard result contract for every browser step.
- A central transition policy used by all browser and renderer paths.
- A single orchestrator module independent of the large `electron/main.cjs` handler.
- Explicit idempotency keys for action execution.
- Consistent distinction among retryable failure, unsupported site, user decision, and terminal failure.

### Phase 2 — Observe, plan, execute, verify: partial

Already present:

- Sanitized page observation in `application-inspector.cjs`.
- Page fingerprints based on URL/title/field descriptors.
- Deterministic fill-plan validation against the current page.
- Safe browser execution through `application-browser.cjs`.
- Upload and field-level verification.
- Application confirmation and email-verification boundaries.

Still missing:

- Explicit `observePage()`, `planNextStep()`, `executeSafeStep()`, and `verifyStepResult()` contracts.
- A generic planner for navigation, login, form progression, uploads, and blockers.
- A generic verifier for every action type.
- A common step result consumed by both manual assistant mode and autonomous queue mode.

### Phase 3 — Playbook storage: mostly missing

Already present:

- Page fingerprints.
- Provider/ATS adapters and fixtures.
- Browser session and unknown-question persistence.
- External account references.

Still missing:

- Versioned site playbooks.
- Playbook steps and semantic targets.
- Verification rules.
- Confidence and success history.
- Repair history.
- Playbook selection by site, ATS, page fingerprint, and workflow version.

### Phase 4 — AI repair mode: mostly missing

Already present:

- AI field-fill planning.
- Bounded malformed JSON repair for fill plans.
- AI document repair.
- Some safe recovery planning.

Still missing:

- AI page-state classification.
- AI action planning for changed browser layouts.
- Safety validation of AI-proposed browser actions.
- One-action repair/retry loop.
- Persisting a repair only after independent verification succeeds.

### Phase 5 — Replay and evaluation: early foundation

Already present:

- Application events.
- Browser session fields and page fingerprints.
- Submission evidence.
- Developer-opt-in job-search tracing.
- Numerous contract and fixture tests.

Still missing:

- A complete per-step application trace.
- Sanitized observation snapshots suitable for replay.
- A replay runner.
- Golden traces for Dice, Adzuna, Greenhouse, and generic ATS forms.
- Metrics for AI calls, human interventions, false unavailable detections, incorrect fills, and recovery success.

### Phase 6 — Conservative queue operation: substantially present

Already present:

- One application at a time.
- Safe navigation and form preparation.
- No autonomous final submission in the queue path.
- Explicit batch approval before final submission state.
- Automatic terminal handling for unavailable listings.
- User review for unresolved fields.
- Bounded retries and recovery.

Still missing:

- Reliable end-to-end completion across multiple sites.
- A single user-facing batch-review/approval flow backed by the new orchestrator.
- Playbook confidence thresholds before a path can run unattended.
- Automated regression checks against previous successful runs.

## Target architecture

### New module boundaries

Create a new directory:

```text
electron/jobs/automation/
  orchestrator.cjs
  result-contract.cjs
  transition-policy.cjs
  observation.cjs
  planner.cjs
  executor.cjs
  verifier.cjs
  playbook-registry.cjs
  repair-loop.cjs
  answer-policy.cjs
  trace-store.cjs
```

The first implementation should be narrow. Do not move every existing browser function at once. Wrap the current browser adapter behind these boundaries, then migrate behavior one step at a time.

### `observePage()`

Input:

```js
{
  applicationId,
  browserState,
  expectedStep,
  site,
  atsKey
}
```

Output:

```js
{
  observationId,
  pageFingerprint,
  pageType,
  site,
  atsKey,
  urlRedacted,
  title,
  fields,
  controls,
  pageSignals,
  protectedSignals,
  capturedAt,
  sanitizerVersion
}
```

Rules:

- Never capture passwords, cookies, tokens, full arbitrary page HTML, or secrets.
- Keep the existing allowlisted inspection model.
- Add semantic page types such as `job_listing`, `login`, `google_account_chooser`, `application_form`, `review`, `confirmation`, `captcha`, and `unavailable_listing`.
- Keep `pageFingerprint` deterministic so the same layout maps to the same playbook candidate.

### `planNextStep()`

Inputs:

```js
{
  observation,
  currentCheckpoint,
  matchingPlaybook,
  profile,
  approvedAnswers,
  job,
  mode: 'deterministic' | 'ai_repair'
}
```

Output:

```js
{
  planId,
  stepType,
  action,
  target,
  arguments,
  expectedResult,
  safetyClass,
  confidence,
  source: 'playbook' | 'ai' | 'deterministic_policy',
  requiresUser,
  reason
}
```

The planner may propose safe navigation, login-path selection, field filling, uploads, and review navigation. It may not authorize final submission, CAPTCHA solving, credential disclosure, or an ambiguous sensitive answer.

### `executeSafeStep()`

The executor must accept only validated plans. It should support a small allowlist:

- `navigate_same_or_approved_host`
- `click_semantic_control`
- `select_option`
- `fill_approved_field`
- `upload_approved_document`
- `dismiss_known_cookie_control`
- `open_google_login`
- `return_to_queue`
- `archive_unavailable`
- `pause_for_user`

Every action receives an idempotency key:

```text
applicationId + checkpointVersion + actionType + targetFingerprint
```

Before executing, check whether the same action already succeeded. If it did, return the recorded result rather than repeating it.

### `verifyStepResult()`

Verification is required for every action. Examples:

- click Apply → expected employer host or next page fingerprint appears
- click Continue with Google → Google login/chooser page appears
- fill email → current field value matches expected value
- upload resume → selected filename/file control state matches approved document
- unavailable classification → terminal signal persists and no actionable listing control remains
- archive → job stage is rejected, queue query no longer returns it, terminal pipeline query does

Verification must return `verified`, `failed`, or `inconclusive`; `inconclusive` must not silently become success.

## Universal result taxonomy

Create one shared contract in `electron/jobs/automation/result-contract.cjs`:

```js
const WORKFLOW_OUTCOMES = new Set([
  'continue',
  'needs_user',
  'listing_unavailable',
  'retryable_failure',
  'unsupported_site',
  'terminal_failure',
  'ready_for_review',
  'submitted_pending_verification',
  'completed'
]);

const STEP_STATUSES = new Set([
  'planned',
  'executed',
  'verified',
  'failed',
  'inconclusive',
  'skipped'
]);
```

Canonical result shape:

```json
{
  "applicationId": "application-...",
  "jobId": "job-...",
  "stepId": "step-...",
  "stepType": "listing_check",
  "status": "verified",
  "outcome": "listing_unavailable",
  "reasonCode": "job_listing_unavailable",
  "confidence": 0.99,
  "retryable": false,
  "requiresUser": false,
  "pageFingerprint": "...",
  "evidenceIds": ["trace-..."],
  "nextCheckpoint": "terminal_archive",
  "source": "deterministic_policy"
}
```

## Central transition policy

Create `electron/jobs/automation/transition-policy.cjs`. No renderer or site adapter should directly decide the final queue state.

Recommended policy:

| Outcome | Application state | Job stage | Queue behavior |
|---|---|---|---|
| `continue` | next active state | unchanged | keep active |
| `needs_user` | `needs_user_answer` or auth state | unchanged | visible review item |
| `listing_unavailable` | `blocked` with terminal reason, or terminal application state | `rejected`, visible terminal history | remove from ready queue |
| `retryable_failure` | `queued` with retry metadata | unchanged | retry same application |
| `unsupported_site` | `blocked` | unchanged | user review, never silently skip |
| `terminal_failure` | `failed` | unchanged unless policy says terminal | failed review |
| `ready_for_review` | `ready_to_submit` | unchanged | batch review |
| `submitted_pending_verification` | verification state | `applied` only after evidence | waiting for confirmation |
| `completed` | `submitted`/completed state | `applied` | leave active queue |

The transition must be idempotent and transactionally update the application, job, checkpoint, and event record.

## Database design

### Existing tables

Preserve and use these tables:

- `job_opportunities` — job pipeline record and visible stage.
- `job_applications` — application lifecycle, automation state, checkpoint JSON, retry timestamp, and selected file paths.
- `job_application_answers` — reusable and application-scoped answers.
- `job_application_unknown_questions` — unresolved fields/questions requiring user input.
- `job_application_documents` — generated/selected resume and cover letter versions.
- `job_application_sessions` — browser/session metadata and page fingerprints.
- `job_application_events` — application lifecycle and automation event history.
- `job_application_external_accounts` — external account references and credential references.
- `job_application_activation_attempts` — account activation checkpoints.
- `job_application_submission_evidence` — confirmation and email-verification evidence.
- `schema_migrations` — migration ledger.

Relevant migrations:

- [electron/migrations/0012_job_application_browser_sessions.sql](../electron/migrations/0012_job_application_browser_sessions.sql)
- [electron/migrations/0025_autonomous_application_foundation.sql](../electron/migrations/0025_autonomous_application_foundation.sql)
- [electron/migrations/0026_application_activation.sql](../electron/migrations/0026_application_activation.sql)
- [electron/migrations/0027_application_submission_evidence.sql](../electron/migrations/0027_application_submission_evidence.sql)
- [electron/migrations/0030_archive_unavailable_application_jobs.sql](../electron/migrations/0030_archive_unavailable_application_jobs.sql)

### New table: `application_site_playbooks`

Add migration `0031_application_site_playbooks.sql`:

```sql
CREATE TABLE IF NOT EXISTS application_site_playbooks (
  id TEXT PRIMARY KEY NOT NULL,
  site_host TEXT NOT NULL,
  ats_key TEXT NOT NULL DEFAULT '',
  workflow_kind TEXT NOT NULL DEFAULT 'job_application',
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft',
  confidence REAL NOT NULL DEFAULT 0,
  playbook_json TEXT NOT NULL DEFAULT '{}',
  source TEXT NOT NULL DEFAULT 'ai_repair',
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  last_success_at TEXT,
  last_failure_at TEXT,
  last_repair_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS application_site_playbooks_identity_idx
  ON application_site_playbooks(site_host, ats_key, workflow_kind, version)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS application_site_playbooks_lookup_idx
  ON application_site_playbooks(site_host, ats_key, workflow_kind, status, confidence);
```

Suggested `status` values:

- `draft`
- `candidate`
- `verified`
- `degraded`
- `disabled`

Only `verified` playbooks above the confidence threshold may run without an AI repair review.

### New table: `application_playbook_steps`

```sql
CREATE TABLE IF NOT EXISTS application_playbook_steps (
  id TEXT PRIMARY KEY NOT NULL,
  playbook_id TEXT NOT NULL,
  step_order INTEGER NOT NULL,
  step_key TEXT NOT NULL,
  page_type TEXT NOT NULL DEFAULT '',
  page_fingerprint TEXT NOT NULL DEFAULT '',
  action_type TEXT NOT NULL,
  target_json TEXT NOT NULL DEFAULT '{}',
  arguments_json TEXT NOT NULL DEFAULT '{}',
  verification_json TEXT NOT NULL DEFAULT '{}',
  safety_class TEXT NOT NULL DEFAULT 'safe_navigation',
  confidence REAL NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS application_playbook_steps_identity_idx
  ON application_playbook_steps(playbook_id, step_order, step_key)
  WHERE deleted_at IS NULL;
```

### New table: `application_playbook_repairs`

```sql
CREATE TABLE IF NOT EXISTS application_playbook_repairs (
  id TEXT PRIMARY KEY NOT NULL,
  playbook_id TEXT,
  application_id TEXT NOT NULL,
  page_fingerprint TEXT NOT NULL DEFAULT '',
  failed_step_key TEXT NOT NULL DEFAULT '',
  observation_json TEXT NOT NULL DEFAULT '{}',
  proposed_plan_json TEXT NOT NULL DEFAULT '{}',
  validation_json TEXT NOT NULL DEFAULT '{}',
  execution_json TEXT NOT NULL DEFAULT '{}',
  verification_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'proposed',
  model_name TEXT NOT NULL DEFAULT '',
  prompt_version TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS application_playbook_repairs_lookup_idx
  ON application_playbook_repairs(application_id, page_fingerprint, created_at);
```

### New table: `application_workflow_steps`

This is the per-application execution trace and should be separate from the summary event table.

```sql
CREATE TABLE IF NOT EXISTS application_workflow_steps (
  id TEXT PRIMARY KEY NOT NULL,
  application_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 0,
  checkpoint_version INTEGER NOT NULL DEFAULT 0,
  step_order INTEGER NOT NULL DEFAULT 0,
  step_key TEXT NOT NULL,
  step_type TEXT NOT NULL,
  page_fingerprint TEXT NOT NULL DEFAULT '',
  observation_id TEXT,
  plan_json TEXT NOT NULL DEFAULT '{}',
  execution_json TEXT NOT NULL DEFAULT '{}',
  verification_json TEXT NOT NULL DEFAULT '{}',
  outcome TEXT NOT NULL DEFAULT '',
  reason_code TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'deterministic_policy',
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS application_workflow_steps_idempotency_idx
  ON application_workflow_steps(idempotency_key);
CREATE INDEX IF NOT EXISTS application_workflow_steps_application_idx
  ON application_workflow_steps(application_id, created_at);
```

### New table: `application_answer_policies`

The existing `job_application_answers` table stores answers. Add a policy layer so the system knows when an answer may be reused automatically.

```sql
CREATE TABLE IF NOT EXISTS application_answer_policies (
  id TEXT PRIMARY KEY NOT NULL,
  answer_id TEXT NOT NULL,
  normalized_category TEXT NOT NULL,
  sensitivity TEXT NOT NULL DEFAULT 'normal',
  autofill_policy TEXT NOT NULL DEFAULT 'ask',
  scope TEXT NOT NULL DEFAULT 'job_applications',
  matching_rules_json TEXT NOT NULL DEFAULT '{}',
  value_rules_json TEXT NOT NULL DEFAULT '{}',
  approved_at TEXT NOT NULL,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS application_answer_policies_category_idx
  ON application_answer_policies(normalized_category, autofill_policy, scope)
  WHERE deleted_at IS NULL;
```

Salary policies must be calculated per job, not stored as a static range:

```json
{
  "category": "salary_expectation",
  "valueRules": {
    "publicRange": "advertisedMinimum + 0.20 * (advertisedMaximum - advertisedMinimum)",
    "fallbackTarget": 120000,
    "currency": "USD"
  }
}
```

For example:

- `$100k–$150k` → `$110k`.
- `$150k–$200k` → `$160k`.
- No public salary → `$120k` fallback.

## Answer automation policy

AI classifies the employer question. It must not invent the answer. The deterministic answer-policy service chooses the answer and autofill mode.

### `always` policy

- Name and contact details.
- Approved address.
- Approved profile links.
- Approved availability.
- Salary calculation rules.
- Relocation and remote-work preferences.
- Approved work authorization and sponsorship answers.

### `batch_review` policy

- Authorization wording that is semantically uncertain.
- Sponsorship wording with unusual options.
- Salary and relocation answers when the employer asks a materially different question.
- Travel requirements.

### `ask` policy

- Current salary.
- Legal attestations.
- Ambiguous demographic questions.
- Questions requiring personal judgment.
- Any question with no approved evidence.

### `never` policy

- Passwords.
- CAPTCHA.
- MFA codes.
- Final submit controls.
- Legal signatures.

Demographic information may be stored locally and encrypted, but optional demographic fields should remain blank by default. If the user explicitly enables automatic use, the answer must still be matched exactly and recorded with provenance.

## AI prompts

### Page planner system prompt

```text
You are the workflow planner for a local-first job-application automation system.

Interpret the sanitized browser observation and return one complete JSON object.

Rules:
- Never submit an application.
- Never solve CAPTCHA or MFA.
- Never invent candidate data.
- Prefer Continue with Google when exactly one approved Google path is visible.
- Treat unavailable listings as terminal and recommend archive.
- Use a saved site playbook when its page fingerprint and verification rules match.
- If the playbook does not match, propose one minimal safe repair.
- Every action must include an independent verification condition.
- Route ambiguity to the user.
- Return JSON only.

Allowed outcomes:
continue, needs_user, listing_unavailable, retryable_failure,
unsupported_site, terminal_failure, ready_for_review.

Output:
{
  "pageType": "",
  "workflowStep": "",
  "outcome": "",
  "confidence": 0,
  "actions": [],
  "questions": [],
  "playbookPatch": null,
  "evidence": []
}
```

### Repair prompt rules

The repair prompt receives only:

- sanitized observation
- current page fingerprint
- failed playbook step
- prior verification result
- approved action allowlist
- relevant job/application context

It must return one action, not a sequence of unbounded clicks. The executor verifies that action before another plan is requested.

### Answer-classification prompt rules

The answer classifier returns:

```json
{
  "category": "salary_expectation",
  "matchedPolicyId": "policy-...",
  "confidence": 0.97,
  "exactOption": "",
  "requiresReview": false,
  "reason": "Employer asks for desired base salary."
}
```

It must never return a new salary, demographic fact, authorization fact, or personal preference that was not already approved.

## Playbook lifecycle

### First encounter

1. Open the job in the isolated browser.
2. Observe and classify the page.
3. Check for unavailable signals before any application action.
4. Check for a matching playbook.
5. If none exists, use AI planning in repair/discovery mode.
6. Execute one safe action.
7. Verify the result.
8. Persist the successful action as a candidate playbook step.
9. Continue until a complete path is captured or a user checkpoint is reached.
10. Mark the playbook `verified` only after repeated successful runs or an explicit review threshold.

### Repeat encounter

1. Select the highest-confidence matching playbook.
2. Run deterministic steps.
3. Verify every step.
4. If a step fails, stop and enter AI repair mode.
5. Save a repair only after the repaired step succeeds and the next expected page is verified.

### Playbook invalidation

Degrade or disable a playbook after:

- repeated verification failures
- changed page fingerprint with unsafe ambiguity
- false unavailable classification
- incorrect field fill
- navigation to an unapproved host
- any submission-safety violation

## Orchestrator algorithm

Pseudocode:

```js
async function runApplicationCheckpoint(applicationId) {
  const checkpoint = repository.getCheckpoint(applicationId);
  const browser = await browserRuntime.open(applicationId, checkpoint);

  try {
    while (true) {
      const observation = await observePage({ applicationId, browser, checkpoint });
      const terminal = classifyTerminalObservation(observation);
      if (terminal) return transitionPolicy.apply(applicationId, terminal);

      const playbook = playbookRegistry.match(observation, checkpoint);
      const plan = await planner.planNextStep({ observation, playbook, checkpoint });
      const validated = safetyPolicy.validate(plan, { observation, checkpoint });
      if (!validated.ok) return transitionPolicy.apply(applicationId, validated.result);

      const idempotencyKey = makeIdempotencyKey(applicationId, checkpoint, validated.plan);
      const prior = traceStore.findCompleted(idempotencyKey);
      if (prior) {
        checkpoint = checkpointFrom(prior);
        continue;
      }

      const execution = await executor.executeSafeStep(validated.plan, browser);
      const verification = await verifier.verifyStepResult(validated.plan, execution, browser);
      traceStore.record({ observation, plan: validated.plan, execution, verification, idempotencyKey });

      if (verification.status === 'verified') {
        playbookRegistry.recordSuccess(playbook, validated.plan, verification);
        checkpoint = transitionPolicy.applyVerifiedStep(applicationId, verification);
        if (verification.outcome === 'completed' || verification.outcome === 'needs_user') return verification;
        continue;
      }

      return await repairLoop.handle({ applicationId, observation, playbook, plan, execution, verification });
    }
  } finally {
    await browser.close();
  }
}
```

## Safety requirements

The following are hard boundaries:

- No final submission from autonomous queue execution.
- No CAPTCHA solving.
- No MFA-code entry.
- No password storage in SQLite or traces.
- No credential values in AI prompts or logs.
- No arbitrary page JavaScript from AI-generated plans.
- No navigation to a new host without the existing host policy.
- No AI-generated demographic, salary, authorization, or identity facts.
- No state mutation from renderer-only heuristics.
- No automatic archive unless the unavailable classifier has deterministic evidence or high-confidence AI evidence followed by verification.

## Testing and evaluation plan

### Unit tests

Add tests for:

- result-contract validation
- transition-policy matrix
- idempotency-key generation
- playbook matching
- playbook version selection
- answer-policy matching
- salary calculation
- unavailable-listing archive behavior
- safe-action allowlist
- repair-plan validation

### Fixture tests

Extend [test/fixtures/provider-adapters](../test/fixtures/provider-adapters) with sanitized page observations for:

- Dice available listing
- Dice unavailable listing
- Adzuna available listing
- Adzuna unavailable listing
- Greenhouse login
- Greenhouse application form
- Workday application form
- Google account chooser
- CAPTCHA page
- unknown demographic question
- salary range question

### Replay tests

Each replay fixture should assert:

1. Initial page classification.
2. Selected playbook.
3. Planned action.
4. Executor result.
5. Verification result.
6. Persisted checkpoint.
7. Final queue state.
8. No prohibited action occurred.

### Required metrics

Store or calculate:

- first-run completion rate
- repeat-run completion rate
- successful playbook reuse rate
- AI planning calls per application
- AI repair calls per application
- human interventions per application
- median steps per application
- retry recovery rate
- false unavailable rate
- incorrect-fill rate
- unsupported-site rate
- submission safety violations
- percentage of actions with verified evidence

## Delivery sequence

### Milestone 1 — Contracts and policy

Files:

- `electron/jobs/automation/result-contract.cjs`
- `electron/jobs/automation/transition-policy.cjs`
- `test/application-automation-result-contract.test.cjs`
- `test/application-automation-transition-policy.test.cjs`

Exit criteria:

- Every known queue outcome maps to one canonical result.
- Unavailable listings always leave the ready queue.
- Transition tests cover every result/outcome pair.

### Milestone 2 — Orchestrator wrapper

Files:

- `electron/jobs/automation/orchestrator.cjs`
- `electron/jobs/automation/observation.cjs`
- `electron/jobs/automation/planner.cjs`
- `electron/jobs/automation/executor.cjs`
- `electron/jobs/automation/verifier.cjs`
- `electron/main.cjs`

Exit criteria:

- Existing Dice path runs through the wrapper.
- Renderer does not directly perform workflow state transitions.
- One application can pause and resume from a persisted checkpoint.

### Milestone 3 — Playbooks

Files:

- `electron/migrations/0031_application_site_playbooks.sql`
- `electron/jobs/automation/playbook-registry.cjs`
- `electron/jobs/automation/repair-loop.cjs`
- `test/application-playbook-registry.test.cjs`

Exit criteria:

- First successful Dice path creates a candidate playbook.
- Second matching Dice application loads the playbook.
- A failed match does not silently execute stale selectors.

### Milestone 4 — Answer policies

Files:

- `electron/migrations/0032_application_answer_policies.sql`
- `electron/jobs/automation/answer-policy.cjs`
- `electron/jobs/application-fill-planner.cjs`
- `test/application-answer-policy.test.cjs`

Exit criteria:

- Approved profile answers are reused without repeated prompts.
- Salary uses job-specific rules: public range minimum plus 20% of range width; `$120,000` fallback when unavailable.
- Sensitive fields obey explicit policy and provenance.

### Milestone 5 — Trace and replay

Files:

- `electron/migrations/0033_application_workflow_steps.sql`
- `electron/jobs/automation/trace-store.cjs`
- `test/application-workflow-replay.test.cjs`
- `test/fixtures/application-replays/`

Exit criteria:

- A failed run can be replayed locally without reopening the external site.
- Every executed action has a verification record.
- Metrics can distinguish planner failure, executor failure, verifier failure, and site change.

### Milestone 6 — Multi-site rollout

Order:

1. Dice.
2. Adzuna.
3. Greenhouse.
4. Lever.
5. Workday.
6. Other ATS adapters only after fixture/replay coverage exists.

Do not add a new site by adding an isolated conditional to `main.cjs`. Add a playbook, adapter fixture, transition test, and replay trace.

## Definition of done

The meta workflow is ready for broader queue use when all of the following are true:

- A known playbook runs without an AI call on repeat jobs.
- A changed page triggers one bounded AI repair attempt.
- A successful repair is stored and reused.
- An unavailable listing is terminally archived and disappears from the ready queue.
- A retryable failure returns the same application to the queue without creating a duplicate workflow.
- Approved profile and salary policies fill repeat questions without unnecessary user stops.
- Sensitive answers obey explicit policy and are never inferred.
- Every action has an observation, plan, execution, verification, and final outcome record.
- Replay tests pass for all supported site fixtures.
- Final submission remains an explicit approval boundary.
- The queue can run through the full supported fixture set without requiring code changes for each individual failure.

## Immediate next action

Start with Milestone 1. Do not add more site-specific browser fixes until the result contract and transition policy exist. The first proof should be the unavailable-listing case that caused the recent queue loop: one deterministic classification, one central archive transition, one persisted trace, and one replay test.
