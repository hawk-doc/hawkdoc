# HawkDoc — Claude daily-PR notes

## Codebase map
- Stack: npm workspaces monorepo. `apps/web` React18+TS+Tailwind+Lexical+Vite (vitest); `apps/api` Node20+Express+Hocuspocus+Yjs, PostgreSQL (`pg`), Redis, JWT, Zod, vitest+supertest; `packages/shared`.
- API entry: `apps/api/src/index.ts`, app in `app.ts`, routes in `routes/{auth,documents,uploads}.ts`, `versions.ts` (Yjs delta history), `hocuspocus.ts`, `redis.ts`, schema `schema.sql`.
- Web: `apps/web/src` (components, hooks, lib/{docx,versions}, context/AuthContext).
- Branches: PR to `dev`, never `main`. Prefixes `enhancement/`, `bug/`, `feature/`. PR template at `.github/PULL_REQUEST_TEMPLATE.md`; update `CHANGELOG.md` [Unreleased] (### Fixed / ### Added).
- Commands (repo root): `npm ci` | `npm run lint` | `npm run typecheck` | `npm run build` | `npm test --workspaces --if-present` (pipe to `tail`; web = 127 tests, api = 35).
- API tests are integration tests and need PostgreSQL + Redis. In the cloud sandbox (root, no docker) this works:
  `service postgresql start; su postgres -c "psql -c \"CREATE USER hawkdoc PASSWORD 'password' SUPERUSER\" -c 'CREATE DATABASE hawkdoc OWNER hawkdoc'"; PGPASSWORD=password psql -h 127.0.0.1 -U hawkdoc hawkdoc -f apps/api/src/schema.sql; redis-server --daemonize yes`
- Commit hook (husky + lint-staged) runs typecheck + eslint; commits are slow-ish but fine.
- `gh` CLI is unavailable; use the GitHub MCP tools (`mcp__github__*`, load via ToolSearch). Local `origin` only has main + the session branch until you `git fetch origin dev`.
- CronCreate in a cloud session is session-only (dies with the session, 7-day expiry) and has no email/push or timezone options; the local tz is UTC (9:00 IST = `30 3 * * *`).

## Backlog
- [ ] (bug) `POST /api/uploads` has `// TODO: add requireAuth` — auth UI now exists; require the token and send it from the web upload code.
- [ ] (bug/hardening) Add unique index on `LOWER(email)` in schema.sql once safe (see PR #27 risks); registration can still duplicate a legacy mixed-case address.
- [ ] (enhancement) `pruneVersions` runs unguarded per record; concurrent calls could race (low risk).
- [ ] (enhancement) No rate limiting on `/api/auth/login` and `/register`.

## History
- 2026-09-30 | bug | bug/case-insensitive-email | https://github.com/hawk-doc/hawkdoc/pull/27 | open, awaiting owner review (first run with memory; recent history: #23 enhancement/tests, #24-26 features)
- 2026-10-01 | enhancement | enhancement/reject-empty-document-update | https://github.com/hawk-doc/hawkdoc/pull/28 | open, awaiting owner review (empty PATCH now 400)

## Lessons
- `git ls-remote --heads origin` first: the local clone only knows main; `dev` and all other branches must be fetched.
- Don't read the huge `list_pull_requests` output directly; it is persisted to a file — parse with python for number/head/title.
- After `cd` into subdirs the working directory persists; use absolute paths / `cd /home/user/hawkdoc`.
- Code on `dev` is already well hardened (zod everywhere, ownership checks); bugs are subtle — read `routes/auth.ts`, uploads, and web upload/auth code rather than running checks (all green at start).
- Scheduled-run sessions: CronCreate rejects `CRON_TZ=` prefixes (5 fields only); can't be named or given notifications, so the "HawkDoc daily PR" schedule must be set up by the owner in the routines UI.
- `listDocs` test helper returns titles only; use `GET /api/documents/:id` (`updatedAt`) for timestamps.
