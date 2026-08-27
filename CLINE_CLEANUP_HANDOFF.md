# CLINE CLEANUP HANDOFF — for Hermes (ox-alpha)

Written 2026-08-26 after diagnosing the 10/10 failed queue run. Read fully before touching anything.
**Standing rule from the user:** plan-only until they say "make the change." Propose first, act second.

---

## 1. Situation

Cline (VS Code agent) integrated MiniSimplify into North Star across one large uncommitted
changeset. It never committed, never ran a full pipeline validation, and shipped with real
logic bugs. A full run on 2026-08-26 08:09–08:26Z blocked **all 10 items**. The architecture
is mostly sound; the junk is in specific spots listed below.

Repo: `C:\Users\joshr\OneDrive\Desktop\hermes\anthropic-certification-native`
App data DB (the real one): `%APPDATA%\ClaudeArchitectStudyCoachNative\executive-coach.sqlite`
(`electron/jobs.db` in-repo is a 0-byte decoy — ignore it).

Verification commands that work today:
- `npm run diagnose` → prints queue failure reasons (uses scripts/diagnose-pipeline.cjs + pipeline-diagnostics.cjs)
- `npm run build` → vite build, currently green (~2.3s)
- `node test/<file>.test.cjs` → module tests exist for every new automation module
- Live evidence: `application_queue_runs` / `application_queue_items` / `job_application_events` tables
  (event types include `minisimplify_fill`, `minisimplify_documents`, `automation_state_changed`)

## 2. Changeset inventory (all UNCOMMITTED)

Modified: 25 files, +1,169 / −232. Biggest: electron/main.cjs, application-browser.cjs,
application-automation.cjs, database.cjs, preload.cjs, JobsView.jsx, ApplicationQueueDrawer.jsx,
ApplicationBrowserPanel.jsx, coachProvider.mjs + 4 test files + package.json.

New (untracked):
- `electron/jobs/automation/`: account-credentials.cjs, autonomy-policy.cjs, minisimplify.cjs (212 ln),
  pipeline-diagnostics.cjs, pipeline-logger.cjs, pre-submit-review.cjs, question-answerer.cjs
- `electron/migrations/0037_application_autonomy.sql`
- `scripts/` (diagnose-pipeline.cjs), verify-bundle.cjs, ErrorBoundary.jsx
- 8 new test files under `test/`

## 3. THE ACTUAL JUNK — proven-broken behavior (fix these first)

Evidence from run `application-run-a4788f6d…b54abe41` (2026-08-26). Queue item IDs abbreviated.

### Group A — Document slots not found (4 apps: 11ce90f8, 709e1e22, 00159b2a, +1)
Every attempt logged `minisimplify_documents … 0 uploaded via DataTransfer`,
status `no_matching_slot` for both resume and cover_letter → blocker
`document_upload_repair_failed: resume:missing, cover_letter:missing`.
Root cause: employer sites hide `input[type=file]` behind styled buttons/shadow DOM;
MiniSimplify's slot finder only matches visible inputs. Fix target:
`minisimplify.cjs` document-injection section + `application-documents.cjs`.
This is the #2 defect from the original v1 review (binary-safe fill was fixed;
slot DISCOVERY was never solved).

### Group B — Page-open timeouts (4 apps: edc53f32, dee35923, d8400ee6, 1646bd0f)
checkpoint stage=`opening`, reasonCode=`application_flow_timeout`, AI repair logs
"AI opening repair did not produce a safe action", autoRetryCount exhausts, blocker
`retry_attempts_exhausted`. Died BEFORE any filling. Fix targets:
flow-detection timeout windows in `application-browser.cjs` /
"Bound provider flow detection" logic (commit 21720e1 area) + retry policy in
`application-queue-service.cjs`. Not a MiniSimplify problem.

### Group C — AI tailoring crashes (2 apps: 6bd849c8, 8c79fb7b)
- 6bd849c8: `OpenRouter returned malformed document JSON.` — no retry, item dead at attempt 2/3. Fix: retry-with-repair loop around the tailoring call (question-answerer/pre-submit pattern already exists to copy).
- 8c79fb7b: tailored resume rejected by the app's own strict validator ("Missing required resume field: omittedEvidenceIds/warnings; Numeric/date claim 171723 is not supported"). Validator demands schema fields the generator doesn't emit. Fix: make generator prompt/output contract match validator, or relax validator to warn-not-block. Files: wherever buildPreSubmitMessages/tailoring lives in main.cjs + the resume evidence validator.

### Group D — Unreadable questions filled anyway (app 2abbc690 — closest to success)
Documents uploaded ✓, 8 fields filled ✓, THEN safe pass flagged the same fields:
screening questions arrive as opaque hashes (`screeningQuestionAnswers["b8af6f"]`)
with reason "The screening question text is unavailable". MiniSimplify had already
filled them (see `minisimplify_fill` events: state→b8af6f, b8af73, linkedin→b8af76).
Two bugs in one:
1. SAFETY VIOLATION: filler writes answers into questions it cannot read.
   Fix: classify() must return null (skip) when question text is unrecoverable —
   never fill on hash-only hints.
2. Question text extraction fails on this provider's React state-keyed inputs —
   fix label resolution in `application-browser.cjs` snapshot (label came back as
   `page.label` only).

### E — Ghost bug from mid-integration
DB records `performAutonomousSubmission is not defined` (ReferenceError) from an
earlier attempt even though it's defined main.cjs:~979 and called ~3785. Likely
fixed since, but proves call/scope drift during Cline edits. Verify no other
function moved between definition and call site during cleanup.

## 4. File-level junk (delete/ignore list — ask user before deleting .md docs)

Safe to delete (regenerable clutter): `test-run.log` (28KB), `bundle-check-result.txt`,
`desktop-launch.log`, `verify-bundle.cjs` (one-shot checker — confirm), in-repo `electron/jobs.db` decoy.
Stale handoff docs (Aug 10–18 era, superseded): BUG_REPORT.md,
HERMES_HANDOFF_ADVANCED_SEARCH_REPORT_NOT_VISIBLE.md,
HERMES_HANDOFF_PROVIDER_ACCOUNTING_NOT_VISIBLE.md,
HERMES_HANDOFF_AI_JOB_SEARCH.md, HERMES_HANDOFF_CURRENT_JOB_SEARCH.md.
Current/keep: AUTONOMOUS_APPLICATION_AUTOMATION_PLAN.md, CHECKPOINT_NEXT_WORKFLOW_REFERENCE.md,
HERMES_APP_ARCHITECTURE_AND_STATUS.md, HERMES_JOB_SEARCH_AND_PIPELINE_GUIDE.md, AGENTS.md, README.md.

## 5. KEEP LIST — do not "clean up" these

- `automation/minisimplify.cjs` engine semantics derive from the user-approved v1 canonical
  (`job-application-packets/minisimplify.js`) — improve slot discovery/question-text handling only;
  don't rewrite the fill model. Autopilot overwrites, assistant fills-empties: intended.
- `autonomy-policy.cjs` purity (single owner of what's allowed without user)
- `pre-submit-review.cjs`, `question-answerer.cjs` bounded-AI-gate pattern
- `pipeline-diagnostics.cjs` + `scripts/diagnose-pipeline.cjs` + `npm run diagnose`
- All 8 new module tests; migration 0037; ErrorBoundary.jsx

## 6. Hygiene nits (low priority)

- 19 files carry LF→CRLF churn; add/normalize `.gitattributes` (`* text=auto eol=lf`) before commit.
- Zero stray console.log added (verified via diff) — keep it that way; use pipeline-logger.
- Commit strategy: land as several logical commits (engine / queue+browser / UI / tests/docs),
  NOT one mega-commit, so future bisecting works.

## 7. Recommended order

0. Baseline: run `npm run diagnose`, save output; commit nothing yet.
1. Fix Group D-1 (never fill unreadable questions) — smallest, highest-safety change.
2. Fix Group A (file slot discovery incl. hidden inputs / shadow DOM / label-wrapped buttons).
3. Fix Group C (OpenRouter JSON retry + validator/generator contract).
4. Fix Group B (opening timeouts — likely tuning + better wait-for-stable heuristics).
5. Delete file-level junk (§4), normalize EOL, split commits.
6. Validation gate: `npm run build` + full test suite + ONE single-application queue run
   against the Dice conglomerateit posting before any 9-app batch.

## 8. Hard rules carried over

- Never rely on Dice preloaded `resume-v5.pdf`; always attach tailored Resume.pdf + Cover Letter.pdf.
- User profile data comes from the app's approved store, not hardcoded values.
- Sponsorship/veteran Yes-No questions: evidence-only answering; bare guesses forbidden.
- After any successful batch: rotate Gmail password (it appeared in past chats).
