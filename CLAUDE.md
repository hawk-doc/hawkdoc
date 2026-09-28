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
- Word export and import — `Export as Word (.docx)` and `Import Word (.docx)` in the Export menu
- Version history — the toolbar's History button opens a panel listing past versions, previews one, shows what changed in it, and restores it (`VersionHistoryPanel.tsx`)
- Auto-save with 800ms debounce to localStorage (`useAutoSave.ts`)
- Editable document title
- Code block with copy-to-clipboard (`CodeBlockPlugin.tsx`)
- `InputDialog.tsx` — reusable modal for link and variable name input (replaces `window.prompt`)
- Image upload — toolbar button uploads to backend via multer, inserts as `ImageNode` (block-level DecoratorNode). Click to select, Backspace/Delete to remove. Persists after refresh. Included in PDF export.

### Backend (skeleton — not production ready)
- JWT auth middleware (`middleware/auth.ts`)
- Document CRUD routes (`routes/documents.ts`)
- Auth routes — register/login (`routes/auth.ts`)
- Hocuspocus server with JWT `onAuthenticate` and document ownership check (`hocuspocus.ts`)
- Redis buffer → PostgreSQL flush every 30s (`redis.ts`)
- Zod env validation at startup (`env.ts`)

## What Is Planned (not started)
- Document sharing between users (collaboration is currently owner-only)

### Version history follow-ups
Highest value first. The constraint on each line is the part worth keeping —
each was worked out against the shipped code, not guessed at.

- **Named versions.** "Save a version now" with a label, plus a `pinned` column
  so a named version outlives the cap. `pruneVersions` merges rather than
  drops, so pinned rows only need excluding from the candidates.
- **A guaranteed recovery point before destructive actions.**
  `POST /api/documents/:id/versions` to force one, called before a Word import
  and before a restore — both replace the whole document. It also covers a tab
  that dies without closing its socket, where the final state otherwise waits
  out the five-minute throttle.
- **Export a version without restoring it.** The preview already holds the
  decoded state; wire it to `lib/docxExport.ts` and `lib/pdfExport.ts`.
- **Copy one block out of a version** instead of replacing the document.
  `lib/versions/restore.ts` already parses serialised nodes — apply it to a
  selection rather than the whole root.
- **Say what a version is worth** in the list: a word-count delta rather than
  `sizeBytes`, which the API returns today and the UI ignores.
- **Arrow-key navigation** through the version list, and an `aria-live` region
  for the preview while it loads. Escape and the Tab trap are already there.
- **Attribution** (`document_versions.created_by`). A version spans a whole
  flush window, so it is a *set* of contributors, not one user. Build it with
  document sharing — it is near-pointless while collaboration is owner-only.
- **Retention thinning** instead of the flat cap of fifty: keep everything for
  a day, hourly for a week, daily beyond, reusing the merge-on-prune code so
  history reaches back months at the same row count.
- **Offline history is per-browser and invisible anywhere else**, and the panel
  does not say so. Either say it in the empty state, or sync local snapshots up
  on first sign-in.

## Word (.docx) Import and Export

Export is two layers, so the mapping can be tested without generating a file:
`lib/docx/model.ts` turns Lexical's serialised state into blocks (headings,
runs with formatting and links, nested lists, code, dividers, page breaks,
images, tables), and `lib/docx/render.ts` writes those blocks with the `docx`
package. `lib/docxExport.ts` loads the renderer on demand — it must stay out
of the initial bundle, like the PDF renderer.

Import goes the other way: `lib/docx/import.ts` converts the file to HTML with
mammoth, and `lib/docxImport.ts` turns that HTML into Lexical nodes in a single
editor update, so it is one undo step. Files over 10MB and non-.docx files are
refused with a message; the editor shows a dismissable alert because import
replaces the document.

## Version History

Versions are Yjs update **deltas** in `document_versions`, never snapshots:
each row holds what changed since the row before it, `state_vector` describes
the document as of that version (what the next delta is diffed against) and
`seq` orders the chain. The state at a version is the merge of every delta up
to it — see `reconstructVersion` in `apps/api/src/versions.ts`.

`recordVersion` runs from both save paths (the Redis flush and the Hocuspocus
disconnect, the latter unthrottled), skips unchanged states, and keeps the
newest `MAX_VERSIONS_PER_DOC`. Pruning **merges** the deltas it drops into the
oldest surviving version — deleting them would break every version rebuilt
from the chain.

The client reads a version through the same binding live collaboration uses
(`lib/versions/decode.ts`): a Lexical editor with no root element, a provider
that connects to nothing, and the Yjs state replayed into it. Do not write a
second Yjs-to-Lexical converter — it would drift from what the editor renders.
`lib/versions/decode.ts` must stay out of the initial bundle.

Restoring writes the old content inside `editor.update()`
(`lib/versions/restore.ts`), so it travels through Yjs like any other edit:
collaborators see it, it is recorded as a new version and it can be undone.
Never restore with `setEditorState` — that bypasses Yjs and desynchronises
everyone else.

Signed out there is no Yjs, so `lib/versions/localVersions.ts` keeps snapshots
of the editor state in localStorage instead, throttled the same way and capped;
they give way rather than failing a save when the quota is reached.

### Comparing versions
`lib/versions/diff.ts` compares two decoded states and `VersionDiff.tsx`
renders the result; the panel's Changes tab compares the selected version
either with the one before it or with the document as it stands. The
comparison is **structural**: documents are flattened into the blocks a reader
recognises (paragraphs, list items, table rows), matched with a
longest-common-subsequence pass, and blocks that survived in edited form are
compared again word by word. Diffing serialised JSON or plain text would
report a moved paragraph as a deletion plus an insertion, and a list as
changed whenever one bullet is added. A heading's level is part of its
identity, so H2 → H1 registers.

Matching is quadratic, so it runs over a flat typed table and stops at
`MAX_BLOCKS`, reporting the comparison as truncated. Keep the rendering in
`<ins>`/`<del>` with text markers — a diff that works only in colour doesn't
work for everyone. Do **not** reach for Yjs snapshot attribution
(`Y.snapshot`): it requires `gc: false`, which makes every document grow
forever.

## Document Trash
Deleting a document is a soft delete: `documents.deleted_at` is set, the row
and its Yjs state are kept, and the sidebar's Trash view can restore it.
Only "Delete forever" and "Empty trash" remove data, and both confirm first.
Trashed documents are excluded from the document list and refused by
Hocuspocus. Signed out, the same model runs on localStorage
(`hawkdoc-trash`), and a trashed document keeps its content key.

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

### Image upload pattern (toolbar → backend → ImageNode)
```typescript
// Frontend: POST multipart to /api/uploads, get back { url }
const formData = new FormData();
formData.append('image', file);
const { url } = await fetch(`${VITE_API_URL}/api/uploads`, { method: 'POST', body: formData }).then(r => r.json());
const src = `${VITE_API_URL}${url}`;
editor.update(() => { $insertNodeToNearestRoot($createImageNode(src, file.name)); });

// ImageNode uses useLexicalNodeSelection for click-to-select and Backspace/Delete to remove
// Do NOT store base64 in ImageNode — store URL only
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

## Tests

```bash
npm test --workspace=apps/api   # integration tests; needs docker compose up -d
npm test --workspace=apps/web   # jsdom tests
```

- API tests mount the Express app via `createApp()` from `apps/api/src/app.ts`
  (`index.ts` owns the servers) and run against a real PostgreSQL and Redis.
- Web tests use Vitest + jsdom + Testing Library.
- Add tests next to what they cover: `src/routes/documents.trash.test.ts`,
  `src/hooks/useDocumentStore.test.tsx`.
- `src/test/collab.ts` (web) builds the Yjs state a collaborative document
  would hold, so tests can work with what the API really stores.

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
- All feature/fix branches are off `dev` and PR back to `dev`

**Branch prefixes:**
- `feature/` — new features (e.g. `feature/image-upload`)
- `enhancement/` — improvements to existing features (e.g. `enhancement/toolbar-ux`)
- `bug/` or `bugs/` — bug fixes (e.g. `bug/backspace-delete`, `bugs/autosave-lag`)
- `add/` — adding assets, configs, docs (e.g. `add/screenshot`)

## Infrastructure Notes

### File Storage
- **MVP**: multer with local disk storage (`apps/api/uploads/`). Served via `express.static`.
- **Production**: Replace disk storage with `multer-s3` (AWS S3, Cloudflare R2, or similar). Frontend URL stays the same — only the storage adapter changes. CDN in front for edge delivery.

## Reference Docs
- Lexical: https://lexical.dev/docs/intro
- Hocuspocus: https://tiptap.dev/docs/hocuspocus
- Yjs: https://docs.yjs.dev
- Conventional Commits: https://www.conventionalcommits.org
