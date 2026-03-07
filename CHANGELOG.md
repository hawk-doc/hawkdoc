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
