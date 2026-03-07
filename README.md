<p align="center">
  <img src="logo.png" alt="HawkDoc" width="220" />
</p>

<h1 align="center">HawkDoc</h1>

<p align="center"><strong>A high-performance, open-source document editor built on Lexical.</strong></p>

<p align="center">
  <a href="https://github.com/hawk-doc/hawkdoc/actions/workflows/ci.yml"><img src="https://github.com/hawk-doc/hawkdoc/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT" /></a>
</p>

---

## What is HawkDoc?

HawkDoc is an experimental high-performance document editor focused on the problems that existing editors handle poorly at scale.

The goal is to support:

- Large documents without typing lag
- Template-based document generation with dynamic `{{variable}}` placeholders
- PDF and DOCX export pipelines that don't block the UI
- Real-time collaboration without full-document re-renders

The project is currently **MVP stage** and actively evolving. Early contributors and feedback are very welcome.

---

## Screenshot

<!-- Replace with actual GIF: record with Kap, LICEcap, or ScreenToGif, save to docs/demo.gif -->
_Demo GIF coming soon._

---

## Demo

A short demo GIF will be added soon.

HawkDoc is currently in MVP stage and the UI is still evolving.

---

## Show HN: I hit 9 production bugs in a ProseMirror-based editor. So I built HawkDoc on Lexical instead.

> _This is the real story behind HawkDoc._

I integrated a ProseMirror-based document editor (SuperDoc v1.16.x) into a production real-estate reporting tool with property photos, template variables, and PDF exports. Over three months, I catalogued every failure. Nine bugs. Some were my code. Most were architectural limits of ProseMirror, the engine behind SuperDoc, Notion v1, and Confluence.

**The bugs, and why I stopped patching them:**

**Bug 1: Typing lag on 4MB+ documents.** I was calling `getJSON()` on every editor update to debounced-autosave. At 4MB, ProseMirror serialises its entire document tree to JSON on the main thread, 100-200ms per save tick. The document froze on every keystroke. I patched it by switching to binary DOCX export and an 8-second debounce. It felt like tuning a carburetor on an engine that needs replacing.

**Bug 2: Images vanished after autosave + reload.** The editor stores images as `blob:` URLs in its JSON. Blob URLs are ephemeral, they die when the page unloads. My autosave was faithfully persisting dead references. Fixed by switching to binary DOCX persistence. Still a footgun waiting for the next person.

**Bug 3 and 4: LibreOffice exit code 5.** PDF generation ran through LibreOffice on the server. The editor placed `<w:sectPr>` as a non-last child of `<w:body>`, an OOXML spec violation that Word and Google Docs silently accept but LibreOffice rejects hard. All exports 500'd. A separate `w:fill="AUTO"` bug painted every table cell black. I was patching raw XML with regex before sending it to LibreOffice.

**Bug 9: Every image slot rendered the same (last) image.** I generated DOCX files with [docx-templates](https://github.com/guigrpa/docx-templates), which assigns `id="0"` to every `<pic:cNvPr>` element it inserts. The OOXML spec requires these IDs to be unique. ProseMirror uses this ID as a node key. When all images share `id="0"`, ProseMirror deduplicates them and renders only the last one in every slot. The images displayed correctly in Word, LibreOffice, and Google Docs. The bug was entirely inside ProseMirror's node model.

I stopped patching and started building.

---

## Why not ProseMirror?

ProseMirror powers many well-known editors (Notion v1, Confluence, TipTap) and it is genuinely excellent for most use cases. But at scale, several architectural properties become constraints:

- **Full document serialisation on many updates:** ProseMirror rebuilds its schema representation from the root on large updates. On big documents, this is measurable on the main thread.
- **DOM-bound node identity:** nodes are identified by attributes in the underlying content (e.g. OOXML element IDs). Duplicate IDs in source content cause deduplication bugs that are invisible in every other viewer.
- **No native Web Worker path:** export and serialisation run on the main thread, blocking the UI.

HawkDoc uses [Lexical](https://lexical.dev) (Meta's editor framework, used in production across Facebook and Instagram). Lexical maintains a **virtual node tree** with its own internal node keys, entirely independent of source content IDs. The `pic:cNvPr id="0"` deduplication bug is structurally impossible in Lexical. Mutations are batched and only touch changed nodes, no full-tree serialisation on keystrokes.

This is not a claim that Lexical is better for every project. It is the right tradeoff for HawkDoc's specific goals.

---

## Features

### Working

- [x] Lexical editor with block types: H1, H2, H3, paragraph, bullet list, ordered list, code block, quote, divider
- [x] Slash `/` command menu with keyboard navigation
- [x] Formatting toolbar: Bold, Italic, Underline, Strikethrough, inline code, link
- [x] Floating bubble menu on text selection
- [x] Auto-save with 800ms debounce (localStorage)
- [x] Template variable injection: `{{variable_name}}` renders as a styled chip
- [x] PDF export with watermark (via the Export menu in the toolbar)
- [x] Markdown export
- [x] HTML export
- [x] Editable document title
- [x] Code block with copy-to-clipboard button

### Planned

- [ ] Real-time collaboration (Hocuspocus + Yjs)
- [ ] User auth (JWT)
- [ ] Document list and workspace
- [ ] DOCX import/export
- [ ] Version history
- [ ] Image upload support

---

## Project Status

HawkDoc is currently **MVP stage**. The core editor is functional but the API, collaboration layer, and DOCX pipeline are still being built.

The UI is intentionally minimal while I focus on performance, architecture, and template rendering. Design improvements will come later.

| Area | Status |
|---|---|
| Editor (Lexical) | Working |
| PDF export | Working |
| Markdown export | Working |
| HTML export | Working |
| Template variables | Working |
| Auto-save (localStorage) | Working |
| Backend API (Express) | Skeleton |
| Real-time collaboration (Yjs) | Planned |
| DOCX import/export | Planned |
| Auth (JWT) | Skeleton |

Early contributors and issue reporters are welcome. All PRs target the `dev` branch.

---

## Quick Start

```bash
git clone https://github.com/hawk-doc/hawkdoc.git
cd hawkdoc

# Start PostgreSQL and Redis
docker compose up -d

# Install dependencies and run
npm install
npm run dev
```

Frontend: `http://localhost:5173` - API: `http://localhost:3001`

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Tailwind CSS v3, Vite |
| Editor | Lexical (Meta) |
| Collaboration | Yjs + Hocuspocus |
| PDF Export | @react-pdf/renderer |
| Backend | Node.js 20, Express, TypeScript |
| Database | PostgreSQL 16 |
| Cache | Redis 7 |
| Auth | JWT |
| Validation | Zod |

---

## Contributing

Contributions of all kinds are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a PR. All PRs target the `dev` branch.

### Good First Issues

If you'd like to contribute but don't know where to start, look for issues labeled [`good first issue`](https://github.com/hawk-doc/hawkdoc/issues?q=label%3A%22good+first+issue%22).

Examples of open areas:

- Improve toolbar accessibility (ARIA labels, keyboard focus)
- Add keyboard shortcut documentation
- Improve template variable chip styling
- Add dark mode support

---

HawkDoc is inspired by real production issues encountered while integrating document editors into reporting systems.

---

## License

MIT © HawkDoc Contributors
