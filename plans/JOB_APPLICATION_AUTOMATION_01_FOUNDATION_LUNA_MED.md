# Stage 01 — Application Workspace Foundation

> Owner: Luna using medium reasoning
>
> Prerequisite: read `JOB_APPLICATION_AUTOMATION_00_MASTER_HANDOFF_TERRA_MED.md`
>
> Goal: create a persistent, resumable application workspace without AI generation or browser automation

## User-visible outcome

- A search result offers `Start application` in addition to `Open listing` and `Save to pipeline`.
- `Start application` saves the job first when necessary, then opens its application workspace.
- A saved pipeline card offers `Continue application`.
- The workspace shows job facts, source URL, status, readiness checklist, missing profile information, documents placeholder, questions placeholder, and activity history.
- Closing and reopening the desktop app preserves the workspace.
- Nothing is submitted and no employer page is embedded yet.

## Scope

### In scope

- Application persistence and state transitions.
- Expanded candidate profile fields needed for common applications.
- A reusable answer vault for explicit user-approved answers.
- Workspace UI and application checklist.
- Start/resume/abandon controls.
- Application event history.
- Transactional mapping between application state and pipeline state where required.

### Out of scope

- AI document generation.
- PDF/DOCX export.
- Embedded application browser.
- DOM inspection or form filling.
- Submission confirmation.
- ATS-specific logic.

## Database migration

Create `electron/migrations/0010_job_application_foundation.sql`.

### `job_applications`

Recommended columns:

```sql
id TEXT PRIMARY KEY NOT NULL,
job_id TEXT NOT NULL,
status TEXT NOT NULL DEFAULT 'drafting',
application_url TEXT NOT NULL DEFAULT '',
ats_key TEXT NOT NULL DEFAULT 'unknown',
readiness_json TEXT NOT NULL DEFAULT '{}',
unresolved_count INTEGER NOT NULL DEFAULT 0,
started_at TEXT NOT NULL,
last_activity_at TEXT NOT NULL,
submitted_at TEXT,
confirmation_number TEXT NOT NULL DEFAULT '',
confirmation_url TEXT NOT NULL DEFAULT '',
withdrawn_at TEXT,
created_at TEXT NOT NULL,
updated_at TEXT NOT NULL,
deleted_at TEXT,
FOREIGN KEY(job_id) REFERENCES job_opportunities(id)
```

Add an index on `(job_id, deleted_at)` and status/activity indexes. Enforce one non-deleted active application per job with application code and, if supported by the project SQLite version, a partial unique index.

### `job_application_answers`

This table is both the per-application answer record and the seed for a reusable answer vault.

```sql
id TEXT PRIMARY KEY NOT NULL,
application_id TEXT,
question_key TEXT NOT NULL,
question_text TEXT NOT NULL DEFAULT '',
normalized_category TEXT NOT NULL DEFAULT 'unknown',
answer_text TEXT NOT NULL DEFAULT '',
answer_json TEXT NOT NULL DEFAULT 'null',
scope TEXT NOT NULL DEFAULT 'application',
sensitivity TEXT NOT NULL DEFAULT 'normal',
approval_status TEXT NOT NULL DEFAULT 'draft',
autofill_policy TEXT NOT NULL DEFAULT 'ask',
provenance_json TEXT NOT NULL DEFAULT '[]',
approved_at TEXT,
created_at TEXT NOT NULL,
updated_at TEXT NOT NULL,
deleted_at TEXT
```

`scope` is `application` or `global`. A global answer must still be reviewed when policy says first-use review or per-application review.

### `job_application_events`

```sql
id TEXT PRIMARY KEY NOT NULL,
application_id TEXT NOT NULL,
event_type TEXT NOT NULL,
summary TEXT NOT NULL DEFAULT '',
metadata_json TEXT NOT NULL DEFAULT '{}',
created_at TEXT NOT NULL
```

Events are an append-only user-facing audit trail. Do not store secrets or full page contents in metadata.

### Profile additions

Add only fields required for application completion and not already present:

- preferred/legal name distinction if desired by the user.
- street, city, state, postal code, country.
- LinkedIn, GitHub, portfolio already exist in the database but must become editable in the UI.
- explicit work authorization and sponsorship controls.
- desired salary, notice period/available start date, relocation willingness, travel willingness.

Do not add protected-trait or voluntary disclosure fields to the general profile.

## Domain layer

Create `electron/jobs/application-domain.cjs` with:

- Allowed statuses and transition map.
- `createOrResumeApplication(job, profile)`.
- `transitionApplication(applicationId, nextStatus, context)`.
- `computeApplicationReadiness({ job, profile, resume, application })`.
- `recordApplicationEvent(...)`.
- Bounded validation helpers.

Readiness should be structured, not one opaque AI score:

```js
{
  ready: false,
  completed: ['job_saved', 'application_url'],
  missing: ['full_name', 'email', 'phone', 'master_resume'],
  warnings: ['work_authorization_not_set'],
  blocked: []
}
```

This stage’s readiness is deterministic.

## Database API

Extend `electron/database.cjs` with a dedicated namespace:

```js
applications: {
  createOrResume(input),
  get(id),
  getForJob(jobId),
  listActive(),
  transition(input),
  abandon(id),
  listEvents(applicationId),
  recordEvent(input),
  listAnswers(applicationId),
  saveAnswer(input)
}
```

Do not make the renderer compose SQL-shaped records. Map rows to camelCase DTOs in the database/domain boundary.

Any transition to `submitted` is reserved for Stage 05. Reject it in Stage 01 unless called through a future trusted completion service.

Update the Drizzle table declarations, `tableMap`, and exported `tables` object for every new table in addition to adding the SQL migration. Keep migration filenames sortable because `database.cjs` applies unapplied `.sql` files in filename order. Exercise the real migration loader in persistence tests rather than creating test tables by hand.

## IPC and preload

Add validated handlers/methods for:

- `jobs:applications:start`
- `jobs:applications:get`
- `jobs:applications:get-for-job`
- `jobs:applications:list`
- `jobs:applications:transition`
- `jobs:applications:abandon`
- `jobs:applications:answers:list`
- `jobs:applications:answers:save`

Validate that IDs match the repository’s existing safe ID rules. Validate lengths, enums, array bounds, and sender identity.

## Renderer

Create `src/jobs/ApplicationWorkspace.jsx` and `src/jobs/ApplicationChecklist.jsx` rather than putting the full workspace into `JobsView.jsx`.

Recommended workspace sections:

1. Header: role, company, application status, closing date, source.
2. Readiness: completed, missing, warnings, blockers.
3. Candidate facts: editable profile/application preferences.
4. Documents: placeholder stating Stage 02 is not yet available.
5. Questions: saved answers and unresolved-answer placeholder.
6. Activity: application event timeline.
7. Actions: save, pause/return to pipeline, abandon.

`Start application` behavior from a search result:

1. If the job is not saved, run the existing save logic and receive the persisted job DTO.
2. Call `startJobApplication({ jobId })`.
3. Open the workspace.
4. Do not open the external listing automatically.

Refactor `saveMatch` to return the saved job. Preserve its existing user feedback and deduplication behavior.

## Tests

Add at minimum:

- `test/job-application-domain.test.cjs`
- `test/job-application-persistence.test.cjs`
- `test/job-application-view.test.cjs`

Required cases:

1. Start creates one application and a second start resumes it.
2. Application survives database close/reopen.
3. Invalid transitions are rejected.
4. Renderer cannot set `submitted` directly.
5. Readiness reports missing profile fields deterministically.
6. Saving a global answer preserves provenance and approval status.
7. Abandon is recoverable/soft-deleted or explicitly terminal according to the domain contract.
8. Existing `Save to pipeline` still works.
9. `Start application` saves an unsaved search match first.
10. No browser or submission IPC is introduced.

## Manual verification

1. Run a search and start an application from a result.
2. Confirm the job appears once in the pipeline.
3. Close and reopen the app.
4. Continue the application from the pipeline.
5. Complete a missing profile field and confirm readiness updates.
6. Abandon a test application and confirm the job itself remains in the pipeline.

## Stage gate

Stop when the persistent workspace and deterministic readiness are complete. Do not generate documents, create a `WebContentsView`, inspect remote pages, or fill forms in this stage.

Luna’s completion note must enumerate the application/job/answer/event DTOs and every new `window.desktopShell` method so Terra can consume the contract without reverse-engineering the implementation.
