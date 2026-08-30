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
| HTML sanitization | DOMPurify (CDN) — used only for `landing_pages.bodyText`, see §4.6 |
| AI generation | Anthropic API, called directly from the browser |
| Metricool CORS proxy | One Cloudflare Worker — the sole exception to "no backend," see below |

**No backend server exists**, with one narrow exception. Every piece of logic — validation, permissions, aggregation, AI calls — runs client-side in the browser or is enforced by Firestore Security Rules. This is the single most important architectural fact about the system and the primary thing that would change in a SaaS rebuild.

**The one exception: a Cloudflare Worker CORS proxy for Metricool.** Metricool's API sends no `Access-Control-Allow-*` headers at all (confirmed live, not assumed), so `admin.html`'s browser-side `fetch()` calls to it are blocked by CORS with no workaround possible from a pure static site. A minimal, stateless Worker forwards the request to Metricool with the same headers and adds CORS headers to the response — it never stores the API token, which flows through exactly as supplied. Chosen over a public CORS proxy (token would transit a third party) or a Firebase Cloud Function (requires the paid Blaze plan). Source is versioned at [`cloudflare-worker-metricool-proxy.js`](../cloudflare-worker-metricool-proxy.js) in the repo root — **not auto-deployed**, same manual-sync caveat as `firestore.rules` (§4.2): whenever that file changes, the updated code must be pasted into the live Worker by hand via the Cloudflare dashboard. `admin.html`'s `METRICOOL_API_BASE` constant points at the Worker's URL.

The Worker only forwards requests whose `Origin` (or, as a fallback, `Referer`) matches the live site's origin — real incident: a user on a restricted corporate network had every single Metricool sync call fail identically, traced to that network stripping the `Origin` header from outgoing requests before Cloudflare ever saw it. The `Referer` fallback exists specifically for that case.

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
├── actions.html           Read-only Marketing Actions view for executive leadership — reuses
│                          admin.html's exact role="admin" session (Magic Word included), not a
│                          new role; the one deliberate exception to the isolation described below
│                          (see §4.4)
├── landing.html           Public, no login, one reusable template for every admin-built landing
│                          page (content fetched by slug from `landing_pages`) — see §4.6 for its
│                          unauthenticated-write exception
├── logo.jpg               Shared logo asset
└── docs/                  This documentation set
```

**Why this file split exists:** rather than one giant app with client-side routing and permission checks, each *role* gets its own physically separate HTML file with its own login gate. A coordinator or agent literally cannot load code for features they shouldn't see — the browser never downloads `admin.html`'s JavaScript for them. This is a deliberate, low-tech security boundary that's more robust than a single-page app with hidden UI, precisely because there's no backend to enforce anything else. `actions.html` is a documented exception to this isolation, not an oversight — see §4.4.

**The cost of this approach:** significant code duplication. Login screens, toast notifications, and Firestore query patterns are re-implemented per file rather than shared as components. `admin.html` alone has grown to roughly 4,700+ lines. This is the primary driver behind the ES module split proposed in `ROADMAP.md`.

---

## 4. Security Model

### 4.1 Roles

Stored in the `roles` Firestore collection, keyed by Firebase Auth UID:

| Role | Access |
|---|---|
| `admin` | Full access — `admin.html`, `call-center.html`, `request.html`, and `actions.html` (same login gate, same session — see §4.4) |
| `agent` | `call-center.html` only — view/update leads, no delete, no reassignment |
| `coordinator` | `request.html` only — submit marketing requests, nothing else |

A user with **no** role document is treated as unauthorized everywhere, even if they have a valid Firebase Auth login. Creating a Firebase Auth account does not grant any access by itself — the `roles` document is the actual gate.

**This was only true in principle until a pre-rollout access review caught the gap:** `request.html`'s login gate checked `if(user)` only — no `getUserRole()` call at all — so any authenticated Firebase account (an agent, or one with no role document whatsoever) could sign in and submit requests, contradicting the "no role = unauthorized everywhere" rule stated above. Fixed to match `admin.html`/`call-center.html`'s pattern exactly (reject and sign back out unless `role === 'coordinator' || role === 'admin'`). Worth this specific callout since it's the kind of gap that's invisible until someone actually reads the login-gate code file by file — a good justification for the same review before every future rollout of a login-gated page, not just this one.

### 4.2 Firestore Rules Pattern

Every collection follows one of two patterns:

- **Public read, authenticated write:** `allow read: if true; allow write: if request.auth != null;` — used for anything the public portal needs to display (initiatives, promotions, entities, health days, BD cards, wellspan packages, loyalty cards).
- **Authenticated read and write:** `allow read: if request.auth != null; allow write: if request.auth != null;` — used for anything containing PII or internal-only data (leads, requests, expenses, team members).

`roles` itself has a special rule: only an existing admin can write a new role document (checked via a Firestore rule that reads the requester's own role before allowing the write), preventing privilege escalation.

The `config` collection is the one exception to "one rule per collection" — it holds several unrelated single documents (see `DATA_MODEL.md`), each needing its own explicit per-document rule rather than one blanket collection rule. A blanket `config` rule caused a real incident: it silently exposed `ai_settings` (the Anthropic API key) and `admin_passcode` publicly, because Firestore rules are OR'd across every matching block — a broad `allow read: if true` on the collection wins over a narrower authenticated-only rule on the same document path. `admin_passcode` also has to stay genuinely public-read (it only ever stores a SHA-256 hash) since the Magic Word login flow reads it before the visitor is authenticated — that's the entire point of a passcode-based pre-auth path.

**Rules are now versioned in `firestore.rules` at the repo root**, with inline comments explaining each pattern and the reasoning above. This is the source of truth going forward — Firebase Console must be kept manually in sync with it (no CLI deploy is wired up for this repo), but at least changes are now diffable and reviewable instead of living invisibly in the Console only.

### 4.3 Team Member Account Creation

Real Firebase Auth accounts are created **client-side**, using a secondary Firebase app instance (`initializeApp(config, "secondary-<timestamp>")`) so creating a new user doesn't sign out the admin performing the action. This is a legitimate, documented Firebase pattern for client-only apps without a backend — but it means the API key and this creation logic are visible to anyone with admin-level browser access. Acceptable for a small trusted internal team; **not** acceptable at SaaS scale, where this must move to a server-side Admin SDK call.

### 4.4 The "Magic Word" Passcode

A parallel, temporary login path on `admin.html` — entering a shared passcode triggers a **real** Firebase Auth login behind the scenes using one designated account's credentials. This does not weaken Firestore security (the same real auth session is established either way), but it does mean anyone who knows the passcode effectively logs in *as* that one account. This was built as a convenience for a transitional period and should be revisited (or removed) before broader team rollout.

**Its reach widened deliberately with `actions.html`.** That page reuses this exact mechanism — same hardcoded account, same passcode, same code — so executive leadership can view the Marketing Actions tracker without a dedicated account. This was a conscious tradeoff, not an oversight: it means (a) anyone given the passcode "just for the leadership view" can, once logged in, also browse to `admin.html` directly and get full admin access (leads, budget, settings — everything), since the resulting Firebase Auth session isn't scoped to one page, and (b) the hardcoded credential constants now live in two files instead of one, so a future rotation has to touch both. Revisiting this (e.g. a second designated account with a narrower role, once role-based scoping is worth the added complexity) is a reasonable future improvement, not an urgent one.

### 4.5 Public Access Gate

A separate, client-side-only password gate can be enabled on `index.html` (the public portal). This is explicitly a **deterrent**, not real security — since `index.html` is a static file with no backend, a technically determined visitor could bypass it. It exists to stop casual browsing and search engine indexing, not to protect genuinely sensitive data.

### 4.6 Landing Pages — this app's first unauthenticated write

Every write in this app, until now, required a logged-in admin/agent/coordinator. `landing.html` breaks that: a landing-page visitor is nobody, not even a coordinator, so lead capture there cannot require auth. This is a genuine first for the security model and is called out explicitly rather than absorbed quietly into the existing rules.

**The exact boundary** (`firestore.rules`, `match /leads/{doc}`): an anonymous `create` is allowed only when the new document has `source == 'Landing Page'`, `contactStatus == 'Untouched'`, `outcome == 'Pending'`, a plausible `name`/`phone`, and **no fields outside a fixed whitelist**. This stops a scripted write from setting `outcome: 'Booked'`, `assignedAgentUid`, `revenueValue`, or any unexpected field — it cannot inject fake revenue or hijack an existing lead. No read access is granted at all; `landing.html` can create a lead, never see one. `landing_pages` itself follows the mirror pattern: an anonymous visitor may `get` exactly one `Published` page by its known slug, never `list` the collection, so Draft content stays invisible and a slug can't be discovered by browsing.

**What this boundary does *not* stop, stated honestly**: Firestore rules have no concept of rate-limiting or IP awareness, so nothing here prevents a scripted flood of well-formed fake leads — only a real backend (a Cloud Function checking request volume) could, and that's out of scope per this app's no-backend constraint. `landing.html`'s honeypot field and minimum-submit-delay check are a real deterrent against unsophisticated/automated bots, but they're enforced in the page's own JavaScript — a scripted attacker who bypasses that JS entirely and writes straight to Firestore via the SDK, staying inside the rule's field whitelist, is not stopped by them. This is the same "deterrent, not a hard boundary" tradeoff already accepted for the Public Access Gate (§4.5), stated with the same honesty here.

**A second, separate risk on this same page**: `landing_pages.bodyText` accepts raw admin-authored HTML (tables/formatting/pasted content), rendered on a genuinely public page every visitor loads. It's sanitized via DOMPurify at render time — `<script>` tags, event handlers, `javascript:` URLs are stripped before anything reaches the DOM — but sanitization only protects against *malicious* content, not *mistaken* content: an admin pasting HTML copied from an untrusted external source (a sketchy "free template" site, for instance) is the realistic threat model here, more than an attacker with admin credentials (who could already do damage elsewhere in the app). Review what you paste before publishing.

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
