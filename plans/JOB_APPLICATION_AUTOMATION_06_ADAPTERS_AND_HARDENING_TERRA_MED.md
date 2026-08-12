# Stage 06 — ATS Adapters, Reliability, and Production Hardening

> Owner: Terra using medium reasoning
>
> Prerequisites: `JOB_APPLICATION_AUTOMATION_00_MASTER_HANDOFF_TERRA_MED.md` read, Stages 01–05 complete, and generic flow proven with fixtures
>
> Goal: improve real-world coverage without weakening the shared safety model

## Outcome

The generic application copilot remains the core. Add narrowly scoped ATS adapters based on actual failure evidence, beginning with the two systems encountered most often in the user’s saved pipeline. Greenhouse and Lever are reasonable initial candidates, but Terra must confirm this from saved-job domains or manual user evidence rather than assuming.

Do not promise universal support. Present coverage as:

- Supported: adapter tested for this form family/version.
- Guided: generic observation and partial fill work; some manual completion expected.
- Manual: assistant can track documents/questions, but cannot safely inspect/fill this page.

## Adapter contract

Each adapter lives under `electron/jobs/adapters/` and implements a versioned interface:

```js
{
  key: 'greenhouse',
  version: 1,
  matches(context),
  inspect(context),
  locateField(fieldFingerprint, context),
  fillSupportedControl(operation, context),
  focusField(fieldFingerprint, context),
  detectPageState(context),
  detectConfirmation(context)
}
```

Adapters may improve selectors, custom controls, multipage detection, and confirmation markers. They may not:

- bypass `application-policy.cjs`;
- produce or approve answers;
- access the database directly;
- execute model-generated code;
- click final submit;
- solve authentication/CAPTCHA;
- loosen navigation, permission, or remote-content isolation.

## Adapter selection

Use deterministic host/path/form signals. If multiple adapters match or confidence is low, use the generic adapter. Record adapter key/version and bounded reason signals.

Never allow a page to select an adapter by embedding an instruction in visible text.

## Diagnostics migration

Only if existing application events are insufficient, create `electron/migrations/0013_job_application_adapter_diagnostics.sql` with bounded fields:

- session/application ID.
- adapter key/version.
- anonymized form fingerprint.
- operation category.
- outcome/reason code.
- duration.
- Electron/app version.
- created timestamp.

Do not persist employers’ full form text, answer values, PII, cookies, tokens, DOM, or selectors containing PII.

All diagnostics remain local unless the user explicitly exports them.

## Fixture strategy

Create local, version-controlled fixtures representing behavior rather than copying copyrighted production pages wholesale:

- Standard single-page form.
- Multipage form.
- Custom combobox.
- Dynamic conditional questions.
- Resume upload and cover-letter upload.
- Required checkbox.
- Voluntary disclosure page.
- Legal attestation page.
- Login redirect.
- CAPTCHA/anti-bot marker.
- Confirmation and ambiguous completion pages.
- React rerender that invalidates selectors.
- iframe and shadow-DOM unsupported cases.

Sanitize any structure learned from real forms. Do not check in real candidate data or employer tokens.

## Reliability features

Implement after adapter basics:

- Adapter circuit breaker after repeated failures in one session.
- Generic fallback when an adapter’s fingerprint no longer matches.
- Per-operation timeout and cancellation.
- Idempotent filling: do not overwrite a non-empty user-entered field unless the user explicitly selected it.
- Rerender detection and stale-plan invalidation.
- Crash-safe persistence of approved answers and selected documents.
- Clear unsupported-state messaging.
- Local export of redacted diagnostics for debugging.

Do not add automatic background retries against employer sites.

## Security review checklist

Before calling this production-ready, verify:

1. All remote views are sandboxed with Node integration disabled and context isolation enabled.
2. The application session has both permission handlers and defaults to deny.
3. New-window and navigation policies use parsed URLs.
4. IPC sender, input, length, enum, and ID validation cover every application method.
5. Remote pages receive no privileged bridge.
6. No code path executes model-produced JavaScript.
7. No code path clicks or indirectly activates final submit.
8. Sensitive, legal, CAPTCHA, password, and MFA fields fail closed.
9. Routine logs contain no answer values, tokens, cookies, or full page contents.
10. Database and exported files use the existing local-first storage model.
11. Clearing a site session targets only the dedicated application partition after user confirmation.
12. Academy and main-renderer sessions remain isolated.

## Performance limits

Define and test bounds, for example:

- Maximum inspected fields per page: 300.
- Maximum select options retained per field: 200.
- Maximum normalized label/question length: 1,000 characters.
- Maximum AI-classified ambiguous fields per scan: a small bounded batch.
- One fill operation active per application session.
- One document-generation operation active per document type/application.
- Debounced observation rather than continuous scraping.

Exact numbers may be adjusted with evidence, but bounds must exist.

## Rollout

Use local feature flags:

- application workspace
- document generation
- browser observer
- controlled autofill
- automatic file upload
- ATS adapter keys

Recommended rollout:

1. Generic observer + manual forms.
2. Generic safe text/select fill.
3. First adapter in guided mode.
4. First adapter in supported mode after fixture and real-page verification.
5. Second adapter.
6. File upload enabled separately after reliability evidence.

Never use a flag to enable automatic final submission.

## Tests

Add adapter-specific unit/fixture tests plus end-to-end lifecycle tests.

Required cross-adapter contract cases:

1. Every adapter emits normalized descriptors accepted by the shared inspector schema.
2. Every mutation passes through the policy and fill engine.
3. Every adapter blocks submit and sensitive/legal controls.
4. Adapter mismatch falls back safely.
5. Selector/rerender failure stops rather than filling the wrong field.
6. User-entered non-empty values are preserved.
7. Navigation and permission policy cannot be overridden by adapters.
8. Redacted diagnostics contain no fixture PII values.
9. End-to-end fixture flow survives app/database restart at stage boundaries.
10. Current search, pipeline, Academy, and roadmap tests remain green.

## Manual verification matrix

For each supported adapter, record:

- ATS and observed form version/date.
- Login required or not.
- Single/multipage.
- Identity fields.
- Employment/education controls.
- Custom questions.
- File upload.
- Sensitive/legal handling.
- Confirmation detection.
- Unsupported controls.
- Result: supported/guided/manual.

Use test applications or stop before submission on real opportunities unless the user actually intends to apply.

## Final completion criteria

The project is complete when:

- A saved job can move through a persistent workspace, grounded documents, observed form, approved fill, user submission, confirmation, and follow-up.
- The process is resumable after app restart.
- Unsupported sites degrade to guided/manual mode without data loss.
- No protected action can be reached through adapter or renderer input.
- At least two high-value ATS families have reliable fixture coverage and documented manual verification.
- All repository tests and production build pass.
- Known limitations and supported-site claims are visible to the user.

Do not extend this project into unattended or bulk applications, CAPTCHA bypass, recruiter outreach, or inbox monitoring without a separate approved product plan.
