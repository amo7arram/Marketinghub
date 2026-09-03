# Feature Inventory

**Last updated:** August 2026

The complete, current feature set, organized by which file/role it lives in. This is the single answer to "what does this system actually do" — use it instead of reconstructing the answer from chat history.

---

## Public Portal (`index.html`) — no login required*

*unless the Public Access Gate is enabled in admin Settings.

- **Dashboard** — period-navigable (last 3 months) KPI overview: social media performance (synced from Metricool, with month-over-month trend arrows), **Marketing Output** (quantified deliverable counts — Videos/Social Posts/Events/Print/Website Updates — for the selected month; see `deliverableTypeFor()` in `index.html` for exactly what counts), leads-by-department breakdown, activity-by-department-or-entity breakdown (toggle between the two; click a segment or legend entry for a per-deliverable-type breakdown of that department/entity, reusing the same shared detail panel used for campaign/event rows), this-month campaign/health-day list (shows a real thumbnail of the published post where Metricool has a match — see `initiatives.socialImageUrl` in `docs/DATA_MODEL.md` — falling back to a plain department-colored dot otherwise; click any campaign/event row to open the shared detail panel, which shows the same image full-size at the top when present), featured initiatives
- **SM Analytics** — per-network (Instagram/TikTok/LinkedIn/X) stat tiles with trend deltas, plus a full-history trend chart per network, all synced from Metricool
- **SM Calendar** — grid and full table view of scheduled social content and physician videos, filterable by department/entity/channel, click-through to full detail (captions, headline, assets)
- **Promotions Calendar** — active/upcoming promotions with pricing and discount %
- **Well-span Program** — wellness packages plus any promotion flagged `isWellspan`
- **Loyalty Program** — loyalty card tiers and benefits
- **Business Development** — BD activity feed plus initiatives flagged `featuredBD`, with YTD KPI progress against BD targets
- **Leads & Attribution** — aggregated (no-PII) lead funnel: total/reached/unreached/missed/booked, monthly trend, department & entity breakdowns, per-campaign CPL/CPA/ROI table. A "🔒 View Individual Leads (Agent Access)" link at the top opens `call-center.html` in a new tab — this page never reads raw lead records itself (see the PII boundary in `docs/ARCHITECTURE.md` §4), the link only points to where they're actually protected by that page's own agent/admin login gate
- **All Campaigns / Events / Dept Campaigns / Health Days / Content Library / Print Materials** — browsable, filterable views of the initiatives collection sliced different ways
- **Brand Resources** — downloadable brand assets
- **Team Tools (sidebar)** — a "📝 Submit a Request ↗" link to `request.html`, opened in a new tab

---

## Admin Panel (`admin.html`) — `role: admin` only

### Activities (formerly "Initiatives")
- Create/edit/delete any activity type: Campaign, Event, SM Content, Print, Website Update, Physician Video
- Two-tier type selector: choose "Single Activity" vs "📦 Campaign" first, then the specific subtype
- Campaign-type records act as containers — the table shows them as a badge with a child count; clicking drills into a panel listing every linked activity (add/edit/remove children from there)
- Any single activity can optionally link to a parent campaign via a dropdown
- Per-type conditional fields (Event Scope, Website Update Type + Link, Physician Name, Print Type, Content Type)
- AI Caption Generator — per-activity, generates bilingual (EN/AR) captions + on-image headline from the activity's own brief, respecting the saved Brand Voice
- Validation: a `Published` activity with a caption-bearing type must have a Post Link before it can be saved
- Filters: type, department, entity, status, search

### Campaign Generator
- One campaign-level brief → generates a **full content suite** in one AI call: multiple social posts (dates auto-spread across the campaign window), plus copy for any selected print formats (Flyer, Backdrop/Rollup, Brochure, Sticker, Booklet, Countertop, Signage)
- Review screen — every generated piece editable/removable before saving
- On save: creates one parent Campaign + one child activity per approved piece, correctly linked via `parentCampaignId`

### AI Reports
- Generates a board-ready monthly executive report: admin picks a report month, an optional department focus (auto-selects the most active departments if left blank), and writes a free-text board brief (priorities, context the data can't infer, specific questions to address) — the brief steers the report's emphasis rather than a fixed template
- One AI call (`claude-opus-5`, the one place in the app where output quality is prioritized over cost) turns real, pre-computed data into narrative: Executive Summary, per-department highlights (with real screenshots pulled from actual published social posts, matched to the department's own initiatives via `postLink`), KPI Performance vs. last month and vs. annual goal, Spend, Competitive Positioning (IMC vs. named competitors tracked in Metricool), Strategic Insights & Recommended Actions, and a Directional Outlook explicitly labeled as qualitative commentary, not a statistical forecast
- **Every number is computed in JavaScript before the AI call and rendered straight from that data — never round-tripped through the model** — so the report's KPI table can never disagree with the live public BD KPI Progress tracker; Claude supplies narrative and judgment only (including which real post images to feature), never arithmetic
- **Nothing is saved.** Purely ephemeral — the "🖨️ Download (Print to PDF)" button uses the browser's own print dialog against a dedicated print stylesheet; re-generating or navigating away discards the report
- Degrades gracefully: a report still generates with no images/competitor section if Metricool isn't connected, and any individual failed sub-fetch (one competitor network, the post-media call) is noted in a "Data Completeness" footer rather than failing the whole report

### Business Development
- BD card CRUD (partnerships, outreach activities)
- Annual KPI targets (views, impressions, engagements, website visitors, leads, bookings) — actuals computed live: Views/Impressions/Engagements from `config/metricool_stats`, Leads/Bookings from the real `leads` collection via `config/lead_stats`, Website Visitors from a manual monthly entry (the only figure still without an automated source — see Dashboard Metrics below)

### Well-span / Loyalty
- Package and loyalty card CRUD, shown on the corresponding public pages

### Landing Pages
- Build lead-capture pages entirely from the admin: Title, Slug (auto-generated from Title, editable until first save, then locked so a live campaign URL is never silently broken), Headline, Subheadline, Body Content, optional Hero Image URL (pasted link — no file upload exists anywhere in this app), CTA Button Text, linked Campaign (for attribution), Department, Entity, and a Draft/Published status
- **Body Content accepts pasted HTML**, not just plain text — tables, formatting, links, content copied from an externally-built page all work. A live preview panel in the admin form shows exactly what will render publicly, since the content is sanitized (via DOMPurify) before ever reaching a visitor — `<script>` tags, event handlers, and unsafe URLs are stripped, everything else (including inline styles) passes through
- **Custom post-submission behavior, per page**: an optional Thank You Message (overrides the generic default) and an optional Redirect URL — if set, the visitor is sent straight there after submitting (e.g. a booking page or WhatsApp link) instead of ever seeing an inline thank-you message
- Each page is instantly live at a stable public URL (`landing.html?slug=<id>`) once Published — no developer/code change needed per page. One reusable template reads its content from Firestore by slug; a Draft page has no working public URL and is unreachable even by direct slug guess (enforced by the Firestore rule, not just the UI)
- Submissions write straight into the same `leads` collection as everything else (source: "Landing Page"), so they immediately show up in the Leads CRM, can be assigned to agents, and count in attribution — no separate inbox to check
- Submission count shown per page (live-computed from `leads`, never stored) — click through to jump to the Leads CRM pre-filtered to that page's leads
- "🔗 Copy Link" — copies the public URL once Published

### Leads CRM
- Two-dimension status tracking: Contact Status (Untouched/Reached/Unreached/Missed) + Outcome (Pending/Open File/Follow-up Scheduled/Booked/Wrong Number/Already a Patient/Closed-Unsuccessful, only active once Reached)
- **Closure Reason** — a second, conditional dropdown shown only when Outcome is Closed - Unsuccessful, capturing *why* (Not Interested, Price/Insurance Objection, Went Elsewhere, Wrong Department/Specialty, Unable to Reach After Multiple Attempts, Other). Cleared automatically if Outcome moves away from Closed - Unsuccessful.
- **Booked lock** — once Outcome is Booked, changing Contact Status/Outcome (inline, the edit modal, or bulk edit) requires confirming first, since it can affect reported revenue numbers elsewhere in the app
- Inline status editing directly in the table
- **Lead assignment** — assign a lead to any team member with real login access, via a row-level "Assign" button or in bulk via Bulk Edit; assigned agent shown in its own column. Drives Contact Center Control's default "My Leads" filter for that agent.
- **Agent filter** — filter the leads table (and thus "Select All") to one agent's leads, or to unassigned leads — the direct way to bulk-act on a specific agent's queue.
- **Agent Performance panel** — collapsible breakdown, one row per team member with login access (plus an Unassigned row when relevant): total assigned, Untouched/Reached/Unreached/Missed counts, Booked count, and a "% Contacted" figure. Click a row to jump straight to that agent's filtered leads table.
- **Bulk Edit** — Department/Entity/Contact Status/Outcome/Date, plus Campaign (bulk-attach leads to a campaign) and Assign to Agent, applied only to fields explicitly set
- **Campaign script popover** — clicking a lead's Campaign cell (when linked) shows that campaign's Agent Script (calling context, edited on the campaign record) and Post Link, if set
- **WhatsApp / click-to-call** — icon links per lead (`wa.me`/`tel:`), using the lead's normalized phone number
- **Email** — optional field, shown in the table and the manual Add/Edit modal; every landing-page-captured lead has one, most others don't (not yet part of Excel/Sheet import column-detection)
- **Excel export** — Export Selected (from a bulk selection) or Export Filtered (whatever the current filters produce), reusing the same XLSX library used for import
- **Phone number normalization** — all phone writes (manual entry, Excel import, Sheet import) unify to bare-digits international format; a one-time "☎ Normalize Phone Numbers" migration button (with a before/after preview) backfills existing records
- Excel upload with automatic column detection (name/phone/department/entity/source/campaign/date/status/notes), department fuzzy-matching, and a campaign-attribution picker. Deduplicates by phone+campaign combination (not phone alone) against existing leads — recomputed live as the campaign dropdown changes, since that's the only input the dedupe key depends on that isn't fixed at parse time; duplicate rows are shown dimmed in the preview and skipped on import, with the skip count called out
- **Google Sheet live import** — paste a link (or auto-fill from a campaign's saved sheet URL), fetch, preview, import. Deduplicates by phone+campaign combination (not phone alone), so the same person can correctly appear under multiple campaigns as separate interactions
- Contact History — opening any lead shows every other lead record sharing that phone number (date, campaign, status, outcome)
- Revenue Value field per lead, feeding campaign ROI
- Bulk delete
- One-time migration tool for legacy single-field statuses
- Pagination (50/page)
- **"📋 Process Reference"** link to `docs/lead-management-process.html`, the end-to-end lead management process diagram

### Budget
- Annual budget vs. spend tracking, combining `expenses` and `initiatives.cost`

### Requests
- Review requests submitted via `request.html`: filter by department/type/status, sort by submission date
- **Accept** — optionally link the request to a real Activity: either auto-create one now (title/department pre-filled from the request) or link to an existing one, via the exact same mechanism as Marketing Actions below. Linking is optional at Accept time — an admin can accept first and link later via "Edit Link"
- **Reject** — requires a reason (from a fixed list: Insufficient Detail, Outside Marketing Scope, Duplicate Request, Budget Not Available, Lower Priority, Already Covered by Existing Campaign, Other) plus an optional note. Both are shown back to the coordinator
- A rejected request can later be Accepted (and vice versa) if the decision changes
- **"↻ Migrate Legacy Request Status"** — one-time button converting requests created before this workflow existed (which only had a boolean "done") into the new Pending/Accepted status

### Marketing Actions
- CRUD for action items agreed between executive leadership and marketing in meetings — title, description, accountable person (free text, not a team-member lookup), date agreed, meeting context, deadline, status (`Not Started`/`In Progress`/`Blocked`/`Completed`)
- **Overdue is computed live** (past deadline + not Completed), never stored — shown as a red row + "⚠ Overdue" badge
- **Link to a real Activity** — either check "Create a new linked initiative now" (a small sub-form: title/type/department/status/start date — creates a real `initiatives` document immediately, findable right away in the normal Activities tab) or link to an initiative that already exists, via a searchable dropdown. Mutually exclusive with each other; an already-linked action shows its live title+status with an Unlink option
- Read-only, live view for executive leadership at **`actions.html`** (see below) — reuses the exact same login gate as `admin.html`, including the Magic Word

### Brand Resources
- CRUD for the public resource library

### Dashboard Metrics
- Social/performance numbers sync automatically from Metricool ("🔄 Sync Now") — Instagram reach/engagement rate/likes/comments/reel views/followers, TikTok views, LinkedIn impressions/followers, X followers
- Per-month manual override still available — edit any field and Save Month; that value is tagged and skipped by future syncs until cleared
- **Not covered by Metricool** (confirmed unavailable via their API, not just unconfigured): Instagram Conversations, X Reach/Impressions, TikTok engagement, SM Messages Received, PR Mentions, Website Visits — these no longer have any entry point in this tab
- **Website Visitors — manual monthly entry**, its own small section below the Metricool grid, saved together with the rest via the same "Save Month" button. Writes only the `Website Visits` metric to the legacy `metrics` collection (nothing else uses that collection anymore) — this is the one BD KPI target with no automated source anywhere, since Metricool doesn't do web analytics
- The public Business Development KPI Progress tracker (`index.html`) now sources every KPI from a live source except Website Visitors: Views/Impressions/Engagements from `config/metricool_stats`, Leads/Bookings from `config/lead_stats` (the real `leads` collection, not the old manually-typed `leadsGenerated`/`estimatedBookings` fields on initiatives/promotions/BD cards). See `docs/DATA_MODEL.md`'s `metrics` section for the coverage trade-offs this involved.
- Same "🔄 Sync Now" also matches every `Published` initiative's `postLink` against Metricool's own scheduled posts and writes a real matched image to `initiatives.socialImageUrl` where found (see `docs/DATA_MODEL.md`) — powers the public Dashboard's "this month" campaign thumbnails. Partial coverage by nature (only Metricool-scheduled content can match), never surfaced as an error.

### Settings
- **Entities** — add/remove business entities (blocked from deletion if still referenced anywhere)
- **Team Members** — directory + optional real login account creation (Admin / Agent / Coordinator role), using a secondary Firebase app instance so creating a user doesn't sign out the admin
- **Department Revenue Estimates** — per-department average revenue, used as an ROI fallback
- **Metricool Setup** — API token + brand/profile selection (via "Fetch My Profiles"), stored in `config/metricool_settings`; powers Dashboard Metrics syncing
- **Google Analytics** — a single GA4 Measurement ID, stored in `config/analytics_settings`, adds analytics to every Landing Page (page views + a "lead submitted" conversion event per page). Blank by default (no tracking); see the Landing Pages entry above and `docs/ARCHITECTURE.md` §4.6 for the consent-gating mechanism
- **Public Access Gate** — enable/disable + set the password gate on the public portal
- **Admin Login Passcode ("Magic Word")** — set a shared passcode as an alternative login path; changing it force-logs-out the current session
- **Brand Voice** — AI generation tone, formality, closing hashtag, CTA text, banned words — feeds every AI caption/content generation call system-wide

### Content Generator *(currently hidden from nav, code intact)*
- Single-activity AI caption generation, superseded in daily use by the fuller Campaign Generator

---

## Coordinator Request Form (`request.html`) — `role: coordinator` or `admin`

- Submit a marketing request: title, description, department, entity (multi-select), target audience, type, deadline, priority, and an optional reference link (a Drive link/brand asset in lieu of emailing an attachment)
- Daily submission limit enforced per requester
- **"My Requests"** — a second view (toggle at the top, no separate page/login) showing every request this coordinator has ever submitted and its live status: Pending, Accepted (with the linked Activity's live title+status, if one was created or linked), or Rejected (with the reason and any note the admin gave). Read-only — imports no write-capable functions, same discipline as `actions.html`
- No access to any other part of the system
- **Role-checked login gate** (fixed during the pre-rollout permissions review — this page previously accepted *any* authenticated Firebase account with no role check at all): rejects and signs back out any account that isn't `coordinator` or `admin`, matching the same pattern already used by `admin.html`/`call-center.html`/`actions.html`. See `docs/ARCHITECTURE.md` §4.1.

---

## Contact Center Control (`call-center.html`) — `role: agent` or `admin`

Tab-based: **Leads** and **Promotions**. (A third Inbox tab — social media messages via Metricool — was investigated but skipped: every Metricool Inbox endpoint returns 401 for this account, pointing to Inbox not being enabled on the Metricool plan, not a code issue.)

### Leads tab
- **My Leads / All Leads** — defaults to leads assigned to the logged-in agent (`assignedAgentUid`); admins default to All Leads. A filter toggle switches between the two — not a hard access boundary, just the default view. Assigned-agent shown read-only.
- Search, filter by status/outcome/department
- Inline edit: Contact Status, Outcome, and a conditional Closure Reason (same as admin.html)
- **Booked lock, no override** — once Outcome is Booked, Contact Status/Outcome render as static badges instead of editable dropdowns; agents cannot change them at all (admin.html allows an admin override with confirmation, this page doesn't)
- Edit modal: Name, Phone (normalized on save), Notes, Revenue Value
- **Campaign script popover** — same as admin.html, read-only
- **WhatsApp / click-to-call** — same icon links as admin.html
- **Cannot:** delete leads, bulk-edit, import (Excel or Sheet), add new leads, reassign a lead to a different agent, or reassign Department/Entity/Campaign
- Deliberately excludes campaign cost/budget data from view

### Promotions tab
- Read-only card grid of promotions (title, discount %, price, department/entity tags, Active/Upcoming/Expired status), filterable — lets agents reference current offers while on a call

### Both tabs
- **"📋 Process Reference"** link (topbar) to `docs/lead-management-process.html`

---

## Marketing Actions — Leadership View (`actions.html`) — `role: admin` only, read-only

A live, read-only dashboard for executive leadership to track marketing action items agreed in meetings — no add/edit/delete controls anywhere on this page, enforced both in the UI and by which functions the page imports from `firebase-data.js` at all.

- Login gate is a byte-for-byte copy of `admin.html`'s own dual-mode gate (password or the same Magic Word passcode) — this page shares `admin.html`'s exact `role==='admin'` session rather than getting a new, narrower role. See `ARCHITECTURE.md` §4.4 for the access-model tradeoff this accepts.
- Summary strip up top: total actions, and an overdue count that turns the whole strip red the moment anything is late — meant to answer "are we on track" in the first second, before reading the table.
- Table sorted **overdue-first, then by ascending deadline** — nothing needs filtering to surface what's late.
- Each row's linked initiative (if any) shows its **live** current title + status, not a stale snapshot — both this page and `admin.html` read the same real-time `initiatives` data, so a status change made in `admin.html` appears here immediately, no refresh needed.
- Filters: status, "Overdue only," free-text search — same as the admin-side management tab, for visual/behavioral consistency between the two views.

---

## Landing Pages (`landing.html`) — public, no login, first entry point with an unauthenticated write

One reusable template serving every landing page an admin builds — the URL is `landing.html?slug=<id>`, resolved by fetching the matching `landing_pages` document (see `docs/DATA_MODEL.md`). No login anywhere on this page, matching `index.html`'s public model.

- Renders hero image (if set) / headline / subheadline / body content / CTA button text from the fetched page, then a form: Name (required), Phone (required), Email (**optional**), Comment (optional, lands in `leads.notes`). Body content is sanitized (DOMPurify) before rendering — see the Landing Pages admin section above
- **Bilingual form** — every field label, the form title ("Fill the form to receive a call"), and the scroll nudges are shown in English and Arabic together (IBM Plex Sans Arabic, RTL)
- **Scroll-to-form nudges, for long pages**: a static banner near the top ("📝 Fill the form below to get started") plus a floating "Fill the Form ↓" bar that only appears once the form has actually scrolled out of view — both jump straight to the form on click/tap
- A missing slug, a slug that never existed, and a Draft page's slug all render the exact same generic "This page is no longer available" message — deliberately uniform so a slug can never be enumerated by trial and error
- **Anti-spam**: a honeypot field invisible to real visitors (a bot that blindly fills every field on the page fills this one too) plus a minimum ~2-second delay between page load and submission — both cases silently pretend success without writing anything, and follow the *exact same* post-submission behavior (custom message or redirect) as a genuine submission, so a bot can't distinguish caught-vs-real by comparing behavior. This is a real but client-side-only deterrent, not a hard boundary — see `docs/ARCHITECTURE.md` §4.6 for the honest limit of what it can and can't stop
- A genuine submission writes straight into the `leads` collection (`source: "Landing Page"`) via this app's **first unauthenticated Firestore write path** — narrowly scoped by a field-whitelisted, fixed-status Firestore rule (see `docs/ARCHITECTURE.md` §4.6) — so it shows up immediately in the Leads CRM like any other lead
- After submitting, the visitor either sees that page's custom Thank You Message (or a generic default) or is redirected to that page's Redirect URL, per how the admin configured it
- Never imports anything beyond `getLandingPageBySlug`/`addLead`/`normalizePhone`/`getAnalyticsSettings` — no read access to the `leads` collection at all, and no write access to anything else
- Footer links to IMC's real Terms & Conditions and Privacy Policy & Cookie Notice pages (`imc.med.sa`), plus the full address/website/working hours
- **Google Analytics, off by default, consent-gated**: if an admin has configured a Measurement ID (Settings → Google Analytics), a cookie-consent banner appears on first visit (per browser, remembered via `localStorage`) linking to the Privacy Policy; GA only loads after Accept. A `generate_lead` event (page slug, campaign, department — never name/email/phone) fires only on a genuine successful submission, not on a spam-caught one

---

## Shared / Cross-Cutting Features

- **Role-based routing** — each HTML file independently checks Firebase Auth + the `roles` collection; unauthorized users are logged out immediately with an explanation
- **AI content generation** — powered by a direct browser call to the Anthropic API, governed by the saved Brand Voice settings, used by both the per-activity generator and the Campaign Generator
- **Real-time sync** — nearly all data uses Firestore's live listeners, so multiple admins see each other's changes without refreshing
