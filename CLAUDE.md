# HawkDoc — Claude Code Instructions

## Project Overview
HawkDoc is an open-source, high-performance document editor. It is Notion-style, supports template variable injection, PDF export with watermark, and auto-save. The core design principle is **zero lag** — on typing, scrolling, cursor movement, and export.

GitHub: https://github.com/hawk-doc/hawkdoc

## Monorepo Structure
```
hawkdoc/
├── apps/
│   ├── web/          # React + TypeScript + Tailwind + Lexical (frontend)
│   └── api/          # Node.js + Express + Hocuspocus + Yjs (backend)
├── packages/
│   └── shared/       # Shared types, constants, utilities
├── docs/             # Screenshots and assets for README
├── CLAUDE.md
├── package.json      # Root workspace (npm workspaces)
└── docker-compose.yml
```

## Tech Stack

### Frontend (apps/web)
- **React 18 + TypeScript** — strict mode enabled
- **Tailwind CSS v3** — utility-first styling
- **Lexical** (Meta) — editor engine. NOT ProseMirror, NOT TipTap, NOT Slate
- **@react-pdf/renderer** — client-side PDF export (runs on main thread)
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

## What Is Already Built

### Frontend
- Lexical editor with block types: H1, H2, H3, paragraph, bullet list, ordered list, code block, quote, divider
- Slash `/` command menu with keyboard navigation (`SlashCommandMenu.tsx`)
- Formatting toolbar: Bold, Italic, Underline, Strikethrough, inline code, link (`EditorToolbar.tsx`)
- Floating bubble menu on text selection (`BubbleMenu.tsx`)
- Template variable injection — `{{variable_name}}` becomes a `TemplateVariableNode` (styled chip)
- PDF export with watermark via Export menu in toolbar (`DocumentPDF.tsx`)
- Markdown and HTML export (in toolbar Export dropdown)
- Auto-save with 800ms debounce to localStorage (`useAutoSave.ts`)
- Editable document title
- Code block with copy-to-clipboard (`CodeBlockPlugin.tsx`)
- `InputDialog.tsx` — reusable modal for link and variable name input (replaces `window.prompt`)

### Backend (skeleton — not production ready)
- JWT auth middleware (`middleware/auth.ts`)
- Document CRUD routes (`routes/documents.ts`)
- Auth routes — register/login (`routes/auth.ts`)
- Hocuspocus server with JWT `onAuthenticate` and document ownership check (`hocuspocus.ts`)
- Redis buffer → PostgreSQL flush every 30s (`redis.ts`)
- Zod env validation at startup (`env.ts`)

## What Is Planned (not started)
- Real-time collaboration UI (Yjs + Hocuspocus client)
- Document list / workspace
- DOCX import/export
- Version history
- Image upload support
- User auth UI

## Critical Rules — Read Before Writing Any Code

### Editor
1. **ALWAYS use Lexical** for editor functionality. Never suggest ProseMirror or TipTap.
2. **Never re-render the entire editor** on a single keystroke. Use Lexical's `$getRoot`, node transforms, and editor commands properly.
3. **Auto-save must be debounced** — minimum 800ms after last keystroke. Never block the editor thread for saves.
4. **Template variables** are stored as `TemplateVariableNode` (DecoratorNode), not plain text. They render as styled chips and are replaced on export.
5. **PDF export runs on the main thread** via `@react-pdf/renderer`. Do not move to a Web Worker — it does not support the APIs required.
6. **Never use `window.prompt()`** — use `InputDialog.tsx` for any user input dialogs.

### Backend
1. **Hocuspocus handles all WebSocket/real-time logic** — do not write custom WebSocket code for document sync.
2. **REST API (Express) handles** — auth, document CRUD, user management, template management, file upload/download.
3. **Never store full document snapshots on every save** — store Yjs binary update deltas only. Reconstruct full state on load.
4. **Redis is the auto-save buffer** — flush to PostgreSQL every 30 seconds or on clean disconnect, not on every keystroke.
5. **All routes must be validated with Zod** — no unvalidated `req.body` access.
6. **JWT must be verified on every protected route** via middleware. Hocuspocus uses `onAuthenticate` for WebSocket auth.

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

## Key Patterns

### InputDialog (replaces window.prompt)
```typescript
<InputDialog
  title="Insert link"
  placeholder="https://..."
  confirmLabel="Insert"
  onConfirm={(url) => { /* use value */ }}
  onCancel={() => setOpen(false)}
/>
```

### Auto-save hook pattern
```typescript
useEffect(() => {
  const timer = setTimeout(() => {
    onSave(editorState); // debounced 800ms
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

### Hocuspocus pattern (with auth)
```typescript
const server = Server.configure({
  port: env.HOCUSPOCUS_PORT,
  async onAuthenticate(data) {
    const payload = jwt.verify(data.token, env.JWT_SECRET);
    return { userId: payload.userId };
  },
  async onLoadDocument(data) {
    const { userId } = data.context;
    // verify ownership, load Yjs state from Redis or PostgreSQL
  },
  async onChange(data) {
    // buffer to Redis
  },
});
```

### PDF export pattern (main thread)
```typescript
const blob = await pdf(createElement(DocumentPDF, { editorState, title, watermark })).toBlob();
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = `${title}.pdf`;
a.style.display = 'none';
document.body.appendChild(a);
a.click();
document.body.removeChild(a);
URL.revokeObjectURL(url);
```

## What NOT to Do
- Do NOT use `create-react-app` — use Vite
- Do NOT use `axios` — use native `fetch` or `ky`
- Do NOT store passwords in plaintext — use `bcrypt`
- Do NOT use `var` — use `const`/`let`
- Do NOT write inline styles — use Tailwind classes
- Do NOT use `window.prompt()` — use `InputDialog.tsx`
- Do NOT use ProseMirror or TipTap — use Lexical
- Do NOT import `LexicalErrorBoundary` as default — use named import `{ LexicalErrorBoundary }`

## Running the Project
```bash
# Install all dependencies
npm install

# Run frontend only
npm run dev --workspace=apps/web

# Run backend only
npm run dev --workspace=apps/api

# Run both
npm run dev
```

## Open Source Standards

### License
MIT. The `LICENSE` file must exist in the project root at all times.

### Versioning
Semantic Versioning: `MAJOR.MINOR.PATCH`. Current version: `0.1.0`.

Use **Conventional Commits** for every commit message.

### Branch Strategy
- `main` — always stable, always deployable. Protected — no direct commits
- `dev` — integration branch, all PRs target here first
- Feature branches off `dev`: `feat/slash-commands`, `fix/autosave-lag`

## Reference Docs
- Lexical: https://lexical.dev/docs/intro
- Hocuspocus: https://tiptap.dev/docs/hocuspocus
- Yjs: https://docs.yjs.dev
- Conventional Commits: https://www.conventionalcommits.org
