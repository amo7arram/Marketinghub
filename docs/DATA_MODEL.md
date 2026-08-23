# Data Model — Firestore Schema Reference

**Last updated:** August 2026

This is the complete, authoritative reference for every Firestore collection in the system. If a future rebuild needs to design a real database schema, this document — not the code — should be the starting point.

Firestore is schemaless; nothing here is enforced by the database itself. Field presence/types are enforced only by convention in the application code. This is a real risk area: it is possible to write malformed data that the UI doesn't expect.

---

## `initiatives`

The core content-planning collection. Represents a single "Activity" — every campaign, event, social post, print piece, website update, or physician video. As of the campaign restructuring, this collection also holds **container** records (`type: "Campaign"`) that group other initiatives together.

| Field | Type | Notes |
|---|---|---|
| `type` | string | One of: `Campaign`, `Event`, `SM Content`, `Print`, `Website Update`, `Physician Video` |
| `title` | string | Required |
| `department` | string | From the `entities`-style shared `DEPARTMENTS` constant, or a custom "Other" value |
| `entity` | array of strings | Which entities this applies to (IMC, Makkah, TFC, JP, RSM, or custom-added ones) |
| `startDate` | string (YYYY-MM-DD) | |
| `endDate` | string (YYYY-MM-DD) | Only meaningful for `type: "Campaign"` |
| `status` | string | `Planned`, `In Production`, `Ready`, `Published`, `Cancelled` |
| `objective` | string | Free-text brief/description |
| `channels` | array of strings | e.g. `Instagram`, `TikTok`, `Facebook` — relevant for Event/SM Content |
| `contentType` | string | `Post`, `Reel`, `Video`, `Story`, `Carousel` — for SM Content/Physician Video |
| `printType` | string | `Brochure`, `Sticker`, `Flyer`, `Booklet`, `Signage`, `Countertop`, `Backdrop/Rollup` |
| `eventScope` | string | `Internal` or `External` — for `type: "Event"` only |
| `websiteUpdateType` | string | `News Article`, `Department Page Update`, `Doctor Profile Added`, `Doctor Profile Removed`, `Other` |
| `websiteUpdateLink` | string | URL — for `type: "Website Update"` |
| `physicianName` | string | Optional — for `type: "Physician Video"`, tracks which doctor is featured |
| `postLink` | string | URL to the published content, once live. Originally shown only for `SM Content`/`Event`/`Print`/`Physician Video`; now also shown for `type: "Campaign"` so a campaign container can carry one representative post link, surfaced to agents alongside `agentScript` (see below). |
| `agentScript` | string | **`type: "Campaign"` only.** 1-2 paragraphs of calling context/talking points, shown to agents via a click-through popover on the Campaign cell in both `admin.html`'s and `call-center.html`'s leads tables, wherever a lead's `campaignId` points to this record. |
| `captionEN` / `captionAR` | string | AI-generated or manually written captions |
| `captionHeadline` | string | Short on-image headline text |
| `cost` | number \| null | SAR — feeds the Budget tab and campaign CPL/CPA/ROI calculations |
| `leadsGenerated` | number \| null | Manually entered, or aggregated from linked `leads` in newer flows |
| `estimatedBookings` | number \| null | |
| `featured` | boolean | Shows on the public dashboard's Featured section |
| `featuredBD` | boolean | Shows on the Business Development page |
| `parentCampaignId` | string \| null | **Critical field** — links a single activity to a parent `Campaign`-type initiative. Absence means the activity is standalone. |
| `googleSheetUrl` | string | Only on `type: "Campaign"` — optional linked Google Sheet for live lead import |
| `assignedTo` | string | Team member name, sourced from `team_members` — **who's working on producing this content**, unrelated to `leads.assignedAgentUid`/`assignedAgentName` (which lead a call-center agent should follow up on). Two different assignment concepts that happen to share a similar name. |
| `reach` / `impressions` / `engagements` | number \| null | Manually entered performance figures |
| `createdAt` / `updatedAt` | Firestore Timestamp | |

**⚠️ Legacy fields still present on old documents, no longer written by current code:** `hdCategory`, `nameAr` (both were Health Day-specific before Health Days became a standalone collection).

---

## `health_days`

Standalone reference calendar of health awareness days, Saudi/Islamic occasions, and IMC campaigns. Deliberately separated from `initiatives` — these are dates to be aware of, not deliverables to produce.

| Field | Type | Notes |
|---|---|---|
| `name` | string | English name |
| `nameAr` | string | Arabic name |
| `date` | string (YYYY-MM-DD) | |
| `category` | string | `MOH Health Day`, `Saudi Occasion`, `Islamic Occasion`, `IMC Campaign` |
| `department` | string | Optional |
| `createdAt` | Timestamp | |

---

## `promotions`

Sales/marketing promotions (discount packages, seasonal offers).

| Field | Type | Notes |
|---|---|---|
| `title`, `description` | string | |
| `department` | string | |
| `entity` | array of strings | |
| `originalPrice`, `discountedPrice` | number | SAR |
| `discountPct` | number | Auto-calculated from the two prices above |
| `startDate`, `endDate` | string | |
| `conditions` | string | Fine print |
| `isWellspan` | boolean | Shows on the Well-span Program page if true |
| `leadsGenerated`, `estimatedBookings` | number \| null | |
| `createdAt` | Timestamp | |

---

## `leads`

The CRM core. Each document is **one interaction** — a person engaging with one specific campaign/source, not a deduplicated "contact" record. The same phone number can legitimately appear in multiple documents if that person engaged with multiple campaigns.

| Field | Type | Notes |
|---|---|---|
| `name`, `phone` | string | Required. `phone` is the de facto identity key used for the Contact History lookup (not a formal foreign key — just a runtime filter) |
| `department` | string | |
| `entity` | string | Single value (not an array, unlike `initiatives.entity`) |
| `source` | string | e.g. `Meta Ads`, `Google`, `Walk-in` |
| `campaignId` | string \| null | References an `initiatives` document where `type === "Campaign"` |
| `campaign` | string | Denormalized campaign title, kept for display and for legacy free-text imports where no `campaignId` exists |
| `dateCreated` | string (YYYY-MM-DD) | Drives every month-scoped lead figure app-wide (`config/lead_stats.byMonth`/`byMonthDept`, the public "Leads by Department" chart, the AI Reports MoM comparisons). **Real incident:** `parseExcelDate()` (`admin.html`) used to silently misread a 2-digit-year date (e.g. `8/19/01`) as year 2001 instead of 2026, corrupting 241 leads on one Excel import and making an entire department vanish from that month's chart. Fixed at the source — `parseExcelDate()` now rejects ambiguous 2-digit years instead of guessing a century, showing them as "not parsed" in the import preview so they're caught before import, and also fixes a related off-by-one-day UTC/timezone bug that affected every Excel-parsed date for anyone in a UTC+ timezone. `fixCorruptedLeadYears()` (`firebase-data.js`) is a one-time correction for already-corrupted records, wired to a "🗓 Fix Corrupted Dates" button in the Leads CRM toolbar — safe to run repeatedly, a no-op once nothing matches. |
| `contactStatus` | string | `Untouched`, `Reached`, `Unreached`, `Missed` — **mutually exclusive, always sums to 100% of leads** |
| `outcome` | string | `Pending`, `Open File`, `Follow-up Scheduled`, `Booked`, `Wrong Number`, `Already a Patient`, `Closed - Unsuccessful` (`OUTCOMES` in `firebase-data.js`) — **only meaningful when `contactStatus === "Reached"`**. Once `outcome === "Booked"`, both `contactStatus`/`outcome` are locked in the UI (agents: no override; admin: override with a confirm prompt) — a workflow guard, not a Firestore rule, to protect revenue reporting from accidental edits. |
| `closureReason` | string \| null | Only meaningful when `outcome === "Closed - Unsuccessful"` — one of `CLOSURE_REASONS` (`firebase-data.js`). Captures *why* a lead didn't convert, cleared automatically if `outcome` changes away from Closed - Unsuccessful. |
| `assignedAgentUid` | string \| null | Firebase Auth UID of the agent this lead is assigned to. Set only by admins (`admin.html`) — agents can't reassign, matching the existing role boundary (`ARCHITECTURE.md` §4.1). Only team members with `hasLoginAccount && authUid` can be assigned, since anyone else could never see the lead in their own scoped view. Drives Contact Center Control's default "My Leads" filter (`l.assignedAgentUid === auth.currentUser.uid`). |
| `assignedAgentName` | string | Denormalized display name, same convention as `campaign`/`campaignId`. |
| `revenueValue` | number \| null | SAR — actual known revenue from this booking, feeds campaign ROI |
| `notes` | string | |
| `createdAt`, `updatedAt` | Timestamp | |

**⚠️ Legacy field:** `status` (old flat single-status model: `Lead`/`Open File`/`Booked`/`Closed`). Migrated via `migrateLegacyLeadStatuses()` — should be fully absent on any document that has gone through migration.

**Known limitation:** there is no formal "Contact" entity separate from "Lead interaction." A phone-number lookup at read time simulates contact history; this is not a true relational model and would need a proper `contacts` collection (one per unique person) with `lead_interactions` as child records in any serious rebuild.

---

## `entities`

Admin-manageable list of business entities (hospital branches/brands). Originally hardcoded (`IMC`, `Makkah`, `TFC`, `JP`, `RSM`), now editable.

| Field | Type | Notes |
|---|---|---|
| `name` | string | |
| `createdAt` | Timestamp | |

**Deletion is blocked** if any `initiatives`, `bd_cards`, or `promotions` document still references the entity name — enforced in application code via `checkEntityUsage()`, not a database constraint.

---

## `team_members`

Directory of staff, used for the "Assigned To" dropdown and optionally linked to real login accounts.

| Field | Type | Notes |
|---|---|---|
| `name`, `email` | string | |
| `department` | string | Optional |
| `hasLoginAccount` | boolean | |
| `authUid` | string \| null | The Firebase Auth UID, if a login account was created |
| `active` | boolean | |
| `createdAt` | Timestamp | |

**Note:** deleting a team member with `hasLoginAccount: true` removes their `roles` document (revoking access) but does **not** delete the underlying Firebase Auth account — that requires a manual step in Firebase Console, since client-side code can only delete the *currently signed-in* user's own account.

---

## `roles`

Keyed by Firebase Auth UID (not an auto-generated ID). One field:

| Field | Type | Notes |
|---|---|---|
| `role` | string | `admin`, `agent`, or `coordinator` |

---

## `requests`

Marketing requests submitted by coordinators via `request.html`.

| Field | Type | Notes |
|---|---|---|
| `requesterName`, `email` | string | |
| `title`, `description` | string | |
| `department` | string | |
| `type` | string | From `REQUEST_TYPES` constant |
| `deadline` | string | |
| `priority` | string | `Low`/`Normal`/`High`/`Urgent` |
| `createdAt` | Timestamp | Used to enforce `DAILY_REQUEST_LIMIT` per submitter |

---

## `expenses`

Standalone budget line items (distinct from `initiatives.cost`, which tracks cost per campaign/activity — `expenses` is for costs not tied to a specific initiative). **No `department` field** — only initiative-linked costs can be attributed to a department; anything relying on a department-scoped spend breakdown (e.g. the AI Reports feature below) must say so explicitly rather than presenting an incomplete picture as complete.

| Field | Type | Notes |
|---|---|---|
| `title`, `description` | string | |
| `cost` | number | SAR (corrected — this field was previously documented here as `amount`, which doesn't match the actual code) |
| `type`, `entity` | string | `type` is a category (e.g. Paid Social, Print Production); `entity` is a single business entity, not an array like `initiatives.entity` |
| `date` | string | |
| `createdAt` | Timestamp | |

---

## `metrics` — ⚠️ legacy, one field still actively written

Monthly social media / website performance snapshots, formerly entered manually in admin for every metric.

| Field | Type | Notes |
|---|---|---|
| `metricName` | string | e.g. `Instagram Followers`, `Website Sessions` |
| `period` | string (YYYY-MM) | |
| `value` | number | |
| `createdAt` | Timestamp | |

**Superseded by `config/metricool_stats` for everything Metricool can supply.** As of the Metricool integration, `admin.html`'s Dashboard Metrics tab and `index.html`'s Social Media Performance / SM Analytics sections no longer read or write most of this collection — social metrics are synced automatically from Metricool instead of typed in by hand. Existing documents for retired metric names are left in place untouched (same treatment as the legacy `hdCategory` field above) rather than deleted.

**One metric name is still actively written: `Website Visits`.** Metricool has no web-analytics equivalent (it's a social scheduling/analytics tool, not a site-analytics one), so this is the one BD KPI target with no automated source anywhere. `admin.html`'s Dashboard Metrics tab has a small dedicated "Website Visitors" input, separate from the Metricool grid, that writes only this metric name here via the existing `saveMonthMetrics()`/deterministic-ID pattern — nothing else in current code reads or writes any other `metricName` in this collection.

`index.html`'s Business Development KPI Progress tracker (`renderBdKpiProgress()`, tracks actuals against `config/bd_targets`) was previously frozen because it read this whole collection, which had stopped being written to except by nothing. It's now been fixed to source each KPI from the appropriate live place: Views/Impressions/Engagements from `config/metricool_stats` (see the series structure below), Leads/Bookings from `config/lead_stats` (the real `leads` collection — replacing the old manually-typed `leadsGenerated`/`estimatedBookings` fields on `initiatives`/`promotions`/`bd_cards`, which nobody had kept updated), and Website Visitors from this collection's one remaining live field. This did narrow two KPIs' real-world coverage versus their old (but frozen) numbers: "Impressions/Reach" no longer includes X Reach, and "Engagements" no longer includes TikTok engagement — neither is available from Metricool's API at all (confirmed via live testing, not assumed from docs). A real, narrower number was judged better than a broader one that silently never changes.

---

## `config/metricool_stats` — series structure

See the `config` table below for where this fits among other single-document config entries. Documented separately here because its internal shape is more involved than a flat field list:

```
config/metricool_stats = {
  updatedAt: Timestamp,
  series: {
    <seriesKey>: [ { date: "YYYY-MM-DD", value: number, source: "metricool" | "manual" }, ... ],
    ...
  }
}
```

`seriesKey` is one of the entries in `METRICOOL_SERIES` (`firebase-data.js`) — currently `instagram_reach`, `instagram_engagement_rate`, `instagram_likes`, `instagram_comments`, `instagram_reel_views`, `instagram_followers`, `tiktok_video_views`, `linkedin_impressions`, `linkedin_followers`, `twitter_followers`. Each maps to a specific Metricool API call (network/metric/subject) — see `admin.html`'s `syncMetricool()` for the exact mapping, verified live against Metricool's real API responses rather than assumed from their docs.

Points are daily. `source:"metricool"` points come from admin.html's "Sync Now" action; `source:"manual"` points are a whole-month admin override (dated to the last day of that month) that future syncs skip — see `mergeMetricoolSeries()` in `admin.html`. `metricoolMonthlyValue(stats, seriesKey, period)` (`firebase-data.js`, shared by both `admin.html` and `index.html` so the two pages can never disagree) derives one display number per series+month: a manual override wins outright if present, otherwise the series' points for that month are summed, averaged, or the latest one is taken, depending on that series' `agg` rule (`sum` for volume metrics like reach/views, `avg` for the engagement-rate percentage, `last` for point-in-time follower counts).

**Known gap:** `instagram_followers` has no historical data available from Metricool at all (no working follower-history endpoint was found for Instagram specifically, unlike LinkedIn/X which do have real daily follower timelines) — only a live snapshot via a separate endpoint. Per project decision, this series only starts accumulating data from whenever syncing began; there is no backfill for it, unlike the other series which were backfilled from 2026-04-01.

---

## `resources`

Brand resource library links (logos, templates, guidelines).

| Field | Type |
|---|---|
| `title`, `description`, `url`, `category` | string |

---

## `bd_cards`

Business Development activity records (partnerships, outreach — distinct from `initiatives` since BD activities aren't marketing content).

| Field | Type |
|---|---|
| `title`, `description`, `partner`, `outcome`, `date` | string/mixed |

---

## `wellspan_packages` / `loyalty_cards`

Program-specific offerings shown on the public Well-span and Loyalty pages. Structure defined by their respective admin forms — see `FEATURES.md` for what each field represents.

---

## `config` (single-document sub-collection pattern)

Several unrelated pieces of app-wide configuration are stored as individual documents inside one `config` collection, rather than as separate top-level collections. This was a pragmatic choice to avoid rule sprawl — each is a single document, not a real collection of many records.

| Document ID | Contents |
|---|---|
| `budget` | Annual marketing budget figure |
| `bd_targets` | Business Development KPI targets |
| `brand_voice` | AI content generation brand voice settings (tone, hashtags, banned words, CTAs) |
| `ai_settings` | Anthropic API key (⚠️ stored here, visible client-side — see `ARCHITECTURE.md` §4) |
| `access_gate` | Public portal password gate settings |
| `admin_passcode` | The "Magic Word" shared passcode hash |
| `lead_stats` | **Public-readable** aggregated leads funnel snapshot — written by admin, read by `index.html`. Contains zero PII by design. |
| `department_revenue_estimates` | Per-department average revenue, used as the ROI fallback when actual `leads.revenueValue` isn't entered |
| `metricool_settings` | Metricool API token + userId/blogId (⚠️ stored here, visible client-side — same tradeoff as `ai_settings`, see `ARCHITECTURE.md` §4). Needs an authenticated-only Firestore rule, same sensitivity class as `ai_settings`. |
| `metricool_stats` | **Public-readable** synced social performance series — written by `admin.html`'s "Sync Now" action, read by `index.html`. Contains zero PII by design (aggregate public social numbers only). See the `config/metricool_stats` series structure section above. Needs a public-read/authenticated-write Firestore rule, same pattern as `lead_stats`. |

---

## `config/lead_stats` — aggregate structure

Computed by `computeAndPublishLeadStats()` in `admin.html` (debounced, re-runs whenever `leads`/`department_revenue_estimates` change) from the real `leads` collection — never from the manually-entered `initiatives.leadsGenerated`/`estimatedBookings` (or the equivalent fields on `promotions`/`bd_cards`), which are a separate, easily-stale figure. Those manual fields are still shown per-item on the public Business Development activity feed (`renderBdGrid()` in `index.html`) as small self-reported stats on each card, but the site-wide Business Development KPI Progress tracker now reads `byMonth` here instead of summing them — see the `metrics` collection section above.

```
config/lead_stats = {
  total, untouched, reached, unreached, missed, openFile, booked, closedUnsuccessful,
  byDepartment: { [dept]: {total, reached, booked} },   // all-time cumulative, not month-scoped
  byEntity:     { [entity]: {total, reached, booked} }, // all-time cumulative
  bySource:     { [source]: {total, reached, booked} }, // all-time cumulative
  byMonth:      { [YYYY-MM]: {total, reached, booked} },
  byMonthDept:  { [YYYY-MM]: { [dept]: count } },        // powers index.html's "Leads by Department" chart
  campaigns:    [ {campaignId, title, cost, leads, reached, booked, openFile, cpl, cpa, actualRevenue, estimatedRevenue, roi, roiIsEstimated}, ... ],
  updatedAt,
}
```

`byDepartment`/`byEntity`/`bySource` are all-time totals with no month dimension — `byMonthDept` was added specifically because the Dashboard's monthly department breakdown needed one and none of the existing structures had it.

---

## AI Reports — writes nothing (deliberate exception)

`admin.html`'s AI Reports tab is the one feature in this app that persists nothing at all — no new collection, no new `config` document. It's purely ephemeral: pick a month, generate, download via the browser's print dialog, and the report is gone once you navigate away or regenerate. This was an explicit product decision (archiving was considered and deferred as a "nice to have"), not an oversight — don't add a Firestore write path here without discussing it first, since it changes the feature's whole design (it currently means zero new Firestore rules, zero PII-retention concerns beyond what already exists in `leads`).

It does introduce one new **cross-system correlation pattern** worth knowing about: it matches Metricool's `/v2/scheduler/posts` response (real published post media, fetched live at report-generation time, never stored) back to our own `initiatives` records by comparing `providers[].publicUrl` (Metricool's live post URL per network) against `initiatives.postLink` — both are the same underlying URL, just captured on two different systems. This is how the report can show a real screenshot of what was actually posted, tied to the specific initiative that produced it, without ever storing the image or the match anywhere.

---

## Cross-Collection Relationships (informal — not enforced by Firestore)

```
initiatives (type=Campaign)
  ├── initiatives (parentCampaignId → parent)     [single activities under a campaign]
  ├── leads (campaignId → campaign)                [leads attributed to this campaign]
  └── expenses / initiatives.cost                  [budget tracking]

leads
  └── phone number ~ informal grouping             [Contact History — not a real FK]

team_members
  └── authUid → Firebase Auth user → roles/{uid}   [login account, if granted]

entities.name
  ├── referenced by initiatives.entity[]
  ├── referenced by bd_cards.entity
  └── referenced by promotions.entity[]
```

None of these relationships are enforced by Firestore itself — every "reference" is just a string ID or name stored on the child document, validated only by application code at write time. A real relational (or rigorously-validated document) database would be a meaningful reliability improvement in any SaaS rebuild.
