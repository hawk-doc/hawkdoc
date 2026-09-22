# Changelog

All notable changes to HawkDoc will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
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
- Expired or rejected sign-ins now end the session and reopen the sign-in dialog with a notice, instead of silently showing an empty document list. Triggered by a 401 from any API call, the token's `exp` passing (also checked on load), or the collaboration server rejecting the token
- API shuts down gracefully on SIGTERM/SIGINT: flushes every Redis buffer to PostgreSQL, then closes HTTP, Redis and PostgreSQL connections
- Redis flush uses `SCAN` instead of the blocking `KEYS`, and never overlaps a still-running flush
- Document title edits sync to storage after an 800ms debounce instead of on every keystroke; the sidebar still updates instantly, and pending edits flush on document switch, delete-cancel, and tab close

### Fixed
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
