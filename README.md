# North Star

A native Electron desktop AI Executive Coach Command Center with a protected Learning & Development module for the **Claude Certified Architect – Professional (CCAR-P)** credential.

## Product scope

North Star is intended to guide the learner through an ordered study path while keeping official Anthropic preparation, local progress, notes, and clearly labeled app-created practice in one focused workspace.

- Ordered official preparation curriculum
- Professional Prep Course and supplemental preparation library
- Local progress tracking and notes
- App-created practice drills clearly separated from Anthropic content
- Resizable three-pane workspace with the Anthropic Academy loaded natively on the right

The app must not expose credentials in the renderer, logs, documents, commits, or diagnostics. Explicitly approved provider credentials are handled only in the Electron main process and encrypted with OS-backed storage.

## Development

Requirements: Node.js and npm.

```bash
npm install
npm run build
npm run desktop
```

For a production-style local launch:

```bash
npm run desktop:prod
```

## Project structure

- `src/main.jsx` — React application and study-workspace state
- `src/styles.css` — renderer styling
- `electron/main.cjs` — Electron main process and native Academy view
- `electron/preload.cjs` — narrow renderer/main IPC bridge
- `PROJECT_BRIEF.md` — compact project rules and navigation
- `.hermes/DOCUMENT_INDEX.md` — selective document-loading map

## Git workflow

- `main` is the stable branch.
- Use short-lived branches such as `feat/curriculum-progress` or `fix/academy-pane`.
- Make small commits. For exploratory work, do not create/run tests after every act; use risk-based checkpoints. Before merge, run the full applicable verification.
- Do not commit `node_modules`, `dist`, local secrets, or user data.

## Status

The active objective is selected by the user. Read `PROJECT_BRIEF.md`, then `.hermes/DOCUMENT_INDEX.md`; do not infer priority from this README or load every plan.

## License

Private project. All rights reserved unless changed by the repository owner.
Gmail unattended monitoring requires `GMAIL_OAUTH_CLIENT_ID` and `GMAIL_OAUTH_CLIENT_SECRET` in the local `.env`, plus a refresh token saved through the email source IPC. Access and refresh tokens are encrypted with Electron safe storage; tokens are never exposed to the renderer.
