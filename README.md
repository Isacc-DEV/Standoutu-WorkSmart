# SmartWork Application Assist (MVP)

Single-server prototype for Admin/Manager/Bidder roles with remote-browser style work page, analyze, and autofill stubs. Built for a small team: Fastify + TypeScript backend and Next.js + Tailwind frontend. Postgres is required for persistence and NextAuth.

## Prerequisites
- Node.js 18+ (Node 22 is fine)
- npm
- Postgres 14+

## Install
```bash
npm install
```
> Workspaces install frontend + backend dependencies together.

## Configuration
- Backend: copy `backend/.env.example` to `backend/.env` and set `DATABASE_URL`. Optional: set Supabase + Azure values for uploads and Graph integration.
- Frontend (local): copy `frontend/.env.local.example` to `frontend/.env.local` and set `DATABASE_URL`, `NEXT_PUBLIC_API_BASE`, and NextAuth/Azure variables.
- Frontend (non-local): copy `frontend/.env.production.example` to `frontend/.env.production` and set public host/port values for `NEXT_PUBLIC_API_BASE`, `NEXTAUTH_URL`, and `MS_REDIRECT_URI`.
- Database: backend auto-creates required tables (including NextAuth tables) on startup.

## Run (two terminals)
Backend (Fastify on port 4000):
```bash
npm --workspace backend run dev
```

Frontend (Next.js dev server on port 3000):
```bash
npm --workspace frontend run dev
```

Electron shell (loads the frontend URL):
```bash
npm --workspace electron start
```
- Electron auto-hosts the same Next.js UI when `FRONTEND_URL` is unreachable (it boots an embedded Next server on port `3300`). If both fail, it falls back to the minimal shell. Set `API_BASE` in your env to point at your backend. `FRONTEND_URL` still overrides the frontend URL when available.

Unpacked Electron build (folder output, no installer/asar, includes embedded frontend):
```bash
npm --workspace electron run build:unpacked
```
- Builds a standalone Next.js server and stages it into `electron/embedded-frontend`, then packages the app.
- Output goes to `electron/dist` (for Windows: `electron/dist/win-unpacked`).
- To target a non-local API, set `NEXT_PUBLIC_API_BASE` before building so it is baked into the frontend bundle.

Open http://localhost:3000 and sign in via `/auth` (or use Azure AD if configured).

## Backend overview (`backend/src`)
- `index.ts`: Fastify app with CORS + WS hooks, auth endpoints, profiles/resumes/sessions endpoints, metrics, LLM settings stub.
- `data.ts`: In-memory placeholders; data persists in Postgres.
- `types.ts`: Domain types for users, profiles, resumes, assignments, sessions, events, LLM settings.

Notable endpoints (MVP):
- `POST /auth/login` - email + password, returns token + user.
- `GET /profiles?userId=` - role-filtered (bidder sees assigned).
- `GET /profiles/:id/resumes` - resumes per profile.
- `POST /sessions` - create session and log event.
- `POST /sessions/:id/go|analyze|autofill|mark-submitted` - stub flows with fill plan sample.
- `GET /metrics/my?bidderUserId=` - tried/submitted/applied%.
- `GET/POST /settings/llm` - org-level LLM config placeholder.

## Frontend overview (`frontend/src/app/page.tsx`)
- Three-column work page: left stats/profile selector; middle URL + remote browser canvas + analyze/resume choice; right base info + autofill results + session status.
- Uses `NEXT_PUBLIC_API_BASE` from the frontend env file.
- Hotkey hint shown (Ctrl+Shift+F); actual hotkey wiring ready for a future handler.
- Remote browser area is a placeholder canvas for the Playwright stream.

## Next steps
1) Replace in-memory data with Postgres models (users/profiles/resumes/assignments/sessions/events/llm_settings).
2) Add auth (JWT) and real RBAC guards.
3) Integrate Playwright streaming (CDP screencast) into `/ws/browser/:sessionId` and render frames on the canvas.
4) Implement job-context extraction + embedding search (pgvector) and real LLM selection.
5) Implement form schema extraction + deterministic mapping + LLM-backed fill plan executor.
6) Add manager/admin dashboards, settings UI, and resume upload pipeline (local storage path `/data/resumes/{profileId}/{resumeId}.pdf`).
7) Harden metrics and audit logging; add submission confirmation flow.

## Scripts
- `npm --workspace backend run build` - type-check backend.
- `npm --workspace frontend run lint` - lint frontend.
