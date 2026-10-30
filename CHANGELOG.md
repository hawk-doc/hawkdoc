# Changelog

All notable changes to HawkDoc will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Security
- `POST /api/auth/login` and `/register` are rate limited per client IP (20 requests per 15 minutes each by default; `AUTH_RATE_LIMIT_MAX` and `AUTH_RATE_LIMIT_WINDOW_SEC`). Over the limit the API answers 429 with a `Retry-After` header. The counter is in memory, per API process

### Fixed
- The 30-second Redis flush no longer bumps a document's `updated_at` when the buffered state is already stored
- Opening a document and closing it without editing no longer bumps its `updated_at`, so it stops jumping to the top of the document list
- `POST /api/auth/login` takes as long to reject an unknown email as a wrong password, so response time no longer reveals which addresses have accounts

### Changed
- The API logs a startup warning when `ALLOWED_ORIGINS` is set but empty, since CORS would then silently block every browser request
- `apps/api/.env.example` now lists `ALLOWED_ORIGINS` (comma-separated CORS origins, default `http://localhost:5173`), so deployments know to set it for their web origin
- The sign-up form warns as you type when a password exceeds the API's 72-byte limit (multi-byte characters count extra) and blocks submitting it, instead of failing after the request
- The login/register rate limiter now sends `RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset` (seconds) on every response, not only `Retry-After` on a 429, so clients can back off before they are blocked
- Creating a document that fails (for example the server is down) now shows "Couldn’t create a new document." in the existing action-error banner instead of failing silently, and no longer leaves an unhandled promise rejection

### Fixed
- `POST /api/auth/register` accepted passwords longer than 72 bytes, which bcrypt silently truncates, so characters past that point were never checked at sign-in. It now answers 400 for them
- An internal editor (Lexical) error, for example in a node transform or update listener, only went to the console, so the last edit could silently fail to apply. It now also shows a dismissible error banner under the toolbar
- A saved version whose content the editor cannot render (for example an empty document state) crashed the version history preview with an uncaught error. The panel now shows "This version could not be displayed" and disables Restore for it, and the rest of the app keeps working
- A failed document action in the sidebar (star, duplicate, rename, move to trash, restore, delete forever, empty trash) rolled back or did nothing without saying so: the error only went to the console. The app now shows a dismissible error banner under the header
- A failed "Copy as Markdown" (clipboard permission denied, or an insecure page with no clipboard API) did nothing visible: the error only went to the console. The toolbar now shows a dismissible error message
- A failed PDF or Word export did nothing visible: the error only went to the console. The editor now shows the same dismissible error banner it uses for import failures
- A failed image upload (signed out, too large, wrong type, server down) did nothing visible: the error only went to the console. The toolbar now shows the reason next to the upload button until it is dismissed or the next upload starts
- Recording several versions of one document at the same moment could trim the version history below its cap: each call counted the versions before taking its turn, so a late one deleted a version the limit did not require. Pruning now counts and trims under a per-document lock
- Behind a reverse proxy every client shared the proxy's IP, so the login/register rate limiter counted them together and one busy address could lock everyone out. Set `TRUST_PROXY` to the number of proxies in front of the API (default `0`, unchanged) and the limiter keys on the real client IP

### Added
- Duplicate a document, from the sidebar row or `POST /api/documents/:id/duplicate`. The copy takes the content the author last saw — the Redis buffer when there is one, which can be half a minute ahead of PostgreSQL — and its history starts with what it was made from
- The document list is paged and searched on the server: `GET /api/documents` takes `q`, `limit` and `cursor` and answers with one page plus a `Link` header, the sidebar loads 50 at a time with "Show more", and its search box now finds documents that were never downloaded. Pagination is keyset, so a document edited mid-scroll cannot make a row repeat or vanish
- Version history comparison: the History panel's Changes tab shows what changed in a version — compared with the version before it, or with the document as it stands, which is what restoring would undo. Edits are marked word by word inside the paragraph that changed, rather than reported as one paragraph deleted and another written; untouched stretches fold away
- Version history: a document's past states are kept as it is edited — one every few minutes and one at the end of each editing session — and the toolbar's History panel lists them by day, previews any of them and restores it. Restoring is an ordinary edit, so collaborators see it, it becomes a version of its own and it can be undone. Versions are stored as Yjs deltas, so a long history costs about what the document does; each document keeps its fifty most recent. Signed out, the same panel reads snapshots kept in the browser
- Word documents: `Export as Word (.docx)` keeps headings, bold/italic/underline/strikethrough, inline code, links, nested lists, quotes, code blocks, page breaks, images and tables; `Import Word (.docx)` reads a Word file into the editor. Both load on demand, so neither adds to the initial bundle
- Test suites: Vitest in both workspaces — API integration tests against PostgreSQL (trash lifecycle, access control, validation) and jsdom tests for the offline document store, title sync and session expiry. Run them with `npm test` in each workspace; CI does not run them yet
- Trash for documents: deleting moves a document to the trash instead of destroying it, and it can be restored from the sidebar's Trash view. Permanently deleting one document or emptying the trash asks for confirmation first. Works signed in (PostgreSQL) and signed out (localStorage)
- Lexical-based editor with H1, H2, H3, paragraph, bullet list, ordered list, code block, quote, divider
- Slash `/` command menu with keyboard navigation
- Formatting toolbar: Bold, Italic, Underline, Strikethrough, inline code, link
- Auto-save with 800ms debounce to localStorage
- Template variable injection — `{{variable_name}}` rendered as styled chips
- PDF export with watermark (client-side Web Worker)
- Editable document title
- Node.js + Express REST API
- Hocuspocus real-time collaboration server
- PostgreSQL document storage with Yjs binary state
- Redis auto-save buffer
- JWT authentication

### Changed
- `PATCH /api/documents/:id` with no fields to update now answers 400 instead of silently bumping `updated_at` and reordering the document list
- `docker compose up` now applies `schema.sql` when the database volume is first created
- Removed the unused `packages/shared` workspace
- Sign-in form and the header sign-in button now use the app's near-black primary instead of blue, matching the Export button (inverted in dark mode for contrast)
- The UI now works on phones and tablets: the document page fits the viewport instead of scrolling sideways, the toolbar stays on one row (secondary controls move into a "More options" panel below `lg`), and the sidebar becomes a drawer below `md`. Desktop is unchanged
- Initial JavaScript cut from 1,938 KB to 515 KB (gzip 626 KB → 159 KB). The PDF renderer loads on first export (preloaded when the pointer reaches Export), and the collaboration stack loads only for signed-in users
- Expired or rejected sign-ins now end the session and reopen the sign-in dialog with a notice, instead of silently showing an empty document list. Triggered by a 401 from any API call, the token's `exp` passing (also checked on load), or the collaboration server rejecting the token
- API shuts down gracefully on SIGTERM/SIGINT: flushes every Redis buffer to PostgreSQL, then closes HTTP, Redis and PostgreSQL connections
- Redis flush uses `SCAN` instead of the blocking `KEYS`, and never overlaps a still-running flush
- Document title edits sync to storage after an 800ms debounce instead of on every keystroke; the sidebar still updates instantly, and pending edits flush on document switch, delete-cancel, and tab close

### Fixed
- Sign-in no longer depends on how an email address is capitalised. Addresses are trimmed and lower-cased on register and login, preventing case-only duplicates among new registrations. Legacy mixed-case addresses are not rewritten, so a new case-only duplicate of a legacy account remains possible. Login succeeds only when exactly one matching account accepts the password. A duplicate address is now detected by PostgreSQL's error code rather than by its message text
- `POST /api/uploads` now requires a signed-in user (it was open to anyone who could reach the API); the editor sends the session token with image uploads and, signed out, reports that signing in is needed
- Documents containing a `{{template_variable}}` could not be serialized: `editorState.toJSON()` threw, which broke offline auto-save and the PDF and Word exports for exactly the documents the feature exists for
- `@lexical/yjs` resolved to a version that bundled its own copy of Lexical, so any runtime use of the collaboration binding threw "Unable to find an active editor state"
- `/healthz` reported OK even when PostgreSQL or Redis was unreachable; it now checks both, bounds each probe, and answers 503 when either is down
- The document title could exceed the 500-character limit the API enforces, so the save failed silently
- Text typed in collaborative (signed-in) documents was never synced or saved — it didn't reach the server or other tabs and was lost on reload
- The editor had no accessible name for screen readers (`aria-label` wasn't forwarded by Lexical's `ContentEditable`)
- Out-of-order title `PATCH` requests could leave a stale title on the server; title writes now run serially
- Redis flush could delete an edit buffered while it was writing to PostgreSQL; buffers are now only deleted if unchanged
- Rejected upload types returned a 500; they now return 415

### Security
- Image uploads are limited to PNG, JPEG, GIF and WebP, verified by file signature; SVG (which can carry scripts) is rejected. The stored extension comes from the verified type, not the client's filename
- `/uploads` responses send `X-Content-Type-Options: nosniff` and a sandboxing `Content-Security-Policy`, which also neutralizes SVGs uploaded before this change

---

## How to Update This File

When making changes, add entries under `[Unreleased]` in the appropriate section:

- **Added** — new features
- **Changed** — changes to existing features
- **Deprecated** — features to be removed soon
- **Removed** — removed features
- **Fixed** — bug fixes
- **Security** — security fixes

When releasing, rename `[Unreleased]` to the version number and date, then add a new empty `[Unreleased]` section at the top.
