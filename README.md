# North Star

A native Electron desktop coach and study workspace for progressing toward the **Claude Certified Architect – Professional (CCAR-P)** credential.

## Product scope

North Star is intended to guide the learner through an ordered study path while keeping official Anthropic preparation, local progress, notes, and clearly labeled app-created practice in one focused workspace.

- Ordered official preparation curriculum
- Professional Prep Course and supplemental preparation library
- Local progress tracking and notes
- App-created practice drills clearly separated from Anthropic content
- Resizable three-pane workspace with the Anthropic Academy loaded natively on the right

The app does **not** request, collect, or store user credentials.

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
- `PROJECT_BRIEF.md` — product source of truth and session handoff

## Git workflow

- `main` is the stable branch.
- Use short-lived branches such as `feat/curriculum-progress` or `fix/academy-pane`.
- Make small commits and verify with `npm run build` before opening a pull request.
- Do not commit `node_modules`, `dist`, local secrets, or user data.

## Status

The local Projects + Tasks + Kanban workflow is the top implementation priority. The baseline is implemented; next work is runtime acceptance and board-focused fixes only. See `PROJECT_BRIEF.md` and `.hermes/plans/PHASE-02-projects-tasks-kanban.md` for the current boundary and verification requirements.

## License

Private project. All rights reserved unless changed by the repository owner.
