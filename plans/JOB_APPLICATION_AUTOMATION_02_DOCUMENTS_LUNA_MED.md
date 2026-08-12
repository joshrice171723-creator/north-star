# Stage 02 — Evidence-Grounded Documents

> Owner: Luna using medium reasoning
>
> Prerequisites: `JOB_APPLICATION_AUTOMATION_00_MASTER_HANDOFF_TERRA_MED.md` read and Stage 01 complete
>
> Goal: generate, edit, version, validate, and export application-ready resume and cover-letter files

## User-visible outcome

Inside an application workspace, the user can:

- Generate a tailored resume and cover letter for the saved job.
- See which master-resume evidence supports each factual claim.
- Review warnings for unsupported or missing requirements.
- Edit generated content without overwriting the master resume.
- Save multiple document versions and select the active upload version.
- Export application-ready PDF files plus plain-text fallback files.
- Regenerate one document without destroying prior versions.

No employer page is opened or modified in this stage.

## Design principles

- The master resume is immutable source evidence during generation.
- The saved job description is untrusted input and must be clearly delimited in prompts.
- Generation must return structured JSON, not an opaque blob.
- Every factual bullet or claim must reference one or more evidence IDs.
- Unsupported claims are rejected or marked for user correction; they are never quietly accepted.
- Document output is versioned per application.

## Migration

Create `electron/migrations/0011_job_application_documents.sql`.

### `job_application_documents`

Recommended columns:

```sql
id TEXT PRIMARY KEY NOT NULL,
application_id TEXT NOT NULL,
document_type TEXT NOT NULL,
version INTEGER NOT NULL,
status TEXT NOT NULL DEFAULT 'draft',
title TEXT NOT NULL DEFAULT '',
content_json TEXT NOT NULL DEFAULT '{}',
plain_text TEXT NOT NULL DEFAULT '',
html_text TEXT NOT NULL DEFAULT '',
provenance_json TEXT NOT NULL DEFAULT '[]',
validation_json TEXT NOT NULL DEFAULT '{}',
source_resume_version INTEGER,
model_name TEXT NOT NULL DEFAULT '',
prompt_version TEXT NOT NULL DEFAULT '',
is_selected INTEGER NOT NULL DEFAULT 0,
exported_pdf_path TEXT NOT NULL DEFAULT '',
exported_text_path TEXT NOT NULL DEFAULT '',
created_at TEXT NOT NULL,
updated_at TEXT NOT NULL,
deleted_at TEXT
```

Add unique `(application_id, document_type, version)` and indexes for selected/version lookup. Enforce at most one selected non-deleted version of each document type per application in a transaction.

Allowed document types initially: `resume`, `cover_letter`. Allowed statuses: `draft`, `needs_review`, `approved`, `superseded`.

## Evidence preparation

Create stable evidence IDs from the stored master resume and profile before calling AI, for example:

```text
profile.full_name
profile.work_authorization
experience.0.company
experience.0.role
experience.0.bullets.2
education.0.degree
skills.technical.3
achievement.1
```

If the current master resume only has `rawText`, use bounded source spans with IDs such as `resume.raw.0001`. Do not claim structured certainty that is not present. Stage 02 may add a deterministic parser/editor, but AI-extracted structure must be presented for user confirmation before becoming trusted evidence.

## Generation service

Create `electron/jobs/application-documents.cjs`.

Responsibilities:

- Build bounded, prompt-injection-resistant messages.
- Request strict JSON through the existing OpenRouter wrapper.
- Parse and validate returned JSON.
- Validate every evidence ID against the supplied evidence catalog.
- Reject unknown evidence IDs.
- Detect obvious unsupported numeric/date/company claims.
- Render deterministic plain text and HTML from validated structured content.
- Persist a new immutable version.

Suggested resume output contract:

```js
{
  headline: '',
  summary: [{ text: '', evidenceIds: [] }],
  skills: [{ text: '', evidenceIds: [] }],
  experience: [{
    company: '', title: '', dates: '',
    bullets: [{ text: '', evidenceIds: [] }]
  }],
  education: [],
  omittedEvidenceIds: [],
  warnings: []
}
```

Suggested cover-letter output contract:

```js
{
  recipient: '',
  subject: '',
  paragraphs: [{ text: '', evidenceIds: [] }],
  closing: '',
  warnings: []
}
```

Use job title/company from the normalized saved job only. Do not infer recruiter or hiring-manager names.

## Validation behavior

Categorize validation findings:

- `error`: unknown evidence ID, invented employer/date/degree/metric, malformed structure.
- `warning`: important job requirement absent from candidate evidence, generic prose, job fact not independently verified.
- `info`: keyword intentionally omitted, formatting adjustment.

Documents with errors cannot become `approved` or selected for upload. User edits that add new factual claims must either attach provenance or remain marked `needs_review`.

Do not pretend automated semantic validation is perfect. The UI must state that the user owns final factual review.

## Export architecture

Implement exports in the Electron main process.

Required initial formats:

- PDF suitable for ATS upload.
- Plain text fallback.

Render PDF from deterministic local HTML using an offscreen/local trusted `webContents` and `printToPDF`, or another repository-compatible approach. Do not load remote assets. Embed or use system-safe fonts. Use a simple one-column ATS-friendly layout with selectable text, standard headings, no icons, no tables for experience, and no decorative sidebars.

Use an explicit save dialog. Store only the selected export path after successful write. Validate that export input belongs to the requested application and document version.

DOCX is optional and should be deferred unless a stable library is deliberately added and tested. PDF plus text is sufficient for the first browser-filling stage.

## IPC and preload

Add narrow methods for:

- Generate document.
- List versions.
- Get one version.
- Save user edits as a new version.
- Validate a version.
- Approve/select a version.
- Export selected version.

Generation should report `loading`, `success`, and structured failure states. Prevent duplicate concurrent generation for the same application/document type.

## Renderer

Create `src/jobs/ApplicationDocuments.jsx`.

Show:

- Resume and cover-letter tabs.
- Current version and history.
- Editable structured preview.
- Evidence drawer for the selected sentence/bullet.
- Validation summary.
- Regenerate, save new version, approve/select, export PDF, export text.
- A clear `AI draft — verify every claim` label until approved.

Do not expose raw prompts, API keys, or irrelevant API audit content in the normal workspace UI.

## Tests

Add at minimum:

- `test/application-documents.test.cjs`
- `test/application-document-persistence.test.cjs`
- `test/application-document-rendering.test.cjs`

Required cases:

1. Job-description prompt injection is delimited and cannot alter the output contract.
2. Unknown evidence IDs fail validation.
3. Unsupported metrics/dates produce errors.
4. OpenRouter failure leaves prior versions intact.
5. Regeneration creates a new version.
6. Selecting a version unselects the previous version transactionally.
7. Documents survive database reopen.
8. HTML escapes user/model content.
9. PDF export contains selectable text and does not fetch remote assets.
10. Export cancellation is not treated as an error.
11. No employer page is opened or modified.

## Manual verification

1. Generate both documents for a saved job.
2. Inspect evidence for several claims.
3. Intentionally add an unsupported claim and verify it is blocked from approval.
4. Save an edit as a new version.
5. Select the approved versions.
6. Export PDF/text and open the files.
7. Restart the app and confirm all versions remain.

## Stage gate

Stop after grounded document generation, editing, versioning, and export work. Do not add an embedded browser, DOM inspection, file upload, or form filling.

Luna’s completion note must give Terra the exact selected-document DTO, export-path resolution API, validation result schema, and test fixture IDs that Stage 04 will use for upload planning.
