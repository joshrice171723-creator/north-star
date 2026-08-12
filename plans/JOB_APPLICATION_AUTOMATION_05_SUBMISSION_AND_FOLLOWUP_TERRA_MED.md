# Stage 05 — Final Review, Submission Confirmation, and Follow-up

> Owner: Terra using medium reasoning
>
> Prerequisites: `JOB_APPLICATION_AUTOMATION_00_MASTER_HANDOFF_TERRA_MED.md` read and Stages 01–04 complete
>
> Goal: complete the application lifecycle while keeping final submission under user control

## User-visible outcome

- A final review screen summarizes documents, filled fields, unresolved questions, warnings, and blocked controls.
- The user can jump to anything unresolved.
- When ready, the app clearly instructs the user to submit on the employer page.
- The assistant watches for confirmation signals but never clicks Submit.
- After submission, the user confirms the outcome or enters a confirmation number.
- The application is recorded, the pipeline moves to `Applied`, and a follow-up action/date is created.
- Ambiguous outcomes remain `submitted_unverified` or `ready_to_submit`; they are not falsely marked complete.

## Final readiness gate

Create `electron/jobs/application-confirmation.cjs` with a deterministic readiness check.

Required blockers:

- required visible fields still empty;
- unresolved required questions;
- document version missing or not approved where required;
- validation errors from generated documents;
- form-level error messages;
- legal/signature fields not completed by the user;
- CAPTCHA/MFA active;
- page state unknown or stale.

Warnings may include optional blanks, unsupported custom controls, salary answers needing a final look, or unverified employer details.

`ready_to_submit` means the assistant found no known blocker. It is not a guarantee the site will accept the form.

## Submission boundary

The final submit control must remain fully owned by the remote page and the user.

Do not:

- invoke `.click()` on submit controls;
- synthesize Enter on a submit form;
- call `requestSubmit()` or `submit()`;
- trigger remote form actions through CDP;
- hide or overlay the employer’s submit control;
- automatically retry a failed submission.

The local side panel may display `Submit on employer site`, which focuses or scrolls to the employer’s submit area but performs no activation.

## Confirmation detection

Observe bounded signals after the user acts:

- navigation to a likely confirmation path;
- page title/heading containing bounded confirmation language;
- a displayed application/confirmation ID;
- disappearance of the form plus success state;
- known adapter-specific confirmation marker.

Return:

```js
{
  state: 'confirmed' | 'likely' | 'ambiguous' | 'failed',
  signals: [],
  confirmationNumber: '',
  confirmationUrlRedacted: '',
  observedAt: ''
}
```

Rules:

- `confirmed`: still show a user acknowledgment before final database transition.
- `likely` or `ambiguous`: ask `Was your application submitted successfully?`.
- `failed`: keep the workspace open and show the site’s bounded visible error.
- Never store full confirmation-page HTML or secret-bearing URL parameters.

## Transactional completion

Add one trusted database/domain operation such as `completeSubmission(...)` that performs one transaction:

1. Validate current application can transition to `submitted`.
2. Set application `status = submitted` and `submitted_at`.
3. Save bounded confirmation metadata.
4. Set job `stage = applied` and `applied_at`.
5. Set `next_action` and `follow_up_date` using user preference/default.
6. Append a submission event.

Do not expose a generic renderer operation that can set arbitrary job and application fields in lieu of this transaction.

Default follow-up may be seven calendar days after submission, but make it visible and editable before saving. Do not send email or contact anyone.

## Application archive package

Provide a local application record view containing:

- Job/company/title and source URLs.
- Submitted timestamp.
- Confirmation number and redacted confirmation URL.
- Exact selected resume and cover-letter versions.
- Approved answers used.
- Unresolved warnings accepted by the user.
- Follow-up date and next action.
- Timeline events.

Do not duplicate browser cookies or credentials into the archive.

Optionally export a local JSON or PDF receipt only through an explicit user action. Keep it clearly separate from the resume/cover letter.

## Renderer

Create or complete a `Final review` mode in `ApplicationWorkspace.jsx`.

Recommended sections:

1. Completion meter based on known required items.
2. Selected document filenames/versions.
3. Filled and manually completed fields.
4. Unresolved required items.
5. Warnings accepted by the user.
6. Blocked/sensitive/legal items that require manual action.
7. Employer-page submit instruction.
8. Submission outcome confirmation.
9. Follow-up date/action.

After completion, `Continue application` becomes `View application record`. Keep `Open listing` available.

## IPC

Add narrow operations:

- Compute final review.
- Start confirmation observation window.
- Get bounded confirmation result.
- Complete submission transaction after user acknowledgment.
- Record unsuccessful/abandoned attempt without marking applied.
- Update follow-up date/action.

Do not add a `submitApplication` IPC method.

## Tests

Add at minimum:

- `test/application-final-review.test.cjs`
- `test/application-confirmation.test.cjs`
- `test/application-submission-transaction.test.cjs`

Required cases:

1. Required unresolved fields block ready state.
2. Optional fields do not block but are reported.
3. No code path programmatically activates submit.
4. Ambiguous confirmation does not mark the application submitted without user acknowledgment.
5. Completion updates application and job atomically.
6. A transaction failure updates neither record.
7. Applied date and follow-up survive database reopen.
8. Selected document versions and approved answers remain linked to the archive.
9. Confirmation URLs are redacted.
10. Failed submission leaves the workspace resumable.

## Manual verification

1. Complete a local fixture application manually.
2. Verify final review catches a required blank.
3. Fill it manually and rescan.
4. Click the fixture’s submit control yourself.
5. Verify confirmation detection and user acknowledgment.
6. Confirm the pipeline moves to Applied exactly once.
7. Restart and inspect the archived application record/follow-up.
8. Test an ambiguous fixture and verify it does not auto-complete.

## Stage gate

Stop when the user-controlled submission lifecycle and follow-up persistence are reliable. Do not add mass-apply queues, background submission, auto-email, or new ATS adapters in this stage.
