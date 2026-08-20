# North Star

North Star is a native Electron desktop workspace for turning professional development into an accountable, evidence-based practice. It combines a structured learning path, daily focus, follow-through tracking, AI coaching, job discovery, and application preparation in one local-first command center.

This repository is presented as a portfolio project. The product is intentionally opinionated: it keeps durable user data local, protects credentials in the Electron main process, and separates generated practice from official learning content.

## What it demonstrates

- React and Electron architecture with a narrow preload bridge
- Local SQLite persistence with versioned migrations
- Multi-provider job search, ranking, filtering, and diagnostics
- AI-assisted coaching and document generation with explicit audit boundaries
- Controlled application workflows with confirmation gates and file isolation
- A three-pane desktop workspace that can load external learning surfaces natively
- Automated coverage across core domain logic and critical user flows

## Product areas

| Area | Purpose |
| --- | --- |
| Today | Focus the day around a small set of commitments and next actions |
| Learning | Follow an ordered certification curriculum with local progress and notes |
| Jobs | Search, normalize, rank, and inspect opportunities across providers |
| Applications | Organize documents and plan browser-assisted application steps |
| Follow-through | Track commitments, check-ins, and evidence of progress |
| Coach | Generate contextual prompts and practice conversations without exposing secrets to the renderer |

## Architecture

```text
React renderer (src/)
        │ narrow IPC bridge
Electron preload (electron/preload.cjs)
        │
Electron main process (electron/main.cjs)
        ├── SQLite database + migrations
        ├── provider integrations and job ranking
        ├── document and application workflows
        └── credential storage through OS-backed safe storage
```

The renderer owns presentation and interaction state. Provider credentials, filesystem access, database writes, external navigation, and AI calls remain in the main process. Local runtime data is stored outside the repository.

## Run locally

Requirements: Node.js and npm.

```bash
npm install
Copy-Item .env.example .env
npm run build
npm run desktop
```

For a production-style local launch:

```bash
npm run desktop:prod
```

The Google sign-in flow requires a desktop OAuth client with the Gmail API enabled. Add its values to the gitignored `.env` file before starting the app.

## Verification

```bash
npm run build
npm test
```

The test suite covers the application domain, provider adapters, ranking fallbacks, persistence contracts, document handling, and key presentation behavior.

## Repository conventions

- `src/` contains the React renderer and UI/domain helpers.
- `electron/` contains the privileged desktop process, integrations, persistence, and migrations.
- `test/` contains automated regression coverage.
- `.hermes/` contains durable project decisions and product context.
- Local resumes, generated PDFs, application exports, temporary files, and secrets are intentionally excluded from version control.

## License

Private portfolio project. All rights reserved unless changed by the repository owner.
