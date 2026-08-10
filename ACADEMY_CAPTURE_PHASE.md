# Academy Capture and Study Materials Phase

> **Document status:** completed/reference · **Scope:** Academy capture and study-material tasks only · **Last verified:** 2026-08-05 · **Loading:** do not read for unrelated work.

> **Status:** Phase 4 flashcard review implemented and verified. Unofficial practice exams remain deferred.
>
> **Scope:** A new, opt-in feature phase for manually capturing user-requested Academy page text, reviewing saved captures, and eventually creating clearly unofficial study materials from those captures.

## Objective

Add an intentional, user-controlled Academy study workflow without changing the existing certification workspace, three-pane layout, native Academy BrowserView, curriculum, notes, readiness dashboard, practice drills, or Review Next behavior.

The feature must never request, collect, display, or store Anthropic credentials, cookies, tokens, authorization headers, passwords, or session secrets.

## Compliance gate

Before implementing any authenticated Academy content extraction, confirm that the proposed behavior is allowed by the applicable Anthropic Academy/Skilljar terms or obtain explicit permission from Anthropic/Skilljar. The technical feasibility of Electron APIs is not itself permission to extract or store course content.

If permission cannot be established, stop the capture implementation and use a manual user-copy/paste workflow instead. Do not invent a workaround, bypass authentication, evade access controls, or use arbitrary network fetching.

## Product boundaries

- Capture is opt-in and requires an explicit user action such as **Capture Academy page**.
- Navigating to a page never captures it automatically.
- App startup never captures or reads Academy content automatically.
- Capture is limited to the currently displayed page in the existing authenticated native Academy BrowserView.
- The capture reads page metadata and loaded page text, including loaded text below the current viewport.
- The app does not automatically scroll, crawl, navigate between lessons, or bulk-download a course.
- If a page lazy-loads content only after scrolling, the user may scroll through the page first and then capture once.
- Phase 1 is text and metadata only; no images, screenshots, thumbnails, video, or other media are stored.
- Captured data is user-requested Academy-derived study data, not official exam material.
- Captured content remains separate from official curriculum completion, readiness evidence, notes, and app-created practice.

## Planned phases

### Phase 0 — Compliance and architecture confirmation

- Review applicable Anthropic Academy/Skilljar terms, service guidance, and robots rules.
- Record the result and any limitations in `PROJECT_BRIEF.md`.
- Inspect the current `electron/main.cjs`, `electron/preload.cjs`, `src/main.jsx`, `src/styles.css`, and `package.json` before coding.
- Run the existing build before source changes.
- Do not proceed with programmatic capture if the permission question remains unresolved.

### Phase 1 — Manual current-page capture

- Add an explicit **Capture Academy page** control without changing the three-pane shell.
- Use a fixed preload IPC method to request capture.
- Have the main process operate only on the existing `academyView.webContents`.
- Read only bounded, serialized values from the current page, such as:
  - `document.title`
  - `location.href`
  - loaded `document.body.innerText`
  - conservative course/lesson metadata when available
- Do not use renderer filesystem access, arbitrary URL fetching, request interception, cookie APIs, header access, or credential access.
- Validate the current URL and reject authentication/account pages and non-approved origins as appropriate.
- Enforce a reasonable maximum text size and return a safe failure for oversized or unavailable content.
- Save to a dedicated app-controlled file, preferably under Electron `app.getPath('userData')`:
  - `academy-capture.json`
- Use atomic or otherwise safe writes where practical.
- Handle missing, malformed, locked, unwritable, and version-incompatible files without crashing the app.
- Show explicit success/failure state in the renderer.
- Do not add images or screenshots in this phase.

### Phase 2 — Captured Academy library

- Add **Captured Academy** to the left sidebar near Settings.
- Clicking it changes only the middle workspace view; the native Academy BrowserView remains available on the right.
- Show capture count, recent captures, source URL, title, course/lesson identifier, content type, and capture time.
- Allow the user to search and read locally saved captures.
- Identify a prior capture by a stable page key, preferably normalized source URL plus available course/lesson identifier.
- Show an **Already captured** indicator and last-captured time.
- Make recapture explicit and update the existing record rather than silently creating duplicates.
- Allow explicit deletion of a selected capture with safe file persistence.
- Keep the capture library separate from `localStorage` workspace state.

### Phase 3 — App-generated flashcards and study materials

- Require an explicit user action to generate study material from one or more selected captures.
- Store generated material separately from source captures, preferably in a versioned file such as `academy-study-material.json`.
- Label every card as app-generated and Academy-derived from user-captured data.
- Preserve source capture IDs and source metadata for traceability.
- Do not claim cards are official Anthropic material or official exam questions.
- Start with deterministic/local generation if feasible; do not add an AI provider or credentials without a separate design decision.

### Phase 4 — Unofficial practice exams

- Add explicit creation of unofficial practice questions/exams from selected captures.
- Keep generated exams separate from official curriculum and existing app-created practice queues unless a later design explicitly unifies them.
- Show clear labels: **App-generated**, **Academy-derived**, and **Not official Anthropic exam material**.
- Store answers, explanations, source capture IDs, and local progress in a separate versioned data structure.
- Never represent generated questions as real, leaked, predicted, or official certification questions.

## Storage schema target

The exact implementation may refine field names after source inspection, but the dedicated capture file should follow a versioned structure like:

```json
{
  "schemaVersion": 1,
  "captures": [
    {
      "id": "stable-local-id",
      "capturedAt": "2026-08-04T12:34:56.000Z",
      "sourceUrl": "https://anthropic.skilljar.com/example-course/lesson-1",
      "pageTitle": "Example lesson",
      "courseLessonId": "optional-identifier",
      "contentType": "loaded-page-text",
      "content": "User-requested loaded page text",
      "contentHash": "optional-deduplication-hash"
    }
  ]
}
```

The file must never contain cookies, tokens, authorization headers, passwords, credentials, or session secrets.

## Proposed IPC boundary

Renderer:

```text
captureAcademyPage()
getAcademyCaptures()
deleteAcademyCapture(id)
```

Preload exposes only fixed, narrow methods. The renderer cannot provide an arbitrary filesystem path or arbitrary JavaScript to execute.

Main process:

- Owns the capture operation and file location.
- Uses the existing Academy `BrowserView` only after the explicit IPC request.
- Serializes and sanitizes the page result.
- Performs schema validation and safe file persistence.
- Returns structured success/failure results without exposing session internals.

The final IPC surface should remain as small as possible and should not become a general-purpose browser-evaluation or filesystem bridge.

## Verification requirements

For any implementation phase:

1. Read the full `PROJECT_BRIEF.md` and this file.
2. Inspect the current source before assumptions.
3. Run `npm run build` before changes when architecture is unchanged and again immediately after source changes.
4. Run `npm run desktop:prod` when Electron integration changes.
5. Verify the actual runtime when a desktop/CDP inspection channel is available:
   - renderer mounts without errors;
   - native Academy BrowserView remains visible;
   - three-pane layout and resizer remain functional;
   - Academy navigation remains functional;
   - no capture occurs on startup or navigation alone;
   - explicit capture reaches the existing BrowserView;
   - loaded text and metadata are stored in the dedicated file;
   - repeated capture updates or safely handles the existing record;
   - malformed or unwritable storage fails safely;
   - credentials, cookies, tokens, and headers are absent from stored data;
   - notes/localStorage persistence, curriculum search/filtering, Review Next, practice queue, and readiness remain intact.
6. Read the actual stored file back and verify its path, schema, contents, and security exclusions.
7. If CDP or interactive runtime inspection is unavailable, state that limitation honestly and distinguish build/process verification from UI verification.
8. Update `PROJECT_BRIEF.md` with actual results, not planned or assumed results.

## Phase 3 implementation notes

- Study materials are stored at `C:/Users/joshr/AppData/Roaming/ClaudeArchitectStudyCoachNative/academy-study-material.json`.
- Each flashcard includes `question`, `answer`, `sourceCaptureId`, `sourceTitle`, `sourceUrl`, `generatedAt`, and explicit `App-generated` / `Academy-derived` labels.
- Generation is never automatic on startup, navigation, or capture.
- Generation is deterministic/local and replaces the generated card for the same source capture on repeat generation.
- Source captures are immutable to generation and are deleted only through the existing explicit capture deletion action.

## Explicit non-goals

- No automatic background scraping.
- No startup capture.
- No bulk crawling or course downloading.
- No arbitrary URL fetching from the renderer.
- No authentication bypass, CAPTCHA bypass, paywall bypass, access-control bypass, or rate-limit evasion.
- No credential collection or storage.
- No image, screenshot, video, or media capture in Phase 1.
- No AI assistant added as part of this phase.
- No unrelated redesign or dependency addition unless strictly necessary.

## Handoff rule

Each new session should work on one focused phase or sub-phase, stop when its requested behavior works, run real verification, and update `PROJECT_BRIEF.md`. The detailed requirements and boundaries in this file should remain stable unless the product decision changes.

## Current status

- Existing app features are complete and remain the regression baseline.
- Electron can technically access the current native BrowserView page through main-process `webContents` APIs.
- Phase 1 was implemented after the user confirmed permission for this personal-use workflow and verified against the actual Electron userData file.
- Phase 3 is implemented: explicit multi-selection of saved captures, deterministic/local flashcards, separate versioned storage, traceability, and explicit deletion. Practice exams remain deferred.
- Verification result (2026-08-05): Phase 1 capture file contains valid schemaVersion 1 text-only captures. Phase 3 build passed, Electron main/preload syntax passed, production Electron loaded renderer and native Academy CDP pages, and CDP exercised explicit capture selection, deterministic generation, Study materials navigation, and card deletion. Generated file readback showed schemaVersion 1, required source IDs/metadata and no forbidden credential/session/media fields; final file contains zero cards after deletion. Captures remain in `academy-capture.json`, separate from `academy-study-material.json` and localStorage.
- No files from the obsolete project may be modified.

### Phase 4 review implementation status

- Implemented one-card flashcard review in the existing Study materials view.
- Added explicit answer reveal/hide, Previous/Next, Card N of N progress, and keyboard access with Space/Enter and Arrow keys.
- Added explicit `Not reviewed`, `Needs review`, and `Comfortable` actions. Review status is never changed by startup, navigation, capture, generation, or answer reveal.
- Stored review state separately in versioned atomic `academy-study-review.json`; generated card content and source captures remain immutable during review.
- Preserved `sourceCaptureId`, `sourceTitle`, `sourceUrl`, `generatedAt`, `App-generated`, and `Academy-derived` fields, plus explicit deletion and empty state.
- Verification: `npm run build`, Electron production launch, CDP generation/review/reload flow, actual review-file readback, separation from capture/material/localStorage files, and forbidden-field scan passed. No official exam-question generation or practice exam work was added.
