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
| `postLink` | string | URL to the published content, once live |
| `captionEN` / `captionAR` | string | AI-generated or manually written captions |
| `captionHeadline` | string | Short on-image headline text |
| `cost` | number \| null | SAR — feeds the Budget tab and campaign CPL/CPA/ROI calculations |
| `leadsGenerated` | number \| null | Manually entered, or aggregated from linked `leads` in newer flows |
| `estimatedBookings` | number \| null | |
| `featured` | boolean | Shows on the public dashboard's Featured section |
| `featuredBD` | boolean | Shows on the Business Development page |
| `parentCampaignId` | string \| null | **Critical field** — links a single activity to a parent `Campaign`-type initiative. Absence means the activity is standalone. |
| `googleSheetUrl` | string | Only on `type: "Campaign"` — optional linked Google Sheet for live lead import |
| `assignedTo` | string | Team member name, sourced from `team_members` |
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
| `dateCreated` | string (YYYY-MM-DD) | |
| `contactStatus` | string | `Untouched`, `Reached`, `Unreached`, `Missed` — **mutually exclusive, always sums to 100% of leads** |
| `outcome` | string | `Pending`, `Open File`, `Booked`, `Closed - Unsuccessful` — **only meaningful when `contactStatus === "Reached"`** |
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

Standalone budget line items (distinct from `initiatives.cost`, which tracks cost per campaign/activity — `expenses` is for costs not tied to a specific initiative).

| Field | Type | Notes |
|---|---|---|
| `title`, `description` | string | |
| `amount` | number | SAR |
| `category` | string | |
| `date` | string | |
| `createdAt` | Timestamp | |

---

## `metrics`

Monthly social media / website performance snapshots, entered manually in admin.

| Field | Type | Notes |
|---|---|---|
| `metricName` | string | e.g. `Instagram Followers`, `Website Sessions` |
| `period` | string (YYYY-MM) | |
| `value` | number | |
| `createdAt` | Timestamp | |

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
