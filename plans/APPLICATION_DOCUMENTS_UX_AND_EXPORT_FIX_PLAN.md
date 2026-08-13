# Application Documents UX and Export Fix Plan

## Purpose

Repair the resume and cover-letter workflow so a candidate can generate, read,
review, approve, reopen, and export a document without seeing implementation
JSON or losing track of which application it belongs to.

## Confirmed defects

1. **PDF exports contain `undefined`.** The document renderer exposes database
   fields using snake_case names, but the PDF export handler reads `htmlText`.
   That alias is not populated, so Electron prints the literal string
   `undefined` instead of the generated document.
2. **The primary editor exposes internal JSON.** Generation uses structured JSON
   correctly for evidence provenance, but `ApplicationDocuments` renders that
   JSON in a textarea rather than rendering a readable resume or cover letter.
3. **The first action is mislabeled.** The UI always says `Regenerate`, even
   when no document version exists. The correct first-run action is `Generate
   resume` or `Generate cover letter`.
4. **Editing creates an impossible approval path.** `Save new version` assigns
   `user_edit_requires_review` as a validation error without running factual
   validation. Approval correctly rejects documents that have errors, so every
   manually saved document is permanently blocked from approval.
5. **Versioning is invisible and unexplained.** A saved version is stored in
   the local application database, not at the location the user chose for an
   export. The UI does not explain this distinction or make version history
   easy to review.
6. **Documents are hard to rediscover.** The pipeline does not visibly connect
   a job to its application workspace, document types, selected version,
   approval state, or export locations.
7. **Validation feedback is developer-facing.** Raw validation JSON does not
   tell a candidate which claim needs attention or what they can do next.

## Implementation sequence

### 1. Repair export data and make export outcomes visible

- Expose `plainText` and `htmlText` aliases in `documentToRenderer`, or have
  the export handlers render directly from the stored `content`.
- Ensure PDF export rejects an empty or non-document result before writing a
  file.
- Report the exact saved path after a successful PDF or text export.
- Add regression tests that assert both export formats contain expected resume
  text and never contain only `undefined`.

**Acceptance criteria:** A generated resume exported as PDF opens as readable
resume content. Text export also opens as readable content, and the app tells
the user exactly where each file was saved.

### 2. Replace the JSON-first editor with a document-first review UI

- Render a resume as headline, summary, skills, experience, and education.
- Render a cover letter as recipient, subject, paragraphs, and closing.
- Provide focused editing controls for user-facing text; never require JSON
  editing for normal use.
- Keep evidence IDs, raw document data, and diagnostics in an optional
  "Evidence and technical details" disclosure for advanced review.

**Acceptance criteria:** The initial generated result looks like a resume or
cover letter, and the normal review experience contains no JSON.

### 3. Make actions state-aware and understandable

- Show `Generate resume` / `Generate cover letter` when that document type has
  no versions; show `Regenerate` only after at least one version exists.
- Rename `Save new version` to `Save changes as new version` and explain that
  it preserves the prior version in the application workspace.
- Present the flow explicitly: draft -> review issues (if any) -> approve ->
  select for this application -> export.
- Explain that "Select" chooses the version associated with this job; it does
  not submit or upload anything.

**Acceptance criteria:** A first-time user can tell what every action does,
where the document is saved, and which action is available next.

### 4. Restore a valid factual-review and approval workflow

- After a user edit, rebuild the evidence catalog and run
  `validateGeneratedDocument` before creating the new version.
- Preserve explicit provenance for unchanged claims and require the reviewer
  to resolve unsupported or unproven additions.
- Replace generic raw errors with claim-level messages and a clear resolution
  action.
- Allow approval only when the current version passes validation; make that
  state visible before the user clicks Approve.

**Acceptance criteria:** A supported edit can be saved, reviewed, and
approved. An unsupported claim explains why approval is blocked and where to
fix it.

### 5. Make applications and documents discoverable from the pipeline

- Add an `Open application` / `Resume & documents` entry point to saved jobs
  that already have an application workspace.
- Display company, role, application status, each document type, selected
  version, approval state, last-updated date, and latest export paths.
- Make reopening an application deterministic after navigating away or
  restarting the app.

**Acceptance criteria:** From the pipeline, a user can identify which resume
belongs to each job and reopen it in one action.

### 6. Verify the actual user journey

- Add unit and integration tests for data mapping, edits, validation,
  approval, selection, reopening, and both export formats.
- Run `node --test test/*.test.cjs` and `npm.cmd run build`.
- Perform an Electron smoke test: start an application, generate a resume,
  review it, save supported edits, approve, select, reopen from the pipeline,
  and export readable PDF/text files.

**Acceptance criteria:** The end-to-end workflow works without JSON exposure,
ambiguous action labels, approval dead ends, or unusable exports.

## Implementation boundaries

- Keep the existing evidence-grounding and provenance requirements.
- Do not loosen approval rules merely to remove the error; make validation
  useful and actionable instead.
- Do not introduce application submission or browser automation as part of
  this repair.
