# Job Application Automation — Next Session Handoff

**Last verified:** 2026-08-13  
**Branch:** `application_automation_02_of_06`  
**Working tree:** clean at handoff

## What is working

The local-first job pipeline now supports this usable path:

1. Search or save a job and start an application workspace.
2. Generate, review, approve, select, and export grounded resume and cover-letter versions.
3. Open the employer page in an isolated `WebContentsView` application panel.
4. Route a user-triggered `target=_blank` application link (such as Remotive → Workada) into that same isolated panel instead of creating an uncontrolled browser window.
5. Require a one-time explicit approval before navigating to a new HTTPS host.
6. Observe bounded visible form descriptors without reading passwords, hidden values, cookies, page HTML, or arbitrary page text.
7. Build a deterministic fill plan from verified local-profile values, review it, and explicitly run `Fill approved fields`.

The current fill path supports only empty, unambiguous text-like inputs and textareas. It re-checks the page fingerprint and shared policy immediately before mutation, dispatches normal input/change events, and verifies the visible result. It does not activate buttons or submit forms.

## Recent commits

- `e679ef9` — isolated application form observer.
- `7febec2` — guarded fill plans.
- `5a0b634` — confirmation/readiness safeguards.
- `394eb96` — safe generic ATS adapter foundation.
- `8cf90c0` — popup links route through the isolated view.
- `46ea965` — reviewed approved-field filling is connected to the UI.
- `5c787b2` — machine-formatted contact names such as `email_address` are recognized.

## Important current limitations

- Real ATS pages still need fixture-backed compatibility work. The current implementation is generic, not a promise of universal form support.
- First/last name fields intentionally stay manual: the profile stores a full name, and splitting it would risk entering an incorrect name.
- No AI currently decides field values or generates answers in the browser workflow.
- Free-text answers, selects, radio groups, checkboxes, document uploads, custom controls, iframes, and shadow-DOM controls are not yet wired for automated filling.
- Final submission remains manual. CAPTCHA, passwords, MFA, legal attestations, signatures, and sensitive voluntary disclosures remain manual and blocked from automation.

## Recommended next objective

**Stabilize real-form filling before adding AI-generated answers.**

1. Add local form fixtures for first/last name, email, phone, links, street/city/state/postal code, textareas, rerenders, and controlled React-style inputs.
2. Extend the profile model only where a separate verified value is needed (for example first and last name), with a non-destructive migration and UI review.
3. Expand policy/engine support for native select, radio, and checkbox controls only when the option value is explicit, provenance-backed, and user-approved.
4. Record redacted per-field success/failure diagnostics so unsupported pages can be addressed with evidence.
5. Add a narrowly scoped Workada adapter only if fixture/real-page evidence shows generic matching is insufficient.

After that is reliable, implement AI-assisted free-text drafts: bounded question → evidence catalog → structured draft/evidence IDs → validation → user edit/approval → optional insertion. Do not let model output decide policy, execute code, or create factual claims.

## Fast verification commands

```powershell
node --test test/*.test.cjs
npm.cmd run build
node --check electron/main.cjs
node --check electron/preload.cjs
git diff --check
```

`npm.cmd` is required in this PowerShell environment because the `npm.ps1` execution policy is disabled.

## Files to read first

1. `PROJECT_BRIEF.md`
2. `plans/JOB_APPLICATION_AUTOMATION_00_MASTER_HANDOFF_TERRA_MED.md`
3. This handoff
4. `electron/jobs/application-browser.cjs`
5. `electron/jobs/application-policy.cjs`
6. `electron/jobs/application-fill-engine.cjs`
7. `src/jobs/ApplicationBrowserPanel.jsx`

## Commit rule

`AGENTS.md` requires every code or document change to be staged and committed immediately with a focused, informative message. Preserve unrelated worktree changes.
