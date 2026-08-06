# Superseded — Learning Command Center Implementation Plan

> This historical plan is preserved for reference only. It is superseded by `.hermes/plans/PHASE-01-command-center-foundation.md` and must not be used as the active product direction. The product is now an AI Executive Coach Command Center; learning is an integrated module.

> **For Hermes:** Use this plan as the implementation handoff. Execute one phase at a time with a regression checkpoint after each phase.

**Goal:** Evolve the current focused CCAR-P learning workspace into a command center that coordinates learning, review, notes, captured Academy material, practice, and next actions without changing or endangering the currently working study experience.

**Architecture:** Preserve the existing Electron + React + Vite three-pane shell and native Anthropic Academy BrowserView. Add a thin command-center orchestration layer in the renderer that reads existing state and derives views; keep existing persistence files and IPC contracts backward-compatible. Introduce new data only through versioned, atomic, additive storage and never couple command-center rendering to Academy capture or credentials.

**Tech Stack:** Electron, React, Vite, JavaScript/JSX, Lucide icons, localStorage, versioned JSON in Electron `userData`.

**Exact target:** `C:/Users/joshr/OneDrive/Desktop/hermes/anthropic-certification-native`

---

## 1. Current baseline to protect

The current project is on branch `main` with baseline commit `170cfaf chore: establish North Star project baseline`. The repository is clean. Existing source of truth:

- `src/main.jsx` — curriculum model, progress/readiness derivations, notes modal, practice, search, Review Next, capture/material state, and renderer UI.
- `src/styles.css` — current focused three-pane visual system.
- `electron/main.cjs` — native Academy `BrowserView`, navigation, capture/material/review IPC, versioned atomic JSON storage.
- `electron/preload.cjs` — narrow fixed IPC bridge.
- `PROJECT_BRIEF.md` — product constraints and prior verification history.
- `ACADEMY_CAPTURE_PHASE.md` — capture/material compliance boundaries.

Existing capabilities that must remain working:

1. Overview, curriculum, notes, and practice navigation.
2. Official learning completion separate from estimated exam readiness.
3. Four curriculum statuses and persisted progress.
4. Curriculum search/filtering and Review Next selection/navigation.
5. Native Academy loading and navigation in the right pane.
6. Resizable Academy splitter and live BrowserView bounds.
7. Local notes and workspace state persistence.
8. Explicit Academy capture only after user action.
9. Separate capture, flashcard, and flashcard-review files.
10. No credential, cookie, token, password, authorization-header, arbitrary-fetch, crawl, or automatic capture behavior.

Do not modify `C:/Users/joshr/OneDrive/Desktop/hermes/anthropic-certification`.

---

## 2. Product definition: command center, not a replacement app

The command center should answer five questions immediately:

1. **What is my current state?** Official completion, readiness evidence, practice/review backlog, and study-material count.
2. **What should I do next?** A single prioritized next-action queue derived from existing data.
3. **Where is my work?** Current lesson, notes, captured Academy pages, flashcards, and practice.
4. **What needs attention?** In-progress curriculum, unreviewed/needs-review flashcards, incomplete drills, and stale/overdue user-created actions if scheduling is later approved.
5. **What can I launch quickly?** Curriculum item, Review Next item, Practice, Notes, Captured Academy, or Study Materials.

The command center is an orchestration surface. It must not duplicate or silently mutate authoritative data.

### Explicit non-goals for this phase

- No AI assistant, model provider, credentials, or cloud sync.
- No automated Academy scraping, crawling, or background capture.
- No unofficial practice exams unless separately requested.
- No replacement of the native Academy BrowserView.
- No database migration, dependency addition, or broad visual redesign.
- No automatic status changes based on dashboard visibility.
- No destructive migration of existing localStorage or JSON files.

---

## 3. Safety architecture and invariants

### 3.1 Read-only derivation first

Create pure renderer helpers that derive command-center data from current state:

- official curriculum items and statuses;
- `Review Next` queue;
- readiness domain evidence;
- existing practice results;
- loaded capture/material/review summaries.

The dashboard must initially be read-only except for existing navigation actions. Every card action should call an existing handler such as `openReviewItem`, `setView`, `setNotesOpen`, or an existing Academy/material action.

### 3.2 Persistence compatibility

- Keep `STORAGE_KEY = 'claude-architect-study-workspace-v1'` readable.
- Add only optional fields or a new version after writing a migration test/verification path.
- If a new command-center preference is needed, use a separate key such as `claude-architect-command-center-v1`; failure to parse it must fall back to defaults.
- Do not rewrite capture/material/review files just because the dashboard opens.
- Keep the existing atomic write behavior in `electron/main.cjs` unchanged unless a separately scoped storage feature requires it.

### 3.3 Navigation safety

Use an explicit action registry or action IDs, not arbitrary URLs or arbitrary IPC from dashboard data. Academy actions may only use the existing `navigateAcademy` method and existing course URLs already in curriculum data.

### 3.4 Compliance/security gates

Before any new Academy-derived feature, re-read `ACADEMY_CAPTURE_PHASE.md`. The dashboard may display already-loaded summaries but must not expand capture scope. No new credential or browser-session API is allowed.

---

## 4. Phased implementation plan

### Phase 0 — Baseline snapshot and regression harness

**Objective:** Establish a rollback point and prove the existing app still builds before command-center changes.

**Files:**
- Read: `PROJECT_BRIEF.md`, `ACADEMY_CAPTURE_PHASE.md`, `src/main.jsx`, `src/styles.css`, `electron/main.cjs`, `electron/preload.cjs`, `package.json`
- Create: `.hermes/plans/` plan only for this planning phase; implementation should use a feature branch.

**Steps:**
1. Create a short-lived branch: `feat/learning-command-center`.
2. Run `npm run build` and record the real result.
3. Run main/preload syntax checks using Node.
4. Launch `npm run desktop:prod`; verify process startup and terminate it cleanly.
5. Record the baseline in the implementation branch commit before source edits.

**Stop condition:** If baseline build or runtime fails, stop command-center work and repair/investigate the baseline first.

### Phase 1 — Add a safe Command Center entry point

**Objective:** Add a new overview mode without removing the existing Overview behavior or changing the three-pane shell.

**Files likely to modify:**
- `src/main.jsx`
- `src/styles.css`
- `PROJECT_BRIEF.md`

**Steps:**
1. Add `command-center` as a view value while preserving `overview` as a backward-compatible saved value.
2. Add a sidebar entry labeled `Command center` and keep Overview available during the transition, or rename only after confirming the user wants one entry.
3. Add a small pure `getCommandCenterSnapshot(...)` helper outside `App`; it must accept data and return deterministic cards/queue inputs.
4. Render static summary cards from existing derived values: official completion, readiness, Review Next count, practice backlog, flashcard backlog, and capture count.
5. Add a “Continue” action that reuses the existing current lesson and Academy launch behavior.
6. Ensure missing IPC methods/files result in empty counts, not renderer failure.
7. Add a reset-safe fallback if persisted `view` is unknown.

**Verification:**
- `npm run build`.
- Start production Electron and confirm renderer mounts.
- Confirm `localStorage` remains parseable before/after changing views.
- Confirm native Academy pane and splitter are unchanged.

**Stop condition:** The new view renders with empty and populated data, and all old views remain reachable.

### Phase 2 — Build the prioritized Next Actions queue

**Objective:** Turn existing scattered queues into one clear, explainable action list.

**Files likely to modify:**
- `src/main.jsx`
- `src/styles.css`

**Priority order:**
1. Current in-progress official item.
2. Review Next in-progress items.
3. Flashcards marked `Needs review`.
4. Unreviewed flashcards.
5. Incomplete app-created drills.
6. Not-started official curriculum items.

**Rules:**
- Never include Complete or Skipped official items.
- Never auto-mark anything complete.
- Practice remains clearly app-created.
- Flashcards retain `App-generated` and `Academy-derived` labels.
- Every action has a stable local action ID and uses an existing safe handler.
- Duplicate targets are deduplicated deterministically.

**Verification:**
- Set a curriculum item In progress and confirm it appears first.
- Mark a flashcard Needs review and confirm it appears with the correct label.
- Complete/skip an item and confirm it disappears.
- Reload and confirm ordering is stable.
- Confirm queue selection opens the existing curriculum/material/practice view without losing notes or Academy state.

**Stop condition:** The queue recommends one next action correctly without mutating source data.

### Phase 3 — Add command-center workspace sections

**Objective:** Make the dashboard useful as a launchpad while keeping each existing feature authoritative in its own view.

**Sections:**

- **Continue learning:** current item, status, progress, Open in Academy.
- **Review queue:** top actions and link to full Review Next/curriculum.
- **Readiness snapshot:** weighted evidence and a link to Overview details.
- **Practice:** remaining drills and link to Practice.
- **Study materials:** capture/material counts, most recent source, review backlog, and link to the existing material/capture view if those views are restored in the current source.
- **Notes:** note presence/length and open existing notes modal; do not create a second notes store.

**Files likely to modify:**
- `src/main.jsx`
- `src/styles.css`

**Verification:**
- Click every card/action.
- Confirm action destination and active item.
- Confirm no card causes an automatic capture or material generation.
- Confirm the right native Academy pane remains visible during command-center navigation.
- Confirm the notes modal still hides/shows the Academy pane exactly as before.

**Stop condition:** Every command-center action has a working destination and no duplicate state authority.

### Phase 4 — Add a minimal local “Today” layer (only if desired)

**Objective:** Add user-controlled focus planning without pretending to be a calendar or introducing risky persistence.

**Recommendation:** Defer until Phases 1–3 are stable. If implemented, keep it deliberately small:

- one selected focus item ID;
- optional user-entered focus note;
- optional local completion checkbox that does not alter curriculum status;
- separate key `claude-architect-command-center-v1`;
- explicit Clear/Reset action.

**Do not add yet:** dates, reminders, notifications, recurring schedules, cloud sync, or task deletion semantics.

**Verification:** malformed key fallback, reload persistence, clear/reset, no impact on curriculum/local notes/capture files.

### Phase 5 — Regression, migration, and release gate

**Objective:** Prove the command center is additive and does not break current functionality.

**Required checks:**

1. `npm run build` passes.
2. `electron/main.cjs` and `electron/preload.cjs` syntax checks pass.
3. Production Electron launch succeeds.
4. Renderer mounts with no captured runtime errors.
5. Overview and Curriculum render.
6. Status select updates persist across reload.
7. Notes open, edit, save, and restore.
8. Practice answer submission and result persistence remain intact.
9. Curriculum search, clear, no-match state, and Review Next navigation remain intact.
10. Native Academy URL is present and navigation works.
11. Academy splitter has live non-zero bounds and remains resizable.
12. Existing capture/material/review files parse with unchanged schema versions.
13. No stored file contains credentials, cookies, tokens, passwords, authorization headers, or session secrets.
14. No new network request or automatic capture is introduced.
15. Git diff contains only intended files; obsolete project path is untouched.

**Release rule:** Do not merge unless all checks pass or a limitation is documented explicitly in `PROJECT_BRIEF.md`.

---

## 5. Files and data contracts

### Renderer additions

Prefer small pure functions in `src/main.jsx` initially to avoid premature architecture changes:

```js
const getCommandCenterSnapshot = ({ officialLessons, reviewQueue, readiness, practiceDrills, practiceResults, captures, studyMaterials, studyReviews, current }) => ({
  current,
  completion: { /* derived existing values */ },
  readiness: { /* derived existing values */ },
  actions: [ /* stable IDs, labels, kinds, destinations */ ],
  counts: { /* safe numeric summaries */ }
});
```

If the helper becomes large, extract to `src/commandCenter.js` and add a lightweight Node-runnable test file only if the project’s test setup is introduced deliberately. Do not add a test framework solely for cosmetic coverage; pure helper checks can use a small Node script during the first phase.

### Existing storage to preserve

- Renderer workspace: localStorage key `claude-architect-study-workspace-v1`.
- Academy captures: Electron userData `academy-capture.json`, schema version 1.
- Academy materials: Electron userData `academy-study-material.json`, schema version 1.
- Flashcard reviews: Electron userData `academy-study-review.json`, schema version 1.

The command center reads these through existing state-loading paths. It must not merge them into one file.

---

## 6. Rollback strategy

1. Work only on `feat/learning-command-center`.
2. Commit after each phase with a narrow message.
3. Keep each phase independently revertible.
4. Never perform a destructive data migration in the same commit as a UI change.
5. Before each phase, copy/verify the existing userData files if runtime testing touches them; never delete user data during tests.
6. If a phase introduces a renderer error, revert that phase commit and leave prior phases intact.
7. Preserve the original `overview`, `curriculum`, `practice`, notes, and Academy behaviors until command-center parity is proven.

---

## 7. Open product decisions before implementation

1. Should `Command center` replace `Overview`, or should both remain temporarily?
2. Should the command center show captured Academy/material counts now, or only after their views are restored/confirmed in the current source?
3. Do you want a minimal “Today” focus layer, or should the command center remain purely derived/read-only?
4. Should the command center prioritize certification progress only, or also support a separate shaved-ice/business workspace later? Recommendation: keep this app certification-specific for now.
5. Is a compact dashboard preferred, or should it become the default landing view?

**Recommended defaults:** replace Overview only after parity verification; keep current Overview details one click away; use derived/read-only dashboard first; no Today layer in the first pass; keep the app certification-specific; make Command Center the default only after Phase 5 regression passes.

---

## 8. Definition of done

The learning app is a command center when the default landing view gives a truthful current-state summary, one prioritized next action, and direct launch paths into curriculum, Academy, notes, practice, and study materials—while all existing persistence, IPC, native Academy, resizing, and safety boundaries remain intact and verified.

**Plan complete and saved. Ready to execute phase-by-phase on a feature branch.**

---

## 9. Handoff prompt

```text
Read PROJECT_BRIEF.md, ACADEMY_CAPTURE_PHASE.md, and .hermes/plans/2026-08-06_000000-learning-command-center.md first.

Work only in C:/Users/joshr/OneDrive/Desktop/hermes/anthropic-certification-native.
Implement one phase only: [PHASE]. Use the smallest additive change. Do not modify the obsolete project, request/store credentials, broaden Academy capture, or remove existing views.
Run the required build/runtime verification, inspect real results, update PROJECT_BRIEF.md with durable verified state, and stop when the phase passes.
```

---

## 10. Planning note

This document is intentionally a plan only. No application source files were changed while authoring it.

---

## 11. Verification checklist for the plan

- [x] Exact active project path confirmed.
- [x] Current source and persistence/IPC boundaries inspected.
- [x] Existing git branch and clean status inspected.
- [x] Current capabilities and regression baseline listed.
- [x] Additive phases, safety gates, rollback, and stop conditions defined.
- [x] No source implementation performed.
- [ ] User confirms open product decisions or accepts recommended defaults before Phase 1 implementation.

---

**Saved at:** `C:/Users/joshr/OneDrive/Desktop/hermes/anthropic-certification-native/.hermes/plans/2026-08-06_000000-learning-command-center.md`
