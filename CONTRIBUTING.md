# Contributing to HawkDoc

Thank you for your interest in contributing! HawkDoc is open source and contributions of all kinds are welcome — bug fixes, features, documentation, tests, and design.

---

## Before You Start

- Check [existing issues](../../issues) to avoid duplicates
- For large features, open an issue first to discuss before building
- All PRs target the `dev` branch, not `main`

---

## Development Setup

### Prerequisites
- Node.js 20+
- Docker (for PostgreSQL and Redis)
- Git

### Steps

```bash
# 1. Fork and clone
git clone https://github.com/YOUR_USERNAME/hawkdoc.git
cd hawkdoc

# 2. Install dependencies
npm install

# 3. Start database and Redis
docker-compose up -d

# 4. Set up environment variables
cp apps/api/.env.example apps/api/.env
# Edit .env with your local values

# 5. Run database schema
psql -U hawkdoc -d hawkdoc -f apps/api/src/schema.sql

# 6. Start everything
npm run dev
```

Frontend runs at `http://localhost:5173`
API runs at `http://localhost:3001`
Collaboration server at `ws://localhost:3002`

---

## Making Changes

### Branch naming
```
feat/your-feature-name
fix/bug-description
docs/what-you-updated
chore/dependency-update
```

### Commit messages
We use [Conventional Commits](https://www.conventionalcommits.org):
```
feat: add slash command menu
fix: resolve auto-save lag on large documents
docs: update README with quick start
chore: bump lexical to 0.15.0
refactor: extract useAutoSave to separate hook
```

### Code standards
- TypeScript strict mode — no `any` types
- Tailwind CSS only — no inline styles
- Lexical for all editor functionality — not ProseMirror or TipTap
- Zod for all external data validation
- JSDoc comments on all exported functions and components
- MIT-compatible dependencies only

---

## Opening a Pull Request

1. Make sure CI passes locally:
   ```bash
   npx tsc --noEmit    # type check
   npx eslint src/     # lint
   npm run build       # build
   ```
2. Push your branch and open a PR targeting `dev`
3. Fill out the PR template completely
4. A maintainer will review within 48 hours

---

## What We Welcome

- Bug fixes with reproduction steps
- Performance improvements (especially editor lag)
- New block types for the editor
- Improved TypeScript types
- Documentation improvements
- Test coverage
- Accessibility improvements

## What to Discuss First (open an issue)

- New major features
- Breaking API changes
- Changes to the tech stack
- Changes to the database schema

---

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By participating you agree to uphold it.

---

## Questions?

Open a [GitHub Discussion](../../discussions) — keep Issues for confirmed bugs only.
