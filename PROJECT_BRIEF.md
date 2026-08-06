# Anthropic Certification Native — Project Brief

> **Purpose:** Load this file at the start of every new Hermes session working on this project. It is the compact source of truth for project context, current direction, constraints, and recent state.
>
> **Last updated:** 2026-08-05
>
> **Maintenance rule:** Update this file after a meaningful feature, bug fix, architecture decision, or change in requirements. Keep it concise; do not turn it into a chat transcript.

## Project

- **Path:** `C:/Users/joshr/OneDrive/Desktop/hermes/anthropic-certification-native`
- **App type:** Native Electron desktop application
- **Package name:** `claude-architect-study-coach-native`
- **Stack:** Electron, React, Vite, JavaScript/JSX, Lucide icons
- **Electron entry:** `electron/main.cjs`
- **Preload:** `electron/preload.cjs`
- **React entry:** `src/main.jsx`
- **Styles:** `src/styles.css`
- **Build:** `npm run build`
- **Desktop dev run:** `npm run desktop`
- **Production desktop run:** `npm run desktop:prod`
- **Repository:** No Git repository detected at the project root as of the last check.

## Product goal

Build a polished desktop workspace for completing Anthropic/Claude certification study:

1. Ordered Anthropic certification curriculum
2. Course and study-material library
3. Progress dashboard
4. Notes and quizzes
5. Resizable three-pane workspace:
   - **Left:** curriculum/navigation sidebar
   - **Middle:** dynamic primary study workspace
   - **Right:** Anthropic Academy loaded natively inside the app

## Important constraints

- Do **not** request, collect, or store user credentials.
- Keep the Anthropic Academy experience native to the Electron app where possible.
- Do not add the AI Study Coach concept back into the layout. It is removed for now.
- Do not modify the obsolete project at:
  `C:/Users/joshr/OneDrive/Desktop/hermes/anthropic-certification`
- Make the smallest change that solves the requested problem.
- Avoid unrelated redesigns, dependency changes, or architecture changes.
- Verify behavior with real execution before declaring success.

## Current state

- The active project has a built `dist/` directory and installed `node_modules/`.
- Main source files currently include:
  - `src/main.jsx`
  - `src/styles.css`
  - `electron/main.cjs`
  - `electron/preload.cjs`
  - `vite.config.js`
- `src/main.jsx` now uses the CCAR-P roadmap taxonomy: official recommended preparation, official Professional Prep Course, official supplemental preparation, and app-created practice.
- The UI now shows the CCAR-P exam overview/facts, no-mandatory-prerequisites statement, and the seven weighted exam domains as reference data.
- Phase 2 now calculates official learning completion across course/module/lecture/quiz items, with four selectable statuses: Not started, In progress, Complete, and Skipped / already experienced.
- Exam readiness is explicitly separate from official learning completion. Phase 1 now shows an estimated, app-derived weighted evidence dashboard across all seven exact CCAR-P domains; it is not an official passing prediction. Evidence uses mapped official-item statuses (Complete 100%, In progress 50%, Not started 0%; skipped excluded), and course completion never marks a domain mastered.
- Phase 1 production build passed and `npm run desktop:prod` remains running; this session had no attached interactive desktop/CDP inspection channel, so the new dashboard and preserved UI behaviors are process/build-verified rather than newly clicked through.
- Phase 2 completed in `src/main.jsx` and `src/styles.css`: added six clearly labeled app-created practice drills mapped to CCAR-P domains, answer submission with rationale/results, local persistence of practice review state, and a separate practice queue. Official Review Next remains unchanged and practice is not mixed into it.
- Phase 3 completed with a small overview usability polish: the top-level estimated readiness stat now mirrors the weighted evidence dashboard while retaining the explicit non-official disclaimer.
- Final `npm run build` passed and final `npm run desktop:prod` remains running. This session had no attached interactive desktop/CDP inspection channel; renderer interactions, native Academy, resizer, notes persistence, curriculum search/filtering, official Review Next behavior, and new readiness/practice interactions were not newly clicked through in this session. Prior brief entries record the earlier native-pane and persistence verification.
- Phase 3 flashcards implemented: Study materials sidebar view, explicit multi-capture selection, deterministic local flashcard generation, versioned atomic `academy-study-material.json`, narrow load/generate/delete IPC, traceable source capture metadata, and explicit card deletion. No AI provider, credentials, official exam-question generation, or practice exams were added. Runtime verification generated one card and then deleted it; the final study-material file is schemaVersion 1 with zero materials.
- Phase 1 Academy capture is implemented and was verified against the actual Electron userData file after the user explicitly clicked capture. The stored capture is a version-1, text-and-metadata-only record for `https://anthropic.skilljar.com/`; no capture occurs automatically in source code. Build and Electron process checks passed. No interactive desktop/CDP channel was available in this verification session, so UI behaviors beyond source inspection and process verification were not newly clicked through.
- Phase 2 Captured Academy library implemented in `src/main.jsx`, `src/styles.css`, `electron/main.cjs`, and `electron/preload.cjs`: narrow load/delete IPC, sidebar navigation, capture count, recent capture list, local search, metadata/content detail, and explicit deletion. The actual capture file contains two schemaVersion 1 text-only captures with no forbidden credential/session/media fields.
- Planned Academy phase boundaries: capture only the currently displayed native Academy page after an explicit user action; read loaded text and metadata only; do not capture automatically, crawl, bulk-download, fetch arbitrary URLs, store images, or access credentials/cookies/tokens/headers. Captures will be separate from localStorage workspace state and, if approved and implemented, stored in a versioned app-controlled `academy-capture.json` under Electron userData. A left-sidebar Captured Academy library, flashcards, and unofficial practice exams are later sub-phases, not current functionality.
- Building with the Claude API displays Anthropic’s 84 lectures / 10 quizzes total alongside the public 87-lecture section-count discrepancy.
- Model Context Protocol: Advanced Topics exposes Lecture 01 through Lecture 15 and Quiz 01 through Quiz 02 as numbered placeholders; no lecture titles are invented.
- Renderer blank-screen bug fixed: `updateEntries` was missing after the Phase 2 data-model change, causing React to fail before mounting while the independent native Academy BrowserView continued loading.
- Post-fix production verification completed: Overview and Curriculum render, status dropdowns update, MCP Advanced Topics exposes Lecture 01 through Lecture 15 and Quiz 01 through Quiz 02, the notes modal opens, the native Academy BrowserView loads at `https://anthropic.skilljar.com/`, and the resizer/splitter is present with a live Academy bounds region.
- Renderer CDP inspection reported no captured runtime errors during the interaction checks. No source change was needed.
- Visual consistency pass completed in `src/styles.css`: shared surface, border, spacing, focus, active-state, status-control, card, modal, and Academy-boundary tokens were added without changing the three-pane layout.
- Local persistence completed in `src/main.jsx` using versioned `localStorage`: curriculum statuses, notes, selected lesson, current view, and expanded modules restore on launch. No credentials are requested or stored.
- Production desktop verification completed after the changes: the Electron renderer and native Academy page both appeared through CDP, the Academy boundary and splitter had live DOM/native regions, seven status selects were present, local state was written, and a reload restored the saved workspace view and note state. No credentials were requested or stored.
- Curriculum course launch added: official course records now carry verified Anthropic Academy URLs, and the selected-course card's Play button navigates the existing native Academy BrowserView through a narrow preload/IPC bridge. Practice items and Professional Prep modules without known course URLs retain the existing Academy hint. No Academy content is scraped and no credentials are handled.
- Curriculum search/filtering added in the existing curriculum view: it searches course/module/practice metadata, shows matching top-level items, supports clear, and displays a no-match state without changing persistence or the native Academy pane.
- Review Next queue added to the study workspace: it derives from existing official curriculum/status data, prioritizes In progress before Not started, excludes Complete and Skipped / already experienced, and keeps app-created practice out of the queue. Queue selection uses the existing selected-course behavior; no new persistence or dependencies were added.
- Production verification completed after `npm run build` and `npm run desktop:prod` (with a temporary CDP-enabled launch for interaction checks): renderer mounted without captured runtime errors, Review Next displayed 31 remaining official items, queue selection updated the selected lesson card, completed/skipped items were excluded after status changes, the native Academy page was present at `https://anthropic.skilljar.com/`, and the three-pane Academy slot/splitter had live non-zero bounds. Existing search and persistence code paths were unchanged.
- Review Next navigation improved in `src/main.jsx`: each queue row now visibly offers “Review next” and opens Curriculum with the selected item active, its module expanded, and any prior search cleared. It reuses the existing status/selection/persistence behavior and adds no dependencies.
- Focused change verification: `npm run build` passed before and after the source change; `npm run desktop:prod` launched the production Electron runtime successfully with active Electron processes. The runtime was started, but this session had no attached interactive desktop/CDP inspection channel for clicking through the window; native Academy, layout, persistence, search, queue status filtering, and the new navigation therefore remain covered by the prior recorded verification rather than newly re-exercised here.
- Treat the source files as authoritative; inspect them before making assumptions about the current UI.

## Working protocol for Hermes

At the start of a session:

1. Read `PROJECT_BRIEF.md`.
2. Inspect only the files relevant to the requested task.
3. State the smallest implementation approach in 2–5 bullets.
4. Make the change.
5. Run the narrowest useful verification, then one broader build/run check if appropriate.
6. Update the **Current state** and **Recent decisions** sections when the work changes them.
7. Stop once the requested behavior works; do not continue with optional polish.

When the brief conflicts with the actual source code, trust the source code and update this file after confirming the new state.

## Recent decisions

- Use a native Electron desktop app rather than a browser-only app.
- Keep the workspace simple and focused: navigation, study workspace, and native Academy panel.
- Do not store credentials or build a custom credential system.
- Prefer compact, task-focused sessions to reduce repeated context and token usage.
- Target the `Claude Certified Architect – Professional` credential directly; do not create a mandatory “Architect Foundations” track.
- Treat Anthropic courses as recommended preparation or supplemental preparation, never as exam eligibility prerequisites.
- Preserve the distinction between official course/module names and exam-domain names. In particular, use `Team Enablement & Operational Productivity` for the fifth prep-course module and `Developer Productivity & Operational Enablement` for Exam Domain 7.
- Do not invent lecture titles when only aggregate public counts are available. Use numbered placeholders with an explicit “titles unavailable until authenticated course access” note.

## Current focus

- **Current focus:** Restore the focused original study workspace. The visible shell is now limited to Overview, Curriculum, My notes, and Practice with the native Academy pane; captured-library/study-material command-center navigation is removed from the layout. Unofficial practice exams remain deferred.
- **Near-term feature plan:** Do not add unofficial practice exams until separately requested.
- **Quick-win backlog:** Unofficial practice exams remain deferred. The AI assistant remains deferred and is not part of this phase.
- **AI safety/architecture:** Do not request or store credentials. Keep provider configuration outside the app UI; label simulated/deferred AI honestly until a real provider adapter is connected.
- **Session sizing:** When token budget allows, complete roughly two related focused work items in one session, while preserving root-cause investigation, real build/runtime verification, and the smallest relevant scope.

## Session handoff notes

Add only durable facts another session needs. Remove stale notes instead of accumulating history.

- Source research is captured in `C:/Users/joshr/OneDrive/Desktop/examinfo.txt`. Its source reference is the official CCAR-P exam guide PDF URL recorded in that file.
- The active source currently starts with the obsolete curriculum in `src/main.jsx`; this is the first implementation target.
- The user wants a fresh-session workflow: read this brief, implement one focused phase, verify it, update this brief, then stop.

## Exam product model and implementation plan

### Goal

Make the app a focused study workspace for `Claude Certified Architect – Professional` (`CCAR-P`) with two visibly separate measures:

1. **Official learning completion** — courses, modules, lectures, and quizzes completed.
2. **Exam readiness** — independently estimated readiness across the seven weighted exam domains.

Course completion may provide evidence toward a domain, but it must never automatically mark a domain mastered.

### Exam overview data to show

- Credential: Claude Certified Architect – Professional
- Exam code: CCAR-P
- 63 questions; 120 minutes
- Multiple-choice and multiple-response
- Passing score: 720 on a 100–1,000 scaled score
- Exam fee: $175 USD
- Online proctored or Pearson VUE test center
- Credential validity: 12 months
- No mandatory prerequisites or required courses

### Curriculum taxonomy and exact content

Use three top-level labels in the UI:

1. **Official recommended preparation**
   - Claude 101
   - AI Fluency: Framework & Foundations
   - AI Capabilities and Limitations
   - Building with the Claude API — official displayed total 84 lectures, 10 quizzes; public section counts total 87, so retain the discrepancy explicitly
   - Introduction to Model Context Protocol — 16 lectures, 1 quiz
   - Claude Code in Action
   - Suggested app order is logical guidance only; Anthropic does not make the order mandatory. Permit `Not started`, `In progress`, `Complete`, and `Skipped / already experienced`.

2. **Official Professional Prep Course**
   - Claude Platform & Solution Design — 238 min
   - Enterprise Integration & Production — 158 min
   - Responsible AI, Safety & Risk for Architects — 114 min
   - Stakeholder Engagement, Lifecycle & GTM — 178 min
   - Team Enablement & Operational Productivity — 45 min
   - Total: 733 minutes / approximately 12 hours 13 minutes

3. **Official supplemental preparation**
   - Model Context Protocol: Advanced Topics — 15 lectures, 2 quizzes, approximately 1.1 hours; include section labels and `Lecture 01` through `Lecture 15` until authenticated titles are available
   - Claude with Amazon Bedrock — optional platform specialization, 85 lectures, 10 quizzes
   - Claude on Google Cloud — optional platform specialization, 85 lectures, 10 quizzes
   - Optional platform branches must not appear as required Professional-path steps.

4. **App-created practice**
   - Solution design scenarios
   - Integration scenarios
   - Evaluation and optimization drills
   - Governance and safety drills
   - Stakeholder/lifecycle drills
   - Cross-domain scenarios
   - Full mock exam
   - Move these here if retaining legacy items such as `Claude API Fundamentals`, `Building Effective Agents`, `Professional Practice`, `Architecture case studies`, or `Evaluation & reliability`; do not present them as Anthropic Academy courses.

### Exam-domain blueprint

Store these exact labels and weights as data, not as UI-only text:

1. Integration — 19%
2. Solution Design & Architecture — 17%
3. Evaluation, Testing & Optimization — 16%
4. Governance, Safety & Risk Management — 14%
5. Stakeholder Communication & Lifecycle Management — 14%
6. Claude Models, Prompting & Context Engineering — 13%
7. Developer Productivity & Operational Enablement — 7%

Readiness should eventually combine domain-specific practice results, quiz evidence, review state, and self-assessment. For the first implementation, use a transparent domain score model and show how the score was formed; avoid claiming a score is an official probability of passing.

### Recommended implementation phases

#### Phase 1 — Replace the curriculum data model

- Modify `src/main.jsx` only as needed to replace fabricated groups with the taxonomy above.
- Add stable IDs, category/type fields, official status, duration/count metadata, optional/required-display state, and domain mappings.
- Add the exam overview as a first-class overview card.
- Keep the current three-pane layout, Academy panel, notes modal, and resize behavior unchanged.
- Remove obsolete branding that says “Study Coach” if it implies an AI coach; retain the focused study-workspace concept.

#### Phase 2 — Make course progress accurate

- Replace the single generic lesson percentage with official learning completion calculations.
- Support course/module/lecture/quiz progress and the four preparation statuses.
- Show the public-count discrepancy for Building with the Claude API instead of silently choosing one number.
- Show numbered MCP Advanced Topics lecture placeholders without fabricated names.

#### Phase 3 — Add exam-domain readiness

- Add a readiness dashboard using the seven weighted domains.
- Display domain weight, current evidence/readiness, mapped study items, and a clear “estimated / app-derived” label.
- Ensure completing a course changes evidence but does not set a domain to 100% or “mastered.”
- Add domain filters to practice and curriculum views.

#### Phase 4 — Add app-created practice and review

- Create practice item metadata tied to one or more exam domains.
- Add scenario cards, quiz/drill results, review state, and a mock-exam entry point.
- Keep practice clearly separate from official Anthropic content.
- Do not generate or claim official exam questions; label all app-created questions as practice.

#### Phase 5 — Persistence and verification

- Persist progress and notes locally only if the existing Electron architecture supports it without credentials or a new account system.
- Verify that no credentials are requested, collected, or stored.
- Run `npm run build`, then `npm run desktop:prod` for runtime inspection when Electron behavior changes.
- Update this brief after each meaningful phase and stop; avoid optional redesigns.

### Likely files by phase

- Phase 1–4: `src/main.jsx`, `src/styles.css`
- Phase 5 only if needed: `electron/main.cjs`, `electron/preload.cjs`
- Do not modify the obsolete project at `C:/Users/joshr/OneDrive/Desktop/hermes/anthropic-certification`.

### Acceptance criteria

- The app names the CCAR-P credential and shows the exam facts above.
- The UI says there are no mandatory course prerequisites.
- The four official/factual content groupings are not confused with exam domains.
- The fifth prep module is named `Team Enablement & Operational Productivity`.
- Exam Domain 7 is named `Developer Productivity & Operational Enablement`.
- Official completion and exam readiness are separate metrics.
- Supplemental and app-created practice content is clearly labeled.
- No fabricated lecture titles are added.
- Existing native Academy pane and resizable workspace still work.
- `npm run build` passes after source changes.

## Useful new-session prompt

```text
Read PROJECT_BRIEF.md first. Work only in the project described there.

Task: [describe one focused task]

Use the smallest viable change, do not modify unrelated areas, and verify the result with real execution. Stop when the requested behavior works.
```

## Update format

When updating this file, preserve the sections above and keep entries short:

- **Current state:** what works now
- **Recent decisions:** durable product/technical decisions
- **Current focus:** the next single task
- **Session handoff notes:** only information needed by the next session

Do not record full logs, repeated failed attempts, token usage, or temporary conversational details.

## Verification checklist

- [x] Requested behavior reproduced or otherwise inspected
- [x] Smallest relevant source change made
- [x] `npm run build` passes when source/build behavior changed
- [x] Electron runtime behavior checked when desktop integration changed
- [x] This brief updated if durable state changed
- [x] No credentials requested or stored
- [x] No obsolete project modified

## Change log

- **2026-08-04:** Created this project brief as the cross-session handoff document.
- **2026-08-04:** Phase 1 completed in `anthropic-certification-native/src/main.jsx`; replaced fabricated curriculum groups with the official CCAR-P roadmap, added exam overview/domain reference data, preserved the native three-pane shell, and verified `npm run build`.
- **2026-08-04:** Phase 2 completed in `src/main.jsx`; replaced generic item toggles with hierarchical course/module/lecture/quiz statuses and derived official completion, added the API public-count discrepancy, added MCP Advanced Topics numbered placeholders, preserved the native shell, and verified `npm run build`.
- **2026-08-04:** Fixed the Phase 2 renderer crash by restoring the recursive status-update helper; verified `npm run build`, Electron main/preload syntax, and a live `npm run desktop:prod` Electron process.
- **2026-08-04:** Completed post-fix production interaction verification in the native app: Overview, Curriculum, status updates, MCP Advanced Topics Lecture 01–15 and Quiz 01–02 expansion, notes modal, native Academy panel, and resizer were verified; no source fix was required.
- **2026-08-04:** Product direction updated: prioritize a focused visual consistency pass and local progress/notes persistence, then add a contextual lesson-aware AI assistant without scraping the native Academy panel or handling credentials. Larger sessions may complete two related quick-win work items when verification remains thorough.
- **2026-08-04:** Completed the visual consistency pass and local persistence quick wins in `src/styles.css` and `src/main.jsx`; verified production Electron launch, native Academy page, Overview/Curriculum shell, status controls, localStorage state writes, notes persistence, reload restoration, and live Academy splitter boundary. No AI assistant or Academy capture was added.
- **2026-08-04:** Began a separate Academy capture phase. Added `ACADEMY_CAPTURE_PHASE.md` with the compliance gate, explicit user-action-only capture boundaries, proposed versioned storage/IPC architecture, later Captured Academy library, and future flashcard/unofficial practice-exam phases. Updated this brief to distinguish the new intentional direction from the former no-capture constraint. No capture implementation was added.
- **2026-08-05:** Verified the implemented Phase 1 capture: `npm run build` passed; Electron main/preload syntax checks passed; `npm run desktop:prod` launched and remained running; actual userData file `C:/Users/joshr/AppData/Roaming/ClaudeArchitectStudyCoachNative/academy-capture.json` parsed successfully with schemaVersion 1, one `loaded-page-text` capture, approximately 6,000 characters, source URL `https://anthropic.skilljar.com/`, no credential/security terms, and no media fields. No interactive desktop/CDP channel was available, so renderer clicks, native view visibility, resizer, persistence, search, queues, and dashboards were not newly exercised in this run.

---

**Rule for future sessions:** Read this file before asking the user to repeat project context.

- **2026-08-05:** Phase 3 flashcards implemented and verified with `npm run build`, production Electron startup, CDP interaction through Captured Academy → explicit selection → Generate flashcards → Study materials, actual JSON readback after generation and deletion, schema/security checks, and confirmation that captures remain separate from generated materials and localStorage.

