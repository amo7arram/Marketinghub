# Roadmap — Technical Debt, Refactoring Plan, and SaaS Path

**Last updated:** August 2026

This document is intentionally honest rather than aspirational. It separates what should happen soon, what's a larger planned effort, and what's genuinely far off with no committed timeline.

---

## Priority 1 — Near-term stability (worth doing regardless of SaaS plans)

These reduce the regression risk we've already hit multiple times in this project's history:

1. **Delete `inject-promotions.html` from the live repo.** It was a one-time seed script, already used. Leaving dev tools in a production deployment is unnecessary risk.
2. **Rotate the Anthropic API key periodically** given it's visible to anyone with admin browser access — not a code fix, an operational habit.
3. **Reconsider the "Magic Word" passcode** before wider team rollout — it's a reasonable transitional convenience, not a permanent access pattern for a growing team.
4. **Establish a lightweight verification habit before every upload:** run a syntax check and confirm every import resolves before shipping a change. (This is now standard practice going forward, and should stay standard practice regardless of who or what is making changes.)

---

## Priority 2 — ES Module Split (proposed, not yet executed)

### Why

`admin.html` has grown past ~4,700 lines and `index.html` past ~2,000, both as single files mixing markup, styling, and all JavaScript logic. This is the direct cause of several bugs in this project's history — most notably, repeated instances of a `str_replace` edit accidentally deleting an unrelated code comment used as an anchor, because everything lives in one undifferentiated block. Splitting into focused modules, each responsible for one feature domain, makes future changes safer because an edit to the Leads module physically cannot touch Budget module code.

### Proposed structure

No build tool required — this uses native ES modules, which the codebase already relies on for `firebase-data.js` imports. Browsers load these directly via `<script type="module">`.

```
/js/
  firebase-data.js              (unchanged — the shared data layer)
  shared/
    ui-helpers.js                Toast notifications, modal open/close, chip toggles,
                                  pagination helpers — used across every admin module
    auth-guard.js                The login/role-check pattern, currently duplicated
                                  near-identically across admin.html, call-center.html,
                                  and request.html
  admin/
    activities.js                Activities CRUD, type switching, Campaign drilldown
    campaign-generator.js
    leads.js                     Leads CRM: table, filters, import (Excel + Sheet),
                                  bulk actions, contact history
    budget.js
    business-dev.js
    programs.js                  Well-span + Loyalty admin CRUD
    settings.js                  Entities, Team Members, Revenue Estimates, Access
                                  Gate, Passcode, Brand Voice
    metrics.js
  public/
    dashboard.js
    calendar.js
    campaigns-events.js
    programs-public.js
    leads-dashboard.js
    resources.js
```

`admin.html` and `index.html` become thin shells: the HTML markup stays where it is, and each `<script type="module">` block is replaced with a small bootstrap that imports the relevant feature modules and wires up whatever global handlers the inline `onclick` attributes still need (or, better, migrates those to proper `addEventListener` calls during the same pass — inline `onclick` handlers are themselves a minor tech debt item worth clearing while touching this code).

### Migration approach — staged, not a rewrite

Given this touches a live system actual staff use daily, this should **not** be attempted as one large change:

1. **Pilot on one self-contained module first** — Settings is a good candidate: it's relatively isolated, lower-traffic than Leads or Activities, and would validate the whole pattern (file structure, import wiring, verification process) before committing to the full split.
2. **Verify thoroughly after the pilot** — same process already in use (syntax check, cross-reference every import against every export, manual click-through) — before moving to the next module.
3. **One module at a time after that**, each as its own isolated, revertible change. Never batch multiple module extractions into one upload.
4. **Leads and Activities last** — they're the highest-traffic, highest-complexity modules; do them once the pattern is proven safe on lower-stakes code.

**This has not been started.** It should only begin with an explicit go-ahead, given the risk profile of refactoring a live system.

---

## Priority 3 — SaaS Migration Considerations (no timeline)

This section exists so that whenever this becomes a real initiative, the considerations aren't being discovered for the first time. It is deliberately not a project plan — there isn't one yet.

### What fundamentally has to change

- **A real backend.** Client-side Firestore rules and client-side AI API calls are acceptable for one trusted internal team; they are not acceptable for a multi-customer product. AI generation, sensitive business logic, and user/account management need to move server-side.
- **Multi-tenancy.** Every collection in `DATA_MODEL.md` currently assumes a single organization (IMC). A SaaS version needs a `tenantId`/`organizationId` on every document, tenant-scoped Firestore rules (or a different database entirely — see below), and a real onboarding flow that provisions a new tenant's initial data rather than assuming IMC's hardcoded defaults.
- **White-labeling.** IMC's branding, colors, logo, and default Brand Voice are currently hardcoded throughout the UI. A SaaS product needs these to be per-tenant configuration, not code.
- **Billing.** Subscription management, plan tiers, feature gating — none of this exists yet in any form.
- **Real authorization, not rules-based approximation.** The current three-role model (admin/agent/coordinator) is appropriate for one internal team. A multi-tenant product needs proper per-organization role management, likely with more granular permissions than three fixed roles.
- **Data privacy & compliance.** This system holds patient-adjacent lead data (names, phone numbers, health department interest) for a healthcare organization. Any SaaS version selling to other healthcare organizations needs a real compliance review — this is a materially higher bar than an internal tool.
- **Testing infrastructure.** Nothing in `Priority 1/2` requires automated tests to be safe for one internal team with careful manual verification. Selling this as a product to others does require it.
- **Scalability of the current data patterns.** Firestore's real-time listeners work well at IMC's current data volume. Multi-tenant, multi-customer scale would need a hard look at query patterns, indexing, and whether Firestore remains the right database at all versus a system designed for relational integrity (see `DATA_MODEL.md`'s note on the lack of enforced relationships — this becomes a bigger problem at scale, not a smaller one).

### What doesn't need to change

The feature set itself — campaign planning, AI content generation, lead funnel tracking, attribution, budget management — is a genuinely strong, coherent product concept for the healthcare marketing niche specifically. The `FEATURES.md` inventory is a reasonable starting spec for a V1 SaaS feature set. The problem to solve later is infrastructure and multi-tenancy, not "what should the product do."

---

## How to use this document going forward

Update `DATA_MODEL.md` and `FEATURES.md` whenever a feature is added or changed — they should never drift out of sync with the live system. This `ROADMAP.md` should be revisited whenever there's real appetite to act on Priority 2 or begin seriously scoping Priority 3, rather than left as a one-time artifact.
