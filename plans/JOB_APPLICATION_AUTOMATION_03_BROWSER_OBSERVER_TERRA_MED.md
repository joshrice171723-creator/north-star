# Stage 03 — Isolated Application Browser and Form Observer

> Owner: Terra using medium reasoning
>
> Prerequisites: `JOB_APPLICATION_AUTOMATION_00_MASTER_HANDOFF_TERRA_MED.md` read and Stages 01–02 complete
>
> Goal: open and understand application forms safely without changing them

## User-visible outcome

- `Open application assistant` opens the selected application URL in a dedicated panel.
- The user can log in, navigate, and handle CAPTCHA/MFA manually.
- The app identifies the likely ATS and summarizes visible form fields.
- A checklist distinguishes fillable fields, questions needing input, sensitive fields, blocked actions, and file uploads.
- The session can be paused and resumed.
- This stage never changes a remote form field.

## Required architectural decision

Use `WebContentsView`, not the deprecated `BrowserView` and not a renderer `<webview>` tag.

Create `electron/jobs/application-browser.cjs` to own:

- View lifecycle and bounds.
- Dedicated session partition.
- Navigation validation.
- New-window handling.
- Permission denial.
- Observation lifecycle.
- Sanitized events sent to the trusted local renderer.
- Coordination with Academy/application view visibility, z-order, resize listeners, and cleanup.

Do not reuse `academyView`, `academyBounds`, or `persist:anthropic-academy-native`.

If Electron’s current `BrowserWindow.contentView` integration requires small shared layout changes, keep them narrowly scoped and prove Academy still works. Do not migrate Academy solely for consistency.

## Session model and migration

Create `electron/migrations/0012_job_application_browser_sessions.sql`.

Recommended `job_application_sessions` columns:

```sql
id TEXT PRIMARY KEY NOT NULL,
application_id TEXT NOT NULL,
status TEXT NOT NULL DEFAULT 'created',
ats_key TEXT NOT NULL DEFAULT 'unknown',
current_origin TEXT NOT NULL DEFAULT '',
current_url_redacted TEXT NOT NULL DEFAULT '',
page_title TEXT NOT NULL DEFAULT '',
field_snapshot_json TEXT NOT NULL DEFAULT '[]',
page_fingerprint TEXT NOT NULL DEFAULT '',
unresolved_count INTEGER NOT NULL DEFAULT 0,
last_error_code TEXT NOT NULL DEFAULT '',
last_error_message TEXT NOT NULL DEFAULT '',
started_at TEXT NOT NULL,
last_observed_at TEXT,
ended_at TEXT,
created_at TEXT NOT NULL,
updated_at TEXT NOT NULL
```

Do not persist cookies, passwords, tokens, page HTML, full URLs containing query strings/fragments, or arbitrary page text.

## Navigation policy

Initial application URL must:

- Parse successfully with `new URL()`.
- Use `https:`.
- Come from the saved normalized job/application record.

Navigation may cross origins because ATS systems commonly redirect to authentication or hosted forms. Handle this with an explicit navigation decision function:

```js
decideNavigation({ fromUrl, toUrl, isMainFrame, disposition })
  -> { action: 'allow' | 'ask_user' | 'deny', reason }
```

Allow same-origin navigation. For a new HTTPS origin, pause and ask the trusted renderer to show the destination host to the user. A one-time approval applies only to that application session and host. Deny non-HTTPS, downloads not initiated by the user, and unexpected popup creation.

Redact stored URLs to origin plus safe pathname. Remove query strings and fragments by default.

## Permissions and remote-content isolation

For the application partition:

- Install both `setPermissionCheckHandler` and `setPermissionRequestHandler`.
- Deny camera, microphone, notifications, geolocation, clipboard read, MIDI, Bluetooth, serial, USB, and filesystem permissions.
- If a future site genuinely requires a permission, add a specific user-visible exception in a later plan; do not allow it generically.
- Use no preload bridge in remote content.
- Keep sandboxing, context isolation, and web security enabled.
- Disable or tightly route `window.open`.
- Validate the sender of every local-renderer IPC command that controls the view.

## Observation engine

Create `electron/jobs/application-inspector.cjs` and adapter interface:

```js
{
  key,
  matches({ url, documentSignals }),
  inspect(),
  detectPageState()
}
```

Start with a generic observer. It may inspect only bounded descriptors:

- Element type: input/select/textarea/button.
- Input type.
- Stable field fingerprint.
- Associated label, accessible name, name/id/autocomplete attributes.
- Required/disabled/read-only state.
- Select options, bounded in count and length.
- Whether the field is empty, but not password values.
- Nearby validation message, bounded.
- File-accept types.
- Button/action classification.

Never collect password values, hidden token values, cookies, full DOM, scripts, or unbounded page text.

Generate field fingerprints from normalized descriptors and page context; do not depend only on brittle CSS selectors. Store selectors only as ephemeral session data.

Run inspection:

- after `did-finish-load`;
- after explicit `Rescan form`;
- after a bounded debounce when navigation or user input changes the page materially.

Avoid a continuous high-frequency DOM scraper.

## Classification

Create the policy skeleton in `electron/jobs/application-policy.cjs` now, but Stage 03 uses it only to classify.

Required categories:

- identity/contact
- employment
- education
- links
- work authorization/sponsorship
- compensation/start/relocation/travel
- free text
- sensitive voluntary disclosure
- legal/signature
- authentication/CAPTCHA
- file upload
- navigation
- final submit
- unknown

Classification should be deterministic first. AI may be used only for ambiguous bounded labels/questions, with remote text explicitly treated as untrusted and output constrained to the allowed enum. Low confidence becomes `unknown`.

## Renderer

Create `src/jobs/ApplicationBrowserPanel.jsx` and `src/jobs/ApplicationQuestions.jsx`.

The local UI should show beside the remote page:

- Current host and ATS guess.
- Back/forward/reload/rescan controls.
- Security indicator for origin changes.
- Field counts by policy result.
- Each normalized field with proposed source or `needs answer`.
- Explicit messages for login, CAPTCHA, sensitive fields, and final submit.
- `Close assistant` and `Clear site session` controls.

There is no `Fill` button in Stage 03.

## IPC

Add narrow operations:

- Open/close application browser.
- Set validated bounds and visibility.
- Navigate back/forward/reload.
- Approve one navigation host.
- Rescan form.
- Get latest sanitized snapshot.
- Clear the application-browser partition after explicit confirmation.

The renderer sends application/session IDs, not arbitrary executable scripts or unrestricted URLs.

## Tests

Add at minimum:

- `test/application-browser-policy.test.cjs`
- `test/application-inspector.test.cjs`
- `test/application-browser-view.test.cjs`

Use local HTML fixtures served from a local test server for generic forms, multipage forms, login pages, CAPTCHA-like markers, sensitive fields, and malicious labels.

Required cases:

1. Non-HTTPS initial URLs are denied in production policy.
2. New hosts require a user decision.
3. Permission checks and requests deny by default.
4. Popups do not create uncontrolled windows.
5. Password and hidden-token values are never captured.
6. Page snapshots are bounded.
7. Malicious page text cannot trigger IPC or code execution.
8. Submit controls are classified as blocked.
9. Unknown fields fail closed.
10. Academy session/view state remains independent.
11. No field value changes during observation.

## Manual verification

Use test fixtures first. Then use one real application page only with the user present:

1. Open the assistant and verify isolation from Academy.
2. Navigate across a legitimate ATS redirect and verify the host checkpoint.
3. Log in manually if required.
4. Rescan and compare the checklist to visible fields.
5. Verify sensitive and submit controls are correctly blocked.
6. Restart the app and confirm the application workspace remains even if live page state cannot be perfectly restored.

## Stage gate

Stop after safe navigation and observation. No remote input, selection, checkbox, upload, or button may be changed programmatically in this stage.
