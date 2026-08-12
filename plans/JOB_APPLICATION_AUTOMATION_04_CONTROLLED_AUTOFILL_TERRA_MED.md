# Stage 04 — Controlled Autofill and Question Resolution

> Owner: Terra using medium reasoning
>
> Prerequisites: `JOB_APPLICATION_AUTOMATION_00_MASTER_HANDOFF_TERRA_MED.md` read, Stages 01–03 complete, and observer fixtures stable
>
> Goal: fill only user-approved, policy-permitted fields and selected documents

## User-visible outcome

- The assistant builds a fill plan from the current form snapshot.
- The user reviews exactly what will be inserted and where it came from.
- `Fill approved fields` populates safe fields and selected documents.
- Unknown, sensitive, legal, authentication, CAPTCHA, and submit controls remain untouched.
- Free-text questions can receive evidence-grounded drafts that require approval.
- After filling, the assistant rescans and reports completed, failed, changed, and unresolved fields.

## Central rule

No ATS adapter may directly decide that a field is safe to fill. The adapter maps the page to normalized descriptors and field handles. `application-policy.cjs` returns the permitted action. `application-fill-engine.cjs` enforces that decision again immediately before mutation.

## Fill plan

Create a persisted or reproducible plan DTO:

```js
{
  sessionId: '',
  applicationId: '',
  pageFingerprint: '',
  createdAt: '',
  fields: [{
    fieldFingerprint: '',
    category: '',
    label: '',
    action: 'fill' | 'suggest' | 'ask' | 'leave_blank' | 'blocked',
    displayValue: '',
    protectedValueRef: '',
    provenance: [],
    confidence: 0,
    reasonCode: ''
  }]
}
```

Do not put secrets in renderer DTOs. `protectedValueRef` is resolved in the main process after the user approves the plan. Normal profile values may be displayed, but password/token values must never be part of the system.

Invalidate a plan when the page fingerprint changes. Never apply a stale plan to a newly rendered page.

## Policy implementation

Complete `electron/jobs/application-policy.cjs` with pure functions and exhaustive tests.

Policy inputs:

- normalized field category and confidence;
- saved verified profile;
- structured resume evidence;
- selected document versions;
- approved answer vault;
- application-specific answers;
- page/ATS metadata.

Policy outputs must follow Stage 00. Required hard blocks:

- password, MFA, CAPTCHA;
- legal certification/attestation/signature;
- voluntary demographic/disability/veteran questions;
- final submit/send/complete controls;
- unknown field with low confidence;
- values without provenance;
- any field the user excluded from the current plan.

## Free-text answer generation

For application questions such as “Why are you interested?” or “Describe relevant experience”:

1. Normalize and bound the question.
2. Classify it; reject legal/sensitive questions.
3. Build an evidence catalog from the profile, resume, and saved job.
4. Ask OpenRouter for structured JSON with answer text and evidence IDs.
5. Validate all evidence IDs and claims.
6. Save as `draft`.
7. Require the user to edit/approve.
8. Only then make it eligible for insertion.

An approved answer can be reusable only when the user explicitly chooses `Save for future applications`. Reuse still passes through current field classification and policy.

## Fill engine

Create `electron/jobs/application-fill-engine.cjs`.

Requirements:

- Accept only a server-created plan ID/session ID, not arbitrary selectors and values from the renderer.
- Re-read the current page fingerprint.
- Re-run policy checks.
- Fill sequentially or in small bounded batches.
- Dispatch the browser events expected by frameworks without bypassing page validation.
- Verify the resulting visible/non-secret value.
- Record one bounded result per field.
- Stop if navigation occurs, the form re-renders unexpectedly, or too many fields fail.
- Rescan after completion.

Never construct executable JavaScript by interpolating labels, selectors, page text, model output, or answer values. Pass serialized data safely into static audited functions or use isolated-world execution with structured arguments supported by the current Electron API.

### Supported controls in the first implementation

- Text, email, tel, URL, and number inputs.
- Textareas.
- Native selects.
- Radio groups and checkboxes only when the exact option is approved and unambiguous.
- File inputs for selected document versions after the upload spike passes.

Defer custom comboboxes, date pickers, rich-text editors, iframes, and shadow-DOM components until an adapter handles them safely.

## File upload spike

Browser JavaScript cannot safely assign local file paths to file inputs. Before implementing uploads, create a focused spike using the current Electron-supported DevTools protocol through `webContents.debugger`, or another documented Electron mechanism.

Requirements:

- User selects/approves a specific exported document version.
- Main process resolves its exact local path.
- Only an inspected `input[type=file]` classified as resume or cover letter is targeted.
- Accepted MIME/extensions are checked.
- The debugger attaches only for the bounded operation and detaches in `finally`.
- The engine verifies the displayed filename after upload.
- Raw filesystem paths are not sent to remote page scripts or the local renderer unnecessarily.

If the spike is unreliable across supported Electron versions, ship guided manual upload for Stage 04 and record automatic upload as blocked. Do not use brittle hacks to satisfy the checkbox.

## UI

The side panel should support:

- `Build fill plan`.
- Review grouped as Fill / Needs approval / Needs answer / Left untouched / Blocked.
- Per-field include/exclude.
- Answer editor with evidence drawer.
- `Approve answer` and optional `Save for future applications`.
- `Fill approved fields`.
- Post-fill verification report.
- Easy focus/scroll to unresolved fields where the adapter can do so safely.

The user must be able to edit the employer form manually at any time. A rescan should detect that a user-entered value exists without copying sensitive values into SQLite.

## Diagnostics

Persist bounded operational events, not page contents:

- plan built;
- field fill attempted/succeeded/failed;
- reason code;
- adapter key/version;
- page fingerprint;
- duration;
- upload attempted/result;
- stop reason.

Redact answer values from routine diagnostics. Provenance and approved answers live in their purpose-built tables.

## Tests

Add at minimum:

- `test/application-policy.test.cjs`
- `test/application-fill-plan.test.cjs`
- `test/application-fill-engine.test.cjs`
- `test/application-answer-generation.test.cjs`

Required cases:

1. Unknown fields never auto-fill.
2. Sensitive and legal fields remain untouched even if an adapter misclassifies them once; defense-in-depth heuristics must block obvious cases.
3. Submit controls cannot enter a fill plan.
4. A stale page fingerprint invalidates the plan.
5. User-excluded fields are not filled.
6. Missing provenance prevents factual insertion.
7. User-approved global answers are reusable only under their saved policy.
8. Model prompt injection cannot change action enums or cause execution.
9. Fill verification catches rejected/rewritten values.
10. Navigation during fill stops the batch safely.
11. File upload targets only the approved document and expected input.
12. A failed fill leaves the application resumable.

## Manual verification

Use controlled local fixtures before any real site:

1. Build a plan and compare every value to its provenance.
2. Exclude one field and verify it remains empty.
3. Approve one free-text answer and fill it.
4. Verify sensitive/legal/submit controls remain untouched.
5. Trigger a fixture re-render and verify stale-plan rejection.
6. Upload selected test documents if the spike passed.
7. Repeat on one supported real ATS application with the user present, stopping before submission.

## Stage gate

Stop when approved-field filling and post-fill verification are reliable. Do not click final submission, infer that an application was submitted, or move a job to `applied`.
