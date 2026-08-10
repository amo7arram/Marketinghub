# CLAUDE.md

This file is read automatically by Claude Code at the start of every session in this repo. It exists so you don't have to re-explain this project from scratch each time.

---

## What this is

IMC Marketing & Business Development Hub — an internal marketing operations platform for a Saudi private healthcare group. Full context lives in `/docs/`:

- `docs/ARCHITECTURE.md` — tech stack, file structure, security model, known limitations
- `docs/DATA_MODEL.md` — every Firestore collection and field, fully documented
- `docs/FEATURES.md` — complete feature inventory by user role
- `docs/ROADMAP.md` — technical debt, the ES module split plan, SaaS migration considerations

**Read these before making non-trivial changes.** They are the source of truth, not any individual past conversation.

---

## Critical facts about this codebase

- **No backend.** Static files on GitHub Pages, talking directly to Firebase Firestore + Firebase Auth. No build step, no bundler. `<script type="module">` loads ES modules natively in the browser.
- **`firebase-data.js` is the single shared data layer.** Every other file imports from it. Never duplicate a Firestore query or write elsewhere — add it to `firebase-data.js` and import it.
- **Four separate HTML entry points, each its own login gate:** `admin.html` (role: admin), `call-center.html` (role: agent or admin), `request.html` (role: coordinator or admin), `index.html` (public, no login by default). This separation is deliberate — don't merge them.
- **`admin.html` and `index.html` are large single files** (~4,700 and ~2,000+ lines respectively). An ES module split is planned (`docs/ROADMAP.md` §Priority 2) but not yet started — treat this as the standing context for why edits need extra care until that's done.

---

## Hard-won lessons — follow these without exception

This project has hit the same handful of bugs repeatedly during earlier development in Claude.ai (before this repo moved to Claude Code). Each rule below exists because of a real incident, not a hypothetical:

1. **Always `view` a file immediately before editing it, every time — never rely on a view from earlier in the session.** A prior edit changes line numbers and surrounding context; editing from a stale view causes silent mismatches.
2. **When using a comment/anchor line as the boundary of an edit, always re-include that comment in the replacement.** This exact mistake — using `// ── SECTION NAME` as an anchor and forgetting to include it in the new text — deleted section header comments multiple times during this project's build and had to be manually restored each time.
3. **After any change to `firebase-data.js`, cross-check every file that imports from it.** Confirm every imported name still has a matching `export` in `firebase-data.js`. A single missing export causes the *entire* importing module to fail silently — no error shown to the user, nothing in the UI, just total non-function. This exact failure mode caused a real "admin login isn't working" incident.
4. **Run a syntax check on every changed HTML file's inline module script before considering a change complete.** Extract the `<script type="module">` contents and run them through Node's `--check` flag (strip the Firebase import line first, since Node can't resolve the CDN URL — that's fine, it only needs to validate syntax, not resolve imports).
5. **Never use `orderBy()` in a Firestore query in this codebase.** Every collection here sorts client-side in JavaScript after fetching, specifically to avoid Firestore's composite index requirement — a query using `orderBy` on a field with no existing index fails silently with no error surfaced to the UI, and this has caused multiple "why is this page stuck on Loading forever" incidents. If you see `orderBy` anywhere, treat it as a bug to fix, not a pattern to extend.
6. **Firestore writes to a *new* document ID must use `setDoc`, not `updateDoc` with a fallback to `addDoc`.** The old pattern (`updateDoc(...).catch(() => addDoc(...))`) creates a random auto-generated ID on every failed update, meaning every repeat save of the same logical record creates a new duplicate document instead of updating the original. This caused a real data-corruption incident in the metrics collection. Always compute a deterministic document ID and `setDoc` directly.
7. **Public-facing pages must never read PII-bearing collections directly**, even if only displaying aggregates in the UI — the underlying Firestore rule would still expose raw data to anyone inspecting network requests. Compute aggregates in `admin.html`, write them to a separate public-readable `config` document, and have public pages read *that*. See the `leads` → `config/lead_stats` pattern in `docs/DATA_MODEL.md` as the reference implementation.
8. **Keep `docs/DATA_MODEL.md` and `docs/FEATURES.md` in sync with every change.** A doc that's silently wrong is worse than no doc — update it in the same session as the code change, not as a follow-up.

---

## Deployment

There is no CI/CD. Changes are deployed by pushing to the `main` branch (or whichever branch GitHub Pages is configured to serve) — GitHub Pages picks it up automatically. There is no staging environment; every push is live. Be especially careful with changes to `firebase-data.js`, since every other file depends on it.

---

## Firestore security rules

Rules live in the Firebase Console, not in this repo (consider migrating them into a `firestore.rules` file in this repo for version control — currently a gap). Two patterns are used throughout:
- Public-readable collections: `allow read: if true; allow write: if request.auth != null;`
- Fully authenticated collections (PII, internal data): `allow read: if request.auth != null; allow write: if request.auth != null;`

The `roles` collection has a special rule restricting writes to existing admins only (see `docs/ARCHITECTURE.md` §4.1). Any new collection needs an explicit rule added before it will work — Firestore denies by default.
