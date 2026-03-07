# HawkDoc — Claude Code Instructions

## Project Overview
HawkDoc is an open-source, high-performance document editor built to be a better alternative to SuperDoc. It is Notion-style, supports DOCX-level formatting, real-time collaboration, template injection, PDF export with watermark, and auto-save. The core design principle is **zero lag** — on typing, scrolling, cursor movement, and export.

## Monorepo Structure
```
hawkdoc/
├── apps/
│   ├── web/          # React + TypeScript + Tailwind + Lexical (frontend)
│   └── api/          # Node.js + Express + Hocuspocus + Yjs (backend)
├── packages/
│   └── shared/       # Shared types, constants, utilities
├── CLAUDE.md
├── package.json      # Root workspace (npm workspaces)
└── docker-compose.yml
```

## Tech Stack

### Frontend (apps/web)
- **React 18 + TypeScript** — strict mode enabled
- **Tailwind CSS v3** — utility-first styling
- **Lexical** (Meta) — editor engine. NOT ProseMirror, NOT TipTap, NOT Slate
- **Yjs + y-lexical** — CRDT real-time collaboration
- **@hocuspocus/provider** — WebSocket client for real-time sync
- **@react-pdf/renderer** — client-side PDF export
- **KaTeX** — math/LaTeX rendering (no backend needed)
- **react-virtual** — virtualize long document pages
- **Vite** — bundler

### Backend (apps/api)
- **Node.js 20 + TypeScript**
- **Express** — REST API
- **Hocuspocus** — WebSocket collaboration server (Yjs CRDT)
- **PostgreSQL** — primary database (via `pg` driver)
- **Redis** — auto-save buffer, caching (via `ioredis`)
- **JWT** — stateless auth
- **Zod** — runtime schema validation
- **tsx** — TypeScript execution

## Critical Rules — Read Before Writing Any Code

### Editor
1. **ALWAYS use Lexical** for editor functionality. Never suggest ProseMirror or TipTap.
2. **Never re-render the entire editor** on a single keystroke. Use Lexical's `$getRoot`, node transforms, and editor commands properly.
3. **Auto-save must be debounced** — minimum 800ms after last keystroke. Never block the editor thread for saves.
4. **Template variables** are stored as special Lexical nodes (e.g. `TemplateVariableNode`), not plain text. They render as styled chips and are replaced on export.
5. **PDF export runs in a Web Worker** — never on the main thread. This prevents UI freeze during export.
6. **Virtualize pages** — use `react-virtual` to only render visible pages for large documents.

### Backend
1. **Hocuspocus handles all WebSocket/real-time logic** — do not write custom WebSocket code for document sync.
2. **REST API (Express) handles** — auth, document CRUD, user management, template management, file upload/download.
3. **Never store full document snapshots on every save** — store Yjs binary update deltas only. Reconstruct full state on load.
4. **Redis is the auto-save buffer** — flush to PostgreSQL every 30 seconds or on clean disconnect, not on every keystroke.
5. **All routes must be validated with Zod** — no unvalidated `req.body` access.
6. **JWT must be verified on every protected route** via middleware.

### Code Quality
- TypeScript strict mode: `"strict": true` in all tsconfigs
- No `any` types — use proper interfaces and generics
- All async functions must have try/catch or propagate errors properly
- Use `zod` for all external data validation (API inputs, env vars)
- Env vars must be validated at startup with Zod — crash fast if missing

### Naming Conventions
- Components: PascalCase (`EditorToolbar.tsx`)
- Hooks: camelCase with `use` prefix (`useAutoSave.ts`)
- API routes: kebab-case (`/api/documents/:id/export`)
- DB tables: snake_case (`document_versions`, `user_sessions`)
- Constants: SCREAMING_SNAKE_CASE (`MAX_FILE_SIZE_MB`)

## Environment Variables

### Frontend (.env)
```
VITE_API_URL=http://localhost:3001
VITE_WS_URL=ws://localhost:3002
```

### Backend (.env)
```
NODE_ENV=development
PORT=3001
HOCUSPOCUS_PORT=3002
DATABASE_URL=postgresql://user:password@localhost:5432/hawkdoc
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secret-here
JWT_EXPIRES_IN=7d
MAX_FILE_SIZE_MB=50
```

## Key Features to Implement (in priority order)

### MVP (this weekend)
- [ ] Lexical editor with block types: H1, H2, H3, paragraph, bullet list, ordered list, code block, quote, divider
- [ ] Slash `/` command menu (floating dropdown triggered by `/`)
- [ ] Toolbar: Bold, Italic, Underline, Strikethrough, inline code, link
- [ ] Auto-save with debounce (localStorage for MVP, then API)
- [ ] Template variable injection — `{{variable_name}}` becomes a TemplateVariableNode
- [ ] PDF export with watermark (client-side, Web Worker)
- [ ] Clean Notion-style UI with Tailwind
- [ ] Document title editing

### Post-MVP
- [ ] Real-time collaboration (Hocuspocus + Yjs)
- [ ] User auth (JWT)
- [ ] Document list / workspace
- [ ] Comments and tracked changes
- [ ] DOCX import/export
- [ ] Version history

## Common Patterns

### Lexical editor command pattern
```typescript
editor.dispatchCommand(INSERT_HEADING_COMMAND, { tag: 'h1' });
```

### Auto-save hook pattern
```typescript
useEffect(() => {
  const timer = setTimeout(() => {
    onSave(editorState); // debounced
  }, 800);
  return () => clearTimeout(timer);
}, [editorState]);
```

### Zod env validation pattern (backend)
```typescript
const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  PORT: z.coerce.number().default(3001),
});
export const env = EnvSchema.parse(process.env);
```

### Hocuspocus server pattern
```typescript
const server = Server.configure({
  port: env.HOCUSPOCUS_PORT,
  async onLoadDocument(data) {
    // Load Yjs binary from PostgreSQL
  },
  async onChange(data) {
    // Buffer to Redis, flush to PostgreSQL
  },
});
```

## What NOT to Do
- Do NOT use `create-react-app` — use Vite
- Do NOT use `axios` — use native `fetch` or `ky`
- Do NOT store passwords in plaintext — use `bcrypt`
- Do NOT use `var` — use `const`/`let`
- Do NOT write inline styles — use Tailwind classes
- Do NOT render all document content at once for large docs — virtualize
- Do NOT block the main thread for PDF export — use Web Worker
- Do NOT use ProseMirror or TipTap — use Lexical

## Running the Project
```bash
# Install all dependencies
npm install

# Run frontend
npm run dev --workspace=apps/web

# Run backend
npm run dev --workspace=apps/api

# Run both
npm run dev
```

## Open Source Standards

### License
This project uses the **MIT License**. The `LICENSE` file must exist in the project root at all times.

### Versioning
Follow **Semantic Versioning**: `MAJOR.MINOR.PATCH`. Start at `0.1.0` for MVP.

Use **Conventional Commits** for every commit message.

### Branch Strategy
- `main` — always stable, always deployable. Protected branch — no direct commits
- `dev` — integration branch, all PRs target here first
- Feature branches off `dev`: `feat/slash-commands`, `fix/autosave-lag`

## When Stuck
- Lexical docs: https://lexical.dev/docs/intro
- Hocuspocus docs: https://tiptap.dev/docs/hocuspocus
- Yjs docs: https://docs.yjs.dev
- Conventional Commits spec: https://www.conventionalcommits.org

---

## Recent Changes

### Project Rename — DocEdit → HawkDoc
- All source files, markdown docs, package names, config files, and the root folder renamed from `DocEdit`/`docedit` to `HawkDoc`/`hawkdoc`
- Package names updated: `docedit` → `hawkdoc`, `@docedit/web` → `@hawkdoc/web`, `@docedit/api` → `@hawkdoc/api`, `@docedit/shared` → `@hawkdoc/shared`
- `localStorage` key updated: `docedit_autosave` → `hawkdoc_autosave`
- `LICENSE` copyright updated to `HawkDoc Contributors`
- `instructions/` folder and all its files fully renamed

### UI Redesign — Centered Editor Layout
- **Removed** the left `Sidebar` component (`Sidebar.tsx` still exists but is no longer rendered)
- **Added** a full-width sticky top header in `App.tsx`:
  - Left: HawkDoc brand (violet-blue gradient icon + name)
  - Right: GitHub icon + link (`YOUR_ORG/hawkdoc` — update when org is created)
- **Editor** is now a centered white paper card (`max-w-3xl`, rounded, shadow, border) on a `notion-sidebar` gray background
- **Toolbar** remains sticky at top of the scroll area (just below the header)
- **Footer** (word count + keyboard hints) moved below the card
- `editor-content` min-height changed from `calc(100vh-200px)` to `480px`
- Modified files: `App.tsx`, `Editor.tsx`, `index.css`

### Open Source Cleanup
- Deleted `apps/api/.env` and `apps/web/.env` (contained real JWT secret and credentials)
- Fixed root `.env.example` — replaced real-looking JWT secret hash with placeholder text
- Fixed `apps/api/.env.example` — updated DB name to `hawkdoc`
- Removed fake npm version badge from `README.md` (packages are all `private: true`)
- Removed broken demo link (`demo.docedit.dev`) from `README.md`
- Fixed `CODE_OF_CONDUCT.md` — added placeholder contact email instead of dead README reference
- Fixed `CONTRIBUTING.md` — replaced nonexistent `npm run migrate` with `psql` schema command

### CI Workflow Fix
- `npx tsc --noEmit` replaced with `npm run typecheck --workspace=apps/web` and `npm run typecheck --workspace=apps/api` (no root `tsconfig.json` exists)
- `npx eslint .` replaced with `npm run lint --workspace=apps/web` (only `apps/web` has a lint script)

### Package Manager Cleanup
- Removed `yarn.lock` (project uses npm workspaces — yarn.lock was a conflicting leftover)
- Deleted `apps/web/node_modules/.vite` (stale Vite build cache)
- Regenerated `package-lock.json` with npm
