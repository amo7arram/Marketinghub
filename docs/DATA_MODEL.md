# Data Model — Firestore Schema Reference

**Last updated:** August 2026

This is the complete, authoritative reference for every Firestore collection in the system. If a future rebuild needs to design a real database schema, this document — not the code — should be the starting point.

Firestore is schemaless; nothing here is enforced by the database itself. Field presence/types are enforced only by convention in the application code. This is a real risk area: it is possible to write malformed data that the UI doesn't expect.

---

## `initiatives`

The core content-planning collection. Represents a single "Activity" — every campaign, event, social post, print piece, website update, or physician video. As of the campaign restructuring, this collection also holds **container** records (`type: "Campaign"`) that group other initiatives together.

| Field | Type | Notes |
|---|---|---|
| `type` | string | One of: `Campaign`, `Event`, `SM Content`, `Print`, `Website Update`, `Physician Video`. Drives the public Dashboard's "Marketing Output" deliverable counts (`deliverableTypeFor()` in `index.html`) — maps to Videos/Social Posts/Events/Print/Website Updates by `type` (and `contentType` for `SM Content`/`Physician Video`, splitting Video/Reel into Videos vs. everything else into Social Posts). That classifier deliberately excludes `Cancelled`-status records (a real product decision — Planned/In Production/Ready/Published all still consumed real time and cost, so they count) and excludes `type: "Campaign"` container records themselves (a campaign is an organizing wrapper, not itself a deliverable — its real children already have their own type and are counted individually, so counting the container too would double-count the same work). The Activity-by-Department/Entity breakdown on the same Dashboard page uses this identical classifier, so the two can never disagree. |
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
| `socialImageUrl` | string \| null | Real published post media, auto-matched from Metricool and written by `admin.html`'s `syncMetricool()` — not by the user directly. Matches this initiative's `postLink` against Metricool's `/v2/scheduler/posts` (`providers[].publicUrl`) for the same live URL, and if found, stores the first non-video media item from that post — or, if the post has no still image at all (a reel/video-only post), the raw `.mp4` itself, so reels aren't excluded from coverage. **Coverage is inherently partial, not a bug**: only content actually scheduled/published *through* Metricool can match at all (content posted natively bypasses Metricool's scheduler entirely), and LinkedIn essentially never matches, since the `postLink` typically pasted from LinkedIn's own "Share" link (`urn:li:activity:...`) uses a different URL scheme than what Metricool records for the same post (`urn:li:ugcPost:...`). Real-data test on this project: ~48% of published initiatives with a `postLink` matched. Used by `index.html`'s Dashboard "this month" campaign list and Recent Posts gallery (the latter scoped to the dashboard's selected month) to show a real thumbnail instead of a plain color dot/empty state — every consumer checks the URL with `isVideoUrl()` and renders a muted, seeked-to-first-frame `<video>` instead of an `<img>` when it's a `.mp4`. Falls back to the dot/empty-state when absent — and, since the campaign list opens the shared `openDetail()` side panel (also used by SM Calendar and Dept Campaigns cards) on click, `socialImageUrl` renders full-size (with playback controls, if a video) at the top of that panel automatically, for any initiative it's set on, from any entry point that already calls `openDetail()`. This is a zero-cost mechanism — no Firebase Storage/upload capability exists yet (would require the Blaze plan); a general upload-based fallback for the other ~50% is a deferred future decision. |
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
| `assignedTo` | string | Team member name, sourced from `team_members` — **who's working on producing this content**, unrelated to `leads.assignedAgentUid`/`assignedAgentName` (which lead a call-center agent should follow up on). Two different assignment concepts that happen to share a similar name. Still the display source of truth; `assignedToUid` is the stable companion. |
| `assignedToUid` | string \| null | Firebase Auth UID of the assignee, resolved from the picked name against `team_members.authUid` at save time. Drives the Activities page's "👤 Mine only" filter (`i.assignedToUid === currentAdminUid`, with a name fallback for pre-existing rows). Null when the assignee has no login account, or on legacy documents. |
| `createdByUid` / `createdByName` | string \| null | Stamped once, on create, from the signed-in admin (`createdByName` falls back to their login email, then `"Unknown"`, when they have no matching `team_members` directory row). Powers the **creator-locked reassignment** UI guard: the "Assigned To" field on an existing activity is editable only by the creator or the Super Admin (`admin.html`'s `canReassign()`). **UI-level only — no Firestore rule enforces it**, consistent with the app's other soft boundaries. Legacy documents with no `createdByUid` stay reassignable by any admin. `createdByName` is also shown on the public `openDetail()` panel. |
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

## `promotions` — ⚠️ legacy, retired

Sales/marketing promotions (discount packages, seasonal offers), manually entered one at a time. **Superseded by `offers_catalog` below** — the admin.html Promotions tab, the public Promotions Calendar page, and the Well-span page's promotions integration were all removed. Existing documents are left in place untouched (same convention as the old `metrics` collection) — nothing reads or writes this collection anymore.

| Field | Type | Notes |
|---|---|---|
| `title`, `description` | string | |
| `department` | string | |
| `entity` | array of strings | |
| `originalPrice`, `discountedPrice` | number | SAR |
| `discountPct` | number | Auto-calculated from the two prices above |
| `startDate`, `endDate` | string | |
| `conditions` | string | Fine print |
| `isWellspan` | boolean | Used to show on the Well-span Program page — no longer read anywhere |
| `leadsGenerated`, `estimatedBookings` | number \| null | |
| `createdAt` | Timestamp | |

---

## `offers_catalog`

Excel-driven public price/discount catalog — replaces `promotions` above. Admin uploads Finance's master Excel sheet (`admin.html`'s "Offers Catalog" tab); each publish wholesale-replaces the entire catalog. Read by the public `offers.html` page and by `call-center.html`'s read-only Offers tab.

**Doc ID = a slugified branch key** (e.g. `imc_jeddah`), sharded one document per branch rather than one collection-wide document — a deliberate scaling precaution, since Firestore documents cap at 1 MiB and the real ongoing catalog is very likely larger than the 287-row National Day campaign subset this was modeled on (see `national-day-offers.html`).

| Field | Type | Notes |
|---|---|---|
| `branchLabelEN`, `branchLabelAR` | string | Display name for this branch's tab |
| `offers` | array of objects | One entry per Excel row for this branch: `{code, description, category, arabic, price, discountedPrice, discountPct}`. `discountPct` is always computed from `price`/`discountedPrice` at import time, never trusted from a sheet column (with one exception — see below), so it can't drift out of sync with the two prices. |
| `updatedAt` | Timestamp | |

**Column detection is now verified against Finance's real "Promotional Campaigns" sheet** (confirmed with the user, not a guess). That sheet's actual columns are `Status, Provider, Year, Campaign Title, Code, Description, Gross Price, Proposed Discount, Net Price, Starting Date, End Date, Payor, Notes` — several real-world quirks this shapes the import around:
- **`Status` gates what's imported.** Only rows marked `Active` are live offers. The sheet's own "Reference" tab defines `Inactive` as "code & discount previously approved in system" (i.e. retired, not current) and `Approved`/`Pending` as not-yet-live — in the real sheet, 520 of 840 rows were `Inactive`, so this filter is load-bearing, not cosmetic.
- **`Provider` is the branch column**, mapped through a small hardcoded table (`OFFERS_BRANCH_CODE_MAP` in `admin.html`, confirmed with the user): `IMC`→IMC Jeddah, `FC`→The First Clinic, `MC`→IMC Makkah Branch, `RS`→Red Sea Mall Clinic. A cell can list several comma-separated (`"FC, IMC"`) — the same offer is then pushed into every branch named, not treated as one combined branch. An unrecognized code is used as-is and flagged in the preview rather than dropped.
- **`Gross Price` can be blank.** When it is, and `Net Price` + `Proposed Discount` are both present, `price` is back-calculated (`Net ÷ (1 − discount)`) rather than skipping the row — verified against real rows where both figures were present that this relationship holds exactly. If nothing usable is present at all, the row is skipped (reported in the preview, with examples) rather than publishing a broken price.
- **`Campaign Title` is used as `category`** (there's no dedicated specialty/department column) — an explicit product decision, not a fallback.
- **No Arabic column exists.** `arabic` is AI-drafted from `description` at import time (`claude-sonnet-4-6`, batched) when the sheet doesn't supply one — degrades to English-only if no API key is configured or the call fails. The preview shows a sample of English→Arabic pairs for a spot-check; full manual review of every line isn't practical at typical row counts (a few hundred), so this is a "reviewable draft," not a guarantee.

The import's preview step (per-branch/category counts, status-excluded counts, price-skip examples, unrecognized-branch warnings, Arabic sample) remains the safety net before anything publishes.

## `config/offers_catalog_meta`

```
config/offers_catalog_meta = {
  branches: [ { id, labelEN, labelAR, count }, ... ],
  rowCount: <total offers across all branches>,
  updatedAt: Timestamp,
}
```
Public-readable single document — lets `offers.html` and `call-center.html`'s Offers tab discover which branch documents exist (and render tab labels immediately) with one small read, instead of listing the whole `offers_catalog` collection.

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
| `dateCreated` | string (YYYY-MM-DD) | Drives every month-scoped lead figure app-wide (`config/lead_stats.byMonth`/`byMonthDept`, the public "Leads by Department" chart, the AI Reports MoM comparisons). **Two real incidents, same symptom (year silently read as 2001), different causes** — worth understanding both, since Excel date handling keeps finding new edge cases: (1) An ambiguous 2-digit-year string (e.g. `8/19/01`) fell through to the browser's native date parser, which defaults a missing/ambiguous century to 1900s-or-2000s guesswork; `parseExcelDate()` (`admin.html`) now rejects any date string with no 4-digit year anywhere in it, returning unparsed (shown as "not parsed" in red in the import preview) rather than guessing. (2) **The real cause of a second, later incident**: `handleExcelUpload()` originally read every column's *formatted display string* (`sheet_to_json({raw:false, dateNF:'yyyy-mm-dd'})`) — if a source date column happened to be styled with an Excel format that omits the year entirely (e.g. the built-in "d-mmm" style, displaying `19-Aug`), the year was gone from the string before `parseExcelDate` ever saw it, regardless of the underlying cell's real value — `dateNF`'s override doesn't reliably win over a cell's own format. Fixed by reading the date column's raw underlying value from a parallel `raw:true` pass instead of the formatted-string pass used for every other column — and deliberately *not* using SheetJS's `cellDates:true` conversion for this, since testing found its Date objects aren't reliably anchored to a clean UTC or local midnight (environment-dependent), unlike the plain numeric Excel serial, which converts deterministically. `fixCorruptedLeadYears()` (`firebase-data.js`) is a one-time correction for already-corrupted records from either cause, wired to a "🗓 Fix Corrupted Dates" button in the Leads CRM toolbar — safe to run repeatedly, a no-op once nothing matches. |
| `contactStatus` | string | `Untouched`, `Reached`, `Unreached`, `Missed` — **mutually exclusive, always sums to 100% of leads** |
| `outcome` | string | `Pending`, `Open File`, `Follow-up Scheduled`, `Booked`, `Wrong Number`, `Already a Patient`, `Closed - Unsuccessful` (`OUTCOMES` in `firebase-data.js`) — **only meaningful when `contactStatus === "Reached"`**. Once `outcome === "Booked"`, both `contactStatus`/`outcome` are locked in the UI (agents: no override; admin: override with a confirm prompt) — a workflow guard, not a Firestore rule, to protect revenue reporting from accidental edits. |
| `closureReason` | string \| null | Only meaningful when `outcome === "Closed - Unsuccessful"` — one of `CLOSURE_REASONS` (`firebase-data.js`). Captures *why* a lead didn't convert, cleared automatically if `outcome` changes away from Closed - Unsuccessful. |
| `assignedAgentUid` | string \| null | Firebase Auth UID of the agent this lead is assigned to. Set only by admins (`admin.html`) — agents can't reassign, matching the existing role boundary (`ARCHITECTURE.md` §4.1). Only team members with `hasLoginAccount && authUid` can be assigned, since anyone else could never see the lead in their own scoped view. Drives Contact Center Control's default "My Leads" filter (`l.assignedAgentUid === auth.currentUser.uid`). |
| `assignedAgentName` | string | Denormalized display name, same convention as `campaign`/`campaignId`. |
| `revenueValue` | number \| null | SAR — actual known revenue from this booking, feeds campaign ROI |
| `notes` | string | For `source:"Landing Page"` leads, populated from that page's optional Comment field |
| `email` | string \| null | Optional everywhere, including on `source:"Landing Page"` leads — the landing page form only requires Name and Phone. Not yet added to the Excel/Sheet import column-detection — a natural, separate follow-up. |
| `landingPageId` | string \| null | Set only when `source === "Landing Page"` — references the `landing_pages` doc (by slug) that generated this lead. Informational only, no live lookup renders against it the way `initiatives`-linking fields do elsewhere, so a deleted landing page leaves this harmlessly dangling. |
| `createdAt`, `updatedAt` | Timestamp | |

**⚠️ Legacy field:** `status` (old flat single-status model: `Lead`/`Open File`/`Booked`/`Closed`). Migrated via `migrateLegacyLeadStatuses()` — should be fully absent on any document that has gone through migration.

**Known limitation:** there is no formal "Contact" entity separate from "Lead interaction." A phone-number lookup at read time simulates contact history; this is not a true relational model and would need a proper `contacts` collection (one per unique person) with `lead_interactions` as child records in any serious rebuild.

---

## `landing_pages`

Admin-built lead-capture pages, published at a stable public URL (`landing.html?slug=<id>`) for use in ad campaigns — see `docs/FEATURES.md` and `docs/ARCHITECTURE.md` §4.6 for the full design. **Doc ID = slug** (deterministic ID, `setDoc`, per CLAUDE.md rule 6) — the slug *is* the URL, so `landing.html` resolves a page with a single `getDoc` by known ID, never a query, and never lists the collection.

| Field | Type | Notes |
|---|---|---|
| `title` | string | Internal/admin-facing name |
| `headline`, `subheadline` | string | Public-facing hero copy |
| `bodyText` | string | **Raw admin-authored HTML**, not plain text — tables/formatting/links/pasted content from an external page all work. Sanitized via DOMPurify at render time only (both `admin.html`'s live preview and `landing.html`'s public render), never at write time, so a future sanitizer/library upgrade doesn't require touching already-stored content. Since this is public-facing, treat any pasted HTML from an untrusted external source as a real supply-chain risk even though it's sanitized — DOMPurify strips `<script>`/event-handlers/unsafe URLs, but review what you paste. |
| `heroImageUrl` | string \| null | Optional, a pasted link — same convention as `requests.referenceLink`, since this app has no file upload anywhere |
| `ctaButtonText` | string | Defaults to "Submit" if empty |
| `thankYouMessage` | string \| null | Optional custom text shown after a successful submission; falls back to a generic message if unset |
| `redirectUrl` | string \| null | Optional. If set, a visitor is redirected here immediately after submitting instead of ever seeing `thankYouMessage` — e.g. a booking page, WhatsApp link, or a separate thank-you page |
| `campaignId` / `campaignTitle` | string \| null | Denormalized at save time in `admin.html` so `landing.html` never needs to fetch the full `initiatives` collection just to label one lead — read straight off this doc and copied onto every lead this page generates |
| `department`, `entity` | string | Single values, matching `leads.department`/`leads.entity`'s shape (not arrays) — copied onto every lead this page generates |
| `status` | string | `Draft` \| `Published` (`LANDING_PAGE_STATUSES`) — only `Published` pages are visitable; a Draft's content is unreachable even by direct slug guess (see the Firestore rule below) |
| `createdAt` / `updatedAt` | Timestamp | |

**Firestore rule** (`firestore.rules`): anonymous visitors may `get` exactly one `Published` page by known slug, never `list` the collection (so Draft titles/content stay invisible and can't be discovered by browsing); authenticated admins get full `list`/`get`/`write`.

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
| `role` | string | Mirror of the `roles/{authUid}` value, set at login-account creation (`admin` / `coordinator` / `agent`) — display convenience only; `roles` is the auth source of truth |
| `superAdmin` | boolean | UI-level flag (**not** a `roles` value): this person can reassign any activity regardless of who created it. Intended for exactly one person — `admin.html` soft-blocks setting a second one. Only meaningful for a member with a login account. Editable on the member's row in Settings → Team Members. |
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

Marketing requests submitted by coordinators via `request.html`, reviewed (accepted/rejected) by an admin in `admin.html`'s Requests tab, and optionally linked to a real `initiatives` document — same accept-and-link mechanism as `marketing_actions` below, reusing its `initiativeInfoFor()`/`populateLinkExistingSelect()` helpers.

| Field | Type | Notes |
|---|---|---|
| `requesterName`, `email` | string | |
| `title`, `description` | string | |
| `department` | string | |
| `entity` | string[] | Which business entities this relates to — same convention as `initiatives.entity` |
| `targetAudience` | string | Who the request is for |
| `referenceLink` | string | Optional — a Drive link, brand asset, or example, in lieu of emailing an attachment separately |
| `type` | string | From `REQUEST_TYPES` constant |
| `deadline` | string | |
| `priority` | string | From `PRIORITIES` constant — `Normal`/`High`/`Urgent` (previously documented here as including `Low`, which doesn't exist in the actual constant) |
| `status` | string | One of `REQUEST_STATUSES` (`firebase-data.js`): `Pending`, `Accepted`, `Rejected` |
| `rejectionReason` | string \| null | From `REQUEST_REJECTION_REASONS`, only meaningful when `status === "Rejected"` |
| `rejectionNote` | string | Optional free-text elaboration alongside `rejectionReason` |
| `linkedInitiativeId` | string \| null | Raw `initiatives` doc id, or `null` — same convention as `marketing_actions.linkedInitiativeId`. Set either by auto-creating a new initiative at Accept time, or by linking to an existing one. **No referential integrity** (same accepted gap as `marketing_actions`/`leads.campaignId`) — deleting the linked initiative leaves this dangling; both `admin.html` and `request.html`'s "My Requests" view render an explicit "(deleted)" label rather than going silently blank. |
| `linkedInitiativeTitle` | string \| null | Denormalized display title. The *live* status shown anywhere is always a fresh lookup against `initiatives`, never a stored/denormalized status field. |
| `reviewedAt` | Timestamp | Set when an admin accepts or rejects |
| `reviewedBy` | string | Admin's email |
| `createdAt` | Timestamp | Used to enforce `DAILY_REQUEST_LIMIT` per submitter |
| `done` | boolean | ⚠️ Legacy — predates `status`. Requests created before the accept/reject workflow existed only ever had this boolean. `migrateLegacyRequestStatuses()` converts them one time (`done:true`→`Accepted`, `done:false`/missing→`Pending`); until migrated, `requestStatusOf()` in `admin.html` interprets `done` on the fly so old rows still render correctly. |

The submitting coordinator can see their own requests and their live status/outcome via `request.html`'s "My Requests" panel (`watchMyRequests(email, ...)`, scoped client-side by `submittedBy` — the Firestore rule itself is the same blanket authenticated-read as every other internal collection, not a per-document restriction; see `docs/ARCHITECTURE.md` §4.2).

---

## `marketing_actions`

Action items agreed between executive leadership and marketing in meetings, managed entirely from `admin.html`'s "Marketing Actions" tab. Read-only for leadership via the separate `actions.html` page (see `ARCHITECTURE.md` §4.4 for its access model — it deliberately reuses `admin.html`'s exact `role: admin` session rather than getting its own role).

| Field | Type | Notes |
|---|---|---|
| `title` | string | Required — only hard requirement |
| `description` | string | Free text |
| `accountablePerson` | string | Plain free-text, not a `team_members` lookup — action items are often assigned to a role/department ("CEO Office") rather than a directory-listed person. Unrelated to `initiatives.assignedTo`, which *is* a `team_members`-sourced select for a narrower question ("who's producing this content"). |
| `dateAgreed` | string (YYYY-MM-DD) | When leadership agreed to it |
| `meetingContext` | string | Optional, e.g. "Q3 Leadership Sync" |
| `deadline` | string (YYYY-MM-DD) | Drives the "Overdue" treatment — computed client-side (`status !== 'Completed' && deadline < today`), never stored, so it can never go stale |
| `status` | string | One of `ACTION_STATUSES` (`firebase-data.js`): `Not Started`, `In Progress`, `Blocked`, `Completed` |
| `linkedInitiativeId` | string \| null | Raw `initiatives` doc id, or `null` — same convention as `initiatives.parentCampaignId`/`leads.campaignId`. Set either by auto-creating a new initiative at action-creation time, or by linking to an existing one. **No referential integrity** (same already-accepted gap as `leads.campaignId`) — deleting the linked initiative leaves this dangling; both `admin.html` and `actions.html` render an explicit "(deleted)" label rather than silently going blank. |
| `linkedInitiativeTitle` | string \| null | Denormalized display title, same convention as `leads.campaign` next to `campaignId`. The *live* status shown anywhere is always a fresh lookup against `initiatives`, never a stored/denormalized status field, since status changes independently and often. |
| `createdAt` / `updatedAt` | Timestamp | |

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

## `social_comments`

Comments and reviews pulled from Metricool's **Inbox API** — `GET /v2/inbox/post-comments?provider={INSTAGRAMBUSINESS|FACEBOOK|TIKTOKBUSINESS}` for comments and `GET /v2/inbox/reviews?provider=GMB` for Google Business reviews. These are Metricool's own real, documented endpoints (verified directly against their `swagger.json`, not assumed or reverse-engineered) — the same Inbox feature visible in Metricool's own web app, reached through the same CORS proxy Worker and token already used for everything else Metricool in this app. Not scraping: no separate Meta Developer App or App Review was needed.

Doc ID = `${provider}_${sourceCommentOrReviewId}` (deterministic, so re-syncing the same item is a no-op `setDoc` rather than a duplicate).

| Field | Type | Notes |
|---|---|---|
| `provider` | string | One of Metricool's own enum values: `INSTAGRAMBUSINESS`, `FACEBOOK`, `TIKTOKBUSINESS`, `GMB` |
| `type` | string | `comment` or `review` |
| `text` | string | The comment text, or the review's `message` |
| `authorName` | string \| null | From Metricool's `owner` (comments) or first `participants[].name` (reviews) |
| `stars` | number \| null | Google Business reviews only — the star rating, returned by Metricool's `Review.stars` field |
| `postText` | string \| null | The original post's caption, for context — comments only, null for reviews |
| `createdAtRaw` | string \| null | The comment/review's own creation date/time, as returned by Metricool |
| `sentiment` | `positive` \| `neutral` \| `negative` \| null | Set by `admin.html`'s `classifySentiment()` (Claude, `claude-sonnet-4-6`) — never re-computed once set, so re-syncing the same item doesn't re-spend AI tokens on it |
| `sentimentThemes` | array of strings \| null | Up to 2 short lowercase theme tags per item (e.g. `"wait times"`, `"pricing"`), when a clear theme is present |
| `countedInRollup` | boolean | Whether this item has already been added to its month's bucket in `config/sentiment_stats.byMonth` — **deliberately separate from `sentiment` existing.** An item can have a `sentiment` (no AI spend needed on the next sync) while not yet being `countedInRollup` — e.g. anything classified before this field existed. Missing/false on such pre-existing docs, so they get folded into the rollup the next time they're fetched, no manual reset needed. Gating the rollup on `sentiment` instead of this field caused a real incident: every already-classified comment silently disappeared from the monthly totals on the next sync, because none of them still counted as "needs classifying." |
| `syncedAt` | ISO string | When this app last wrote this document |

**Authenticated-only by product decision, not a technical PII rule**: this content was posted publicly, but some of it is patient-adjacent complaints, so it's admin-only and never read by any public page — see `ARCHITECTURE.md`'s security-model notes for the full reasoning.

**Storage/read cost is a non-issue at any realistic volume**: comment text is small (a few hundred bytes each) — even tens of thousands of items stay far under Firestore's free-tier 1 GiB storage cap. The dashboard never queries this collection directly (see `config/sentiment_stats` below); it's read only during sync, to check whether an already-fetched item was already classified (bounded by however many items one sync run fetches, not the collection's full historical size).

## `config/sentiment_stats`

The rollup `admin.html`'s Comment Sentiment section actually reads — kept small and cheap regardless of how large `social_comments` grows, same reasoning as `config/lead_stats`/`config/metricool_stats`, except this one is **authenticated-only**, not public.

```
config/sentiment_stats = {
  byMonth: {
    "2026-09": { positive: number, neutral: number, negative: number, themeCounts: { "wait times": number, ... } },
    "2026-08": { ... },
    ...
  },
  recentComments: [ /* up to 30 social_comments-shaped objects, current calendar month only, negative-first then most-recent-first */ ],
  lastSyncReport: "Instagram (Business): 0 · Instagram: 15 · Facebook: failed (HTTP 403 — ...) · TikTok: 0 · Google Business: 13",
  lastSyncedAt: ISO string,
}
```

**`lastSyncReport`** is the per-platform breakdown from the most recent sync (item count, or the failure reason) — shown persistently under the sync button, not just as a transient toast. Added after a real incident where every platform except Google Business silently returned nothing, with no visible indication of *why* (a per-provider fetch failure was only ever `console.error`'d, invisible to the admin). Currently tries **both** `INSTAGRAM` and `INSTAGRAMBUSINESS` for the Instagram row — Metricool's schema allows either and there was no way to know which this account's connection actually needs without a live sync; once a real sync shows which one returns data, drop the other from `commentChannels` in `fetchInboxItems()`.

**Bucketed by each comment's own real date, not "the month it happened to sync in"** — a sync run just adds whatever it fetched to the month bucket that date actually falls in, and only for items not already counted from an earlier sync (checked per-item against `social_comments`, so re-syncing never double-counts a bucket). This is what makes the admin dashboard's month-over-month percentage comparison possible, mirroring the `byMonth` convention already used by `lead_stats`/`metricool_stats`.

**Coverage caveat, worth knowing**: Metricool's `/v2/inbox/post-comments` and `/v2/inbox/reviews` endpoints document no date-range or page-size parameter (confirmed against their real `swagger.json` — several *other* Metricool endpoints do document `page`/`limit`/`from`/`to` when supported, so this appears to be a genuine gap, not an oversight in reading their docs). `admin.html`'s `fetchInboxItems()` best-effort follows the `page.next` cursor their response includes (bounded by `SENTIMENT_MAX_PAGES`, since it's unconfirmed whether their server actually honors that cursor), but a single sync is **not guaranteed to capture every comment for the current month** — coverage improves by syncing a few times through the month rather than only once at the end. Numbers still roll up correctly either way, since each comment lands in its own real month bucket whenever it's eventually fetched.

Also folded into the Advisor tab's pulse (`buildAdvisorSentimentSummary()` in `admin.html`) as `pulse.sentiment` — `{ positivePct, negativePct, positiveDeltaPts, total, topThemes, lastSyncedAt }`, `positiveDeltaPts` being the percentage-point change vs. the previous month — so the AI briefing can reference it alongside everything else, e.g. "comment sentiment dipped 12pts this month, mostly complaints about wait times."

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
| ~~`admin_passcode`~~ | **Removed** — held the "Magic Word" shared admin-login passcode hash; that login path was retired once every admin had an individual account (`ARCHITECTURE.md` §4.4). The document may still exist in Firestore but has no rule and is read/written by nothing. |
| `advisor_brief` | **Authenticated-only** (never public — lead-derived). The AI-written briefing for `admin.html`'s Advisor tab: `{ json: {headline, whatStandsOut, phoneRoomSignal, recommendations[], watchList[], campaignIdeas[], provocation}, generatedAt, generatedByName, coverageNote }`. One org-wide doc; any admin can regenerate it (overwrites). The pulse it's built from is computed client-side and not stored. Becomes `/orgs/{id}/config/advisor_brief` under multi-tenancy. |
| `sentiment_stats` | **Authenticated-only.** Rollup for the Comment Sentiment section — see its own section above for the full shape. |
| `lead_stats` | **Public-readable** aggregated leads funnel snapshot — written by admin, read by `index.html`. Contains zero PII by design. |
| `department_revenue_estimates` | Per-department average revenue, used as the ROI fallback when actual `leads.revenueValue` isn't entered |
| `metricool_settings` | Metricool API token + userId/blogId (⚠️ stored here, visible client-side — same tradeoff as `ai_settings`, see `ARCHITECTURE.md` §4). Needs an authenticated-only Firestore rule, same sensitivity class as `ai_settings`. |
| `metricool_stats` | **Public-readable** synced social performance series — written by `admin.html`'s "Sync Now" action, read by `index.html`. Contains zero PII by design (aggregate public social numbers only). See the `config/metricool_stats` series structure section above. Needs a public-read/authenticated-write Firestore rule, same pattern as `lead_stats`. |
| `analytics_settings` | `{ measurementId }` — Google Analytics (GA4) Measurement ID for `landing.html`. **Public-readable**, unlike `ai_settings`/`metricool_settings` above — a Measurement ID isn't a secret, it's meant to sit in every page's visible HTML by design. `landing.html` only loads the GA script after the visitor accepts a cookie-consent banner (choice stored in that browser's `localStorage`, never sent anywhere) — see `docs/ARCHITECTURE.md` §4.6. Empty/missing means Landing Pages stay tracking-free. |

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

landing_pages (slug = doc ID)
  ├── campaignId → initiatives (type=Campaign)      [denormalized campaignTitle, for attribution]
  └── leads (landingPageId → landing_pages)         [every submission this page generated]

team_members
  └── authUid → Firebase Auth user → roles/{uid}   [login account, if granted]

entities.name
  ├── referenced by initiatives.entity[]
  ├── referenced by bd_cards.entity
  └── referenced by promotions.entity[]              [⚠️ legacy collection, see above]

marketing_actions
  └── initiatives (linkedInitiativeId → initiative)   [optional, admin-managed]

offers_catalog (branch slug = doc ID)
  └── config/offers_catalog_meta                      [lists which branch docs exist]

social_comments (provider_sourceId = doc ID)
  └── config/sentiment_stats                          [rollup the dashboard/Advisor actually read]
```

None of these relationships are enforced by Firestore itself — every "reference" is just a string ID or name stored on the child document, validated only by application code at write time. A real relational (or rigorously-validated document) database would be a meaningful reliability improvement in any SaaS rebuild.
