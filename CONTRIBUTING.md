# Contributing to HawkDoc

Contributions are welcome. Please read this before opening a PR.

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | 20+ | [nodejs.org](https://nodejs.org) or via `nvm` |
| npm | 10+ | Bundled with Node 20 |
| Docker | Any | [docker.com](https://www.docker.com) |
| Git | Any | [git-scm.com](https://git-scm.com) |

**Windows users:** Use **Git Bash** or **WSL2**. PowerShell and CMD are not supported — Husky pre-commit hooks are shell scripts that require a Unix-compatible shell.

---

## Local Setup

```bash
# 1. Fork and clone
git clone https://github.com/YOUR_USERNAME/hawkdoc.git
cd hawkdoc

# 2. Install all dependencies (web + api + root tools)
npm install

# 3. Start PostgreSQL and Redis via Docker
docker compose up -d

# 4. Copy environment files
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# 5. Fill in apps/api/.env:
#    DATABASE_URL=postgresql://hawkdoc:password@localhost:5432/hawkdoc
#    (matches the docker-compose.yml credentials)
#
#    For JWT_SECRET, generate a random value:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Paste the output as the JWT_SECRET value in apps/api/.env

# 6. Start both servers
npm run dev
```

| Server | URL |
|---|---|
| Frontend | http://localhost:5173 |
| API | http://localhost:3001 |
| WebSocket | ws://localhost:3002 |

---

## Verifying Your Setup

```bash
# Should return {"status":"ok"}
curl http://localhost:3001/healthz
```

---

## Before Every Commit

The pre-commit hook runs these automatically and blocks the commit on failure:

```bash
npm run typecheck --workspace=apps/web   # TypeScript check
npm run typecheck --workspace=apps/api
npm run lint --workspace=apps/web        # ESLint (0 warnings allowed)
```

To run them manually before committing:

```bash
npm run typecheck --workspaces --if-present
npm run lint --workspace=apps/web
```

---

## Branch Strategy

All branches are off `dev`. All PRs target `dev` — never `main`.

```bash
git checkout dev
git pull origin dev
git checkout -b feature/your-feature-name
```

| Prefix | Use for |
|---|---|
| `feature/` | New features |
| `enhancement/` | Improving existing features |
| `bug/` | Bug fixes |
| `add/` | Assets, config, docs |

---

## Commit Convention

Follow [Conventional Commits](https://www.conventionalcommits.org):

```
feature: add table block support
fix: backspace not deleting image node
chore: update lock file
docs: add Windows setup instructions
enhancement: improve slash menu keyboard navigation
```

---

## PR Checklist

- [ ] Branch is off `dev`, PR targets `dev`
- [ ] `npm run typecheck --workspaces --if-present` passes
- [ ] `npm run lint --workspace=apps/web` passes with zero warnings
- [ ] `npm run build` passes
- [ ] Commit messages follow Conventional Commits
- [ ] No `.env` files committed (they are in `.gitignore`)

---

## Common Errors

### `node: .env: not found`
```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

### `Cannot find module @rollup/rollup-linux-x64-gnu` (or win32/darwin)
Lock file was generated on a different OS. Run:
```bash
npm install
git add package-lock.json
git commit -m "chore: update lock file"
```

### `ESLint couldn't find an eslint.config.js file`
Always run lint through npm workspaces from the repo root — never run `eslint` directly:
```bash
# correct
npm run lint --workspace=apps/web

# incorrect — will not find the config
cd apps/web && npx eslint src
```

### `ERR_CONNECTION_REFUSED` on image upload or API calls
The API server is not running. Start both servers from the repo root:
```bash
npm run dev
```
Confirm the API is up: `curl http://localhost:3001/healthz`

### CORS error in browser
Start the dev server from the repo root with `npm run dev`. The Vite dev server proxies `/api` and `/uploads` to `localhost:3001` automatically — no CORS configuration needed in development.

### Pre-commit hook blocked my commit
Fix the reported typecheck or lint errors, then commit again. Do not use `--no-verify` to skip the hook.

---

## Code Standards

- **TypeScript strict mode** — no `any` types
- **Tailwind CSS only** — no inline styles
- **Lexical for all editor work** — not ProseMirror or TipTap
- **Zod for all external data validation** — API inputs and env vars
- **No `window.prompt()`** — use `InputDialog` component
- **MIT-compatible dependencies only**

See `CLAUDE.md` for deeper architecture notes.

---

## Questions?

Open a [GitHub Discussion](../../discussions). Keep Issues for confirmed bugs only.
