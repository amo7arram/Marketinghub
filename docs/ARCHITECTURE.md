# IMC Marketing & Business Development Hub — Architecture

**Last updated:** August 2026
**Status:** Active internal tool, pre-SaaS. This document is the system's source of truth — treat it as more authoritative than any individual chat session that built a feature.

---

## 1. Purpose & Vision

An internal marketing operations platform for International Medical Center (IMC), a private healthcare group in Saudi Arabia (entities: IMC, Makkah, TFC, JP, RSM). It unifies campaign planning, content generation, lead management, budget tracking, and performance reporting for the marketing and business development team.

**Long-term direction (no fixed timeline):** eventually migrate to a real backend and evolve into a multi-tenant SaaS product for other healthcare marketing departments. Everything in this document should be read with that eventual destination in mind — where a decision was made for pragmatic/cost reasons that would need revisiting for SaaS, it's flagged explicitly.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Hosting | GitHub Pages (static files only, no server) |
| Database | Firebase Firestore (NoSQL document store) |
| Auth | Firebase Authentication (email/password) |
| Frontend | Vanilla JavaScript, ES modules, no framework, no build step |
| Styling | Hand-written CSS per file, no CSS framework |
| Charts | Chart.js (CDN) |
| Excel parsing | SheetJS/XLSX (CDN) |
| AI generation | Anthropic API, called directly from the browser |

**No backend server exists.** Every piece of logic — validation, permissions, aggregation, AI calls — runs client-side in the browser or is enforced by Firestore Security Rules. This is the single most important architectural fact about the system and the primary thing that would change in a SaaS rebuild.

---

## 3. File Structure

```
/
├── firebase-data.js       Shared data layer — ALL Firestore reads/writes, ALL Firebase Auth calls,
│                          ALL shared constants. Every other file imports from this one.
├── admin.html             Full admin panel — internal marketing team, role="admin" only
├── index.html             Public-facing portal — no login required (unless Access Gate is enabled)
├── request.html           Minimal request-submission form — role="coordinator" or "admin"
├── call-center.html       Minimal leads-only view — role="agent" or "admin"
├── inject-promotions.html One-time seed script for the 2026 promotions plan (should be deleted
│                          from the live repo after use — it's a dev tool, not a product surface)
├── logo.jpg               Shared logo asset
└── docs/                  This documentation set
```

**Why this file split exists:** rather than one giant app with client-side routing and permission checks, each *role* gets its own physically separate HTML file with its own login gate. A coordinator or agent literally cannot load code for features they shouldn't see — the browser never downloads `admin.html`'s JavaScript for them. This is a deliberate, low-tech security boundary that's more robust than a single-page app with hidden UI, precisely because there's no backend to enforce anything else.

**The cost of this approach:** significant code duplication. Login screens, toast notifications, and Firestore query patterns are re-implemented per file rather than shared as components. `admin.html` alone has grown to roughly 4,700+ lines. This is the primary driver behind the ES module split proposed in `ROADMAP.md`.

---

## 4. Security Model

### 4.1 Roles

Stored in the `roles` Firestore collection, keyed by Firebase Auth UID:

| Role | Access |
|---|---|
| `admin` | Full access — `admin.html`, `call-center.html`, `request.html` |
| `agent` | `call-center.html` only — view/update leads, no delete, no reassignment |
| `coordinator` | `request.html` only — submit marketing requests, nothing else |

A user with **no** role document is treated as unauthorized everywhere, even if they have a valid Firebase Auth login. Creating a Firebase Auth account does not grant any access by itself — the `roles` document is the actual gate.

### 4.2 Firestore Rules Pattern

Every collection follows one of two patterns:

- **Public read, authenticated write:** `allow read: if true; allow write: if request.auth != null;` — used for anything the public portal needs to display (initiatives, promotions, entities, health days, BD cards, wellspan packages, loyalty cards).
- **Authenticated read and write:** `allow read: if request.auth != null; allow write: if request.auth != null;` — used for anything containing PII or internal-only data (leads, requests, expenses, team members).

`roles` itself has a special rule: only an existing admin can write a new role document (checked via a Firestore rule that reads the requester's own role before allowing the write), preventing privilege escalation.

### 4.3 Team Member Account Creation

Real Firebase Auth accounts are created **client-side**, using a secondary Firebase app instance (`initializeApp(config, "secondary-<timestamp>")`) so creating a new user doesn't sign out the admin performing the action. This is a legitimate, documented Firebase pattern for client-only apps without a backend — but it means the API key and this creation logic are visible to anyone with admin-level browser access. Acceptable for a small trusted internal team; **not** acceptable at SaaS scale, where this must move to a server-side Admin SDK call.

### 4.4 The "Magic Word" Passcode

A parallel, temporary login path on `admin.html` — entering a shared passcode triggers a **real** Firebase Auth login behind the scenes using one designated account's credentials. This does not weaken Firestore security (the same real auth session is established either way), but it does mean anyone who knows the passcode effectively logs in *as* that one account. This was built as a convenience for a transitional period and should be revisited (or removed) before broader team rollout.

### 4.5 Public Access Gate

A separate, client-side-only password gate can be enabled on `index.html` (the public portal). This is explicitly a **deterrent**, not real security — since `index.html` is a static file with no backend, a technically determined visitor could bypass it. It exists to stop casual browsing and search engine indexing, not to protect genuinely sensitive data.

---

## 5. Data Flow

1. Each HTML file imports functions from `firebase-data.js` (e.g. `watchLeads`, `addInitiative`).
2. Most data is loaded via Firestore's `onSnapshot` real-time listeners, not one-time fetches — so the UI updates live if data changes elsewhere (e.g. two admins working simultaneously).
3. State lives in plain JavaScript variables at module scope (e.g. `let ALL_LEADS = []`), reassigned whenever the listener fires, and every render function reads from that shared state.
4. There is no centralized state management (no Redux/Zustand equivalent) — each page hand-wires which render functions need to re-run when which piece of state changes. This is the second largest source of the bugs we've hit (a watcher updates state but forgets to trigger a re-render that depends on it).
5. **Public aggregate data pattern:** for the Leads & Attribution dashboard, individual lead records (containing PII) are never exposed to the public portal. Instead, `admin.html` computes an aggregated, anonymized snapshot (`computeAndPublishLeadStats()`) and writes it to a separate `config/lead_stats` document, which *is* public-readable. This enforces the privacy boundary at the database rules level, not just in the UI — the correct way to do this in a system without a real backend.

---

## 6. Known Architectural Limitations (Honest Assessment)

These are the tradeoffs made to ship a capable system with zero server infrastructure and one person maintaining it. They are acceptable for the current internal-tool stage and would need to be addressed before any SaaS conversion:

- **No automated tests.** Every change is verified by manual clicking. At current size, this is a real regression risk — we've had several incidents (duplicate Firestore documents from a broken save function, an accidentally-deleted code comment breaking a save flow, a login screen silently failing) that a basic test suite would have caught before deployment.
- **No CI/CD, no staging environment.** Every file upload goes straight to the live production site used by real staff. There is no environment to test changes against real data before they're live.
- **No backend means no real enforcement layer.** Firestore Security Rules are a reasonable substitute for an API's authorization layer, but they're declarative and easy to get subtly wrong (as happened once this project — a rules update broke login until corrected). A real backend would centralize this logic in one place instead of duplicating assumptions across rules and client code.
- **Single-file bloat.** `admin.html` and `index.html` have each grown past 2,000–4,700 lines as more features were added. This makes the codebase harder to navigate, increases the chance that an edit accidentally clobbers unrelated code, and is the direct cause of several bugs introduced during this project's iterative development.
- **Reactive, not upfront, data modeling.** The data model (see `DATA_MODEL.md`) evolved feature-by-feature rather than being designed as a whole in advance. This is normal for MVP-stage software but means some fields exist for backward compatibility with earlier versions of a feature (e.g. `hdCategory` on old health day initiatives, now superseded by the standalone `health_days` collection).
- **Client-side AI API key exposure.** The Anthropic API key is stored in Firestore and used directly from the browser. Anyone with admin login and developer tools open can see it in network requests. Acceptable for a small trusted team; not acceptable at scale.

None of these are hidden or accidental — they are the direct, reasonable consequence of building a fully-featured system with no budget for backend infrastructure. See `ROADMAP.md` for the path to addressing each one.
