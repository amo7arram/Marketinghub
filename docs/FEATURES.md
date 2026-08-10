# Feature Inventory

**Last updated:** August 2026

The complete, current feature set, organized by which file/role it lives in. This is the single answer to "what does this system actually do" — use it instead of reconstructing the answer from chat history.

---

## Public Portal (`index.html`) — no login required*

*unless the Public Access Gate is enabled in admin Settings.

- **Dashboard** — period-navigable (last 3 months) KPI overview: social media performance, department activity mix, leads-by-department breakdown, this-month campaign/health-day list, featured initiatives
- **SM Analytics** — detailed monthly social/website metrics, channel by channel
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
- Annual KPI targets (views, impressions, engagements, website visitors, leads, bookings) — actuals computed automatically from `metrics` + `leads` + `initiatives`

### Well-span / Loyalty
- Package and loyalty card CRUD, shown on the corresponding public pages

### Leads CRM
- Two-dimension status tracking: Contact Status (Untouched/Reached/Unreached/Missed) + Outcome (Pending/Open File/Booked/Closed-Unsuccessful, only active once Reached)
- Inline status editing directly in the table
- Excel upload with automatic column detection (name/phone/department/entity/source/campaign/date/status/notes), department fuzzy-matching, and a campaign-attribution picker
- **Google Sheet live import** — paste a link (or auto-fill from a campaign's saved sheet URL), fetch, preview, import. Deduplicates by phone+campaign combination (not phone alone), so the same person can correctly appear under multiple campaigns as separate interactions
- Contact History — opening any lead shows every other lead record sharing that phone number (date, campaign, status, outcome)
- Revenue Value field per lead, feeding campaign ROI
- Bulk actions: select multiple leads, bulk-edit Department/Entity/Contact Status/Outcome, or bulk-delete
- One-time migration tool for legacy single-field statuses
- Pagination (50/page)

### Budget
- Annual budget vs. spend tracking, combining `expenses` and `initiatives.cost`

### Requests
- View/manage requests submitted via `request.html`

### Brand Resources
- CRUD for the public resource library

### Dashboard Metrics
- Monthly manual entry of social/website performance numbers

### Settings
- **Entities** — add/remove business entities (blocked from deletion if still referenced anywhere)
- **Team Members** — directory + optional real login account creation (Admin / Agent / Coordinator role), using a secondary Firebase app instance so creating a user doesn't sign out the admin
- **Department Revenue Estimates** — per-department average revenue, used as an ROI fallback
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

## Call Center Leads (`call-center.html`) — `role: agent` or `admin`

- View-only access to the full leads table (search, filter by status/outcome/department)
- Inline edit: Contact Status, Outcome
- Edit modal: Name, Phone, Notes, Revenue Value
- **Cannot:** delete leads, bulk-edit, import (Excel or Sheet), add new leads, or reassign Department/Entity/Campaign
- Deliberately excludes campaign cost/budget data from view

---

## Shared / Cross-Cutting Features

- **Role-based routing** — each HTML file independently checks Firebase Auth + the `roles` collection; unauthorized users are logged out immediately with an explanation
- **AI content generation** — powered by a direct browser call to the Anthropic API, governed by the saved Brand Voice settings, used by both the per-activity generator and the Campaign Generator
- **Real-time sync** — nearly all data uses Firestore's live listeners, so multiple admins see each other's changes without refreshing
