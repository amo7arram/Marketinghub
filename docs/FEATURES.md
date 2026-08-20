# Feature Inventory

**Last updated:** August 2026

The complete, current feature set, organized by which file/role it lives in. This is the single answer to "what does this system actually do" — use it instead of reconstructing the answer from chat history.

---

## Public Portal (`index.html`) — no login required*

*unless the Public Access Gate is enabled in admin Settings.

- **Dashboard** — period-navigable (last 3 months) KPI overview: social media performance (synced from Metricool, with month-over-month trend arrows), department activity mix, leads-by-department breakdown, this-month campaign/health-day list, featured initiatives
- **SM Analytics** — per-network (Instagram/TikTok/LinkedIn/X) stat tiles with trend deltas, plus a full-history trend chart per network, all synced from Metricool
- **SM Calendar** — grid and full table view of scheduled social content and physician videos, filterable by department/entity/channel, click-through to full detail (captions, headline, assets)
- **Promotions Calendar** — active/upcoming promotions with pricing and discount %
- **Well-span Program** — wellness packages plus any promotion flagged `isWellspan`
- **Loyalty Program** — loyalty card tiers and benefits
- **Business Development** — BD activity feed plus initiatives flagged `featuredBD`, with YTD KPI progress against BD targets
- **Leads & Attribution** — aggregated (no-PII) lead funnel: total/reached/unreached/missed/booked, monthly trend, department & entity breakdowns, per-campaign CPL/CPA/ROI table
- **All Campaigns / Events / Dept Campaigns / Health Days / Content Library / Print Materials** — browsable, filterable views of the initiatives collection sliced different ways
- **Brand Resources** — downloadable brand assets

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

### Business Development
- BD card CRUD (partnerships, outreach activities)
- Annual KPI targets (views, impressions, engagements, website visitors, leads, bookings) — actuals computed live: Views/Impressions/Engagements from `config/metricool_stats`, Leads/Bookings from the real `leads` collection via `config/lead_stats`, Website Visitors from a manual monthly entry (the only figure still without an automated source — see Dashboard Metrics below)

### Well-span / Loyalty
- Package and loyalty card CRUD, shown on the corresponding public pages

### Leads CRM
- Two-dimension status tracking: Contact Status (Untouched/Reached/Unreached/Missed) + Outcome (Pending/Open File/Follow-up Scheduled/Booked/Wrong Number/Already a Patient/Closed-Unsuccessful, only active once Reached)
- **Closure Reason** — a second, conditional dropdown shown only when Outcome is Closed - Unsuccessful, capturing *why* (Not Interested, Price/Insurance Objection, Went Elsewhere, Wrong Department/Specialty, Unable to Reach After Multiple Attempts, Other). Cleared automatically if Outcome moves away from Closed - Unsuccessful.
- **Booked lock** — once Outcome is Booked, changing Contact Status/Outcome (inline, the edit modal, or bulk edit) requires confirming first, since it can affect reported revenue numbers elsewhere in the app
- Inline status editing directly in the table
- **Lead assignment** — assign a lead to any team member with real login access, via a row-level "Assign" button or in bulk via Bulk Edit; assigned agent shown in its own column. Drives Contact Center Control's default "My Leads" filter for that agent.
- **Bulk Edit** — Department/Entity/Contact Status/Outcome/Date, plus Campaign (bulk-attach leads to a campaign) and Assign to Agent, applied only to fields explicitly set
- **Campaign script popover** — clicking a lead's Campaign cell (when linked) shows that campaign's Agent Script (calling context, edited on the campaign record) and Post Link, if set
- **WhatsApp / click-to-call** — icon links per lead (`wa.me`/`tel:`), using the lead's normalized phone number
- **Excel export** — Export Selected (from a bulk selection) or Export Filtered (whatever the current filters produce), reusing the same XLSX library used for import
- **Phone number normalization** — all phone writes (manual entry, Excel import, Sheet import) unify to bare-digits international format; a one-time "☎ Normalize Phone Numbers" migration button (with a before/after preview) backfills existing records
- Excel upload with automatic column detection (name/phone/department/entity/source/campaign/date/status/notes), department fuzzy-matching, and a campaign-attribution picker
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
- View/manage requests submitted via `request.html`

### Brand Resources
- CRUD for the public resource library

### Dashboard Metrics
- Social/performance numbers sync automatically from Metricool ("🔄 Sync Now") — Instagram reach/engagement rate/likes/comments/reel views/followers, TikTok views, LinkedIn impressions/followers, X followers
- Per-month manual override still available — edit any field and Save Month; that value is tagged and skipped by future syncs until cleared
- **Not covered by Metricool** (confirmed unavailable via their API, not just unconfigured): Instagram Conversations, X Reach/Impressions, TikTok engagement, SM Messages Received, PR Mentions, Website Visits — these no longer have any entry point in this tab
- **Website Visitors — manual monthly entry**, its own small section below the Metricool grid, saved together with the rest via the same "Save Month" button. Writes only the `Website Visits` metric to the legacy `metrics` collection (nothing else uses that collection anymore) — this is the one BD KPI target with no automated source anywhere, since Metricool doesn't do web analytics
- The public Business Development KPI Progress tracker (`index.html`) now sources every KPI from a live source except Website Visitors: Views/Impressions/Engagements from `config/metricool_stats`, Leads/Bookings from `config/lead_stats` (the real `leads` collection, not the old manually-typed `leadsGenerated`/`estimatedBookings` fields on initiatives/promotions/BD cards). See `docs/DATA_MODEL.md`'s `metrics` section for the coverage trade-offs this involved.

### Settings
- **Entities** — add/remove business entities (blocked from deletion if still referenced anywhere)
- **Team Members** — directory + optional real login account creation (Admin / Agent / Coordinator role), using a secondary Firebase app instance so creating a user doesn't sign out the admin
- **Department Revenue Estimates** — per-department average revenue, used as an ROI fallback
- **Metricool Setup** — API token + brand/profile selection (via "Fetch My Profiles"), stored in `config/metricool_settings`; powers Dashboard Metrics syncing
- **Public Access Gate** — enable/disable + set the password gate on the public portal
- **Admin Login Passcode ("Magic Word")** — set a shared passcode as an alternative login path; changing it force-logs-out the current session
- **Brand Voice** — AI generation tone, formality, closing hashtag, CTA text, banned words — feeds every AI caption/content generation call system-wide

### Content Generator *(currently hidden from nav, code intact)*
- Single-activity AI caption generation, superseded in daily use by the fuller Campaign Generator

---

## Coordinator Request Form (`request.html`) — `role: coordinator` or `admin`

- Minimal single-purpose form: submit a marketing request (title, description, department, type, deadline, priority)
- Daily submission limit enforced per requester
- No access to any other part of the system

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

## Shared / Cross-Cutting Features

- **Role-based routing** — each HTML file independently checks Firebase Auth + the `roles` collection; unauthorized users are logged out immediately with an explanation
- **AI content generation** — powered by a direct browser call to the Anthropic API, governed by the saved Brand Voice settings, used by both the per-activity generator and the Campaign Generator
- **Real-time sync** — nearly all data uses Firestore's live listeners, so multiple admins see each other's changes without refreshing
