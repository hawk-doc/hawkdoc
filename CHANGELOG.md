# Changelog

All notable changes to HawkDoc will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
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
