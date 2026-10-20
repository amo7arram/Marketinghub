// ── Shared lead-import engine ──────────────────────────────────────────────
// Used by admin.html (manual Excel / Google Sheet import AND the automatic
// sync) and call-center.html (automatic sync), so every page that imports
// leads runs the SAME parsing, column detection, dedupe and assignment code.
// Nothing in here talks to Firebase directly: the automatic sync receives its
// reads/writes as injected functions (see runLeadSync), which keeps it
// unit-testable and keeps `firebase-data.js` the only place that touches
// Firestore. (It does import two pure helpers from firebase-data.js.)

import { DEPARTMENTS, normalizePhone } from './firebase-data.js';

// ── Tunables for the automatic sync ───────────────────────────────────────
export const SYNC_OVERLAP_MS = 30 * 60 * 1000;   // re-examine the last 30 min each run, so a row that lands late in the sheet isn't missed
export const SYNC_MAX_PER_RUN = 300;             // runaway guard: never import more than this in one run
export const PRESENCE_FRESH_MS = 3 * 60 * 1000;  // an agent counts as "online" if seen in the last 3 minutes
export const SYNC_ASSIGN_BACKLOG_MAX = 100;      // unassigned auto-imported leads picked up per run
export const SAME_SUBMISSION_DAYS = 2;           // a legacy lead (no source row id) this close in date to a row is treated as the same submission

// ══ CSV ════════════════════════════════════════════════════════════════════
// A real CSV reader: quoted fields may contain commas, doubled quotes ("")
// and LINE BREAKS (a lead-form free-text answer can), none of which the old
// line-split parser survived — fine while an admin watched the preview, not
// OK for an unattended sync that would turn one multi-line answer into
// garbage rows.
export function parseCSVRecords(text) {
  const s = String(text || '').replace(/^﻿/, '');
  const rows = [];
  let row = [], cur = '', inQ = false;
  for(let i = 0; i < s.length; i++) {
    const ch = s[i];
    if(inQ) {
      if(ch === '"') { if(s[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += ch;
    } else if(ch === '"') inQ = true;
    else if(ch === ',') { row.push(cur); cur = ''; }
    else if(ch === '\n' || ch === '\r') {
      if(ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cur); cur = ''; rows.push(row); row = [];
    } else cur += ch;
  }
  if(cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

// → array of { header: value } objects (values trimmed), blank lines skipped.
export function parseCSVText(text) {
  const recs = parseCSVRecords(text).filter(r => r.some(c => String(c).trim() !== ''));
  if(recs.length < 2) return [];
  const headers = recs[0].map(h => String(h).trim());
  return recs.slice(1).map(r => {
    const o = {};
    headers.forEach((h, idx) => { o[h] = String(r[idx] ?? '').trim(); });
    return o;
  });
}

// ══ Dates ══════════════════════════════════════════════════════════════════
// Robust Excel date parser — handles ISO strings, DD/MM/YYYY, MM/DD/YYYY,
// JS Date objects, and raw Excel serial numbers (the common causes of a
// date column silently failing to import).
export function parseExcelDate(raw) {
  if (!raw) return '';
  if (raw instanceof Date && !isNaN(raw)) {
    // Use local date components, not toISOString() — toISOString() converts
    // to UTC first, which silently shifts the date back a day for anyone in
    // a timezone ahead of UTC (e.g. Asia/Riyadh, UTC+3).
    return `${raw.getFullYear()}-${String(raw.getMonth()+1).padStart(2,'0')}-${String(raw.getDate()).padStart(2,'0')}`;
  }
  const s = String(raw).trim();
  if (!s) return '';
  // Already ISO: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0,10);
  // Raw Excel serial number (days since 1899-12-30) — this Date is
  // constructed directly from a computed UTC timestamp, so UTC getters are
  // correct here (no local-timezone shift risk, unlike the branches above/below).
  if (/^\d{4,6}(\.\d+)?$/.test(s)) {
    const serial = parseFloat(s);
    const date = new Date(Math.round((serial - 25569) * 86400 * 1000));
    if (!isNaN(date)) return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}-${String(date.getUTCDate()).padStart(2,'0')}`;
  }
  // DD/MM/YYYY or DD-MM-YYYY — 4-digit year only, deliberately.
  let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    if (parseInt(d) <= 31 && parseInt(mo) <= 12) {
      return `${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`;
    }
  }
  // A 2-digit-year date (e.g. "8/19/01") is genuinely ambiguous — never guess
  // a century. Real incident: this silently fell through to the browser's
  // native Date parser below, which read "01" as 2001 instead of 2026,
  // corrupting 241 leads' dates by 25 years. Flag as unparsed instead so it's
  // caught in the import preview ("not parsed", shown in red) before import.
  if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2}$/.test(s)) return '';
  // No 4-digit year anywhere in the string at all (e.g. "19-Aug", a real
  // incident caused by a source cell formatted with Excel's "d-mmm" style,
  // which drops the year from the displayed text entirely). new Date() below
  // would silently default a missing year to 2001 rather than erroring —
  // reject instead of guessing, same reasoning as the 2-digit-year case above.
  if (!/\d{4}/.test(s)) return '';
  // Fallback: let the browser try, for any remaining genuinely date-like text
  const parsed = new Date(s);
  if (!isNaN(parsed)) return `${parsed.getFullYear()}-${String(parsed.getMonth()+1).padStart(2,'0')}-${String(parsed.getDate()).padStart(2,'0')}`;
  return '';
}

// A timestamp in ms, but ONLY when the value really carries a time of day
// ("2026-09-20T05:59:58-05:00"). A bare date can't order rows within a day,
// so it returns null and the row is judged by its other dedupe keys instead.
export function parseRowTimeMs(raw) {
  const s = String(raw ?? '').trim();
  if(!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(s)) return null;
  const ms = Date.parse(s.replace(' ', 'T'));
  return Number.isFinite(ms) ? ms : null;
}

// The calendar date in Saudi time. The sheet's timestamps carry their own
// UTC offset (Meta's are -05:00), and reading the first 10 characters of that
// string would put an evening-in-Riyadh lead on the wrong day.
export function riyadhDate(ms) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}

// ══ Departments / status ═══════════════════════════════════════════════════
// Matches a raw department string from the sheet to our canonical
// DEPARTMENTS spelling, case-insensitively. Returns null if no match.
export function matchDepartment(raw) {
  if (!raw) return null;
  const clean = String(raw).trim().toLowerCase();
  const found = DEPARTMENTS.find(d => d.toLowerCase() === clean);
  if (found) return found;
  // Loose partial match as a second attempt (e.g. "ortho" → "Orthopedics")
  const partial = DEPARTMENTS.find(d => d.toLowerCase().includes(clean) || clean.includes(d.toLowerCase()));
  return partial || null;
}

export function mapLeadStatus(raw) {
  const r = String(raw).toLowerCase().trim();
  if(r.includes('book'))                          return { contactStatus:'Reached',   outcome:'Booked' };
  if(r.includes('open')||r.includes('file'))       return { contactStatus:'Reached',   outcome:'Open File' };
  if(r.includes('close')||r.includes('unsuccess')) return { contactStatus:'Reached',   outcome:'Closed - Unsuccessful' };
  if(r.includes('unreach')||r.includes('no answer'))return{ contactStatus:'Unreached', outcome:'Pending' };
  if(r.includes('miss'))                           return { contactStatus:'Missed',    outcome:'Pending' };
  if(r.includes('reach'))                          return { contactStatus:'Reached',   outcome:'Pending' };
  return { contactStatus:'Untouched', outcome:'Pending' };
}

// ══ Column detection — shared by Excel upload, Google Sheet import, auto-sync ══
// Both import paths accept raw exports from Meta Lead Ads (synced via
// Zapier/Make into a Google Sheet, or downloaded as Excel), which name each
// column after the literal question text configured inside the lead form —
// often Arabic, and varying form-to-form — not a fixed English field name.
// Keyword matching alone can't reliably find name/phone/email against that,
// so content-sniffing (does the column's actual data look like an email or
// a phone number?) is the real fallback. Internal Meta bookkeeping columns
// are recognized by name so they're never mistaken for a real answer.
export const META_SYSTEM_COLUMNS = new Set([
  'id','created_time','ad_id','ad_name','adset_id','adset_name',
  'campaign_id','campaign_name','form_id','form_name','is_organic','lead_status'
]);

// Finds the first header containing any of `keywords` (case-insensitive
// substring). Columns ending in "_id" are never matched — an ID column is
// never the human-facing field we want for name/phone/email/source/etc.
// `exclude` additionally rules out specific columns by exact name — needed
// because Meta's own bookkeeping columns (ad_name, adset_name, form_name)
// all contain the substring "name" and would otherwise win over the real
// name column before an Arabic keyword ever gets a chance to match.
export function findColByKeywords(headers, keywords, exclude = new Set()) {
  const candidates = headers.filter(h => !/_id$/i.test(h.trim()) && !exclude.has(h));
  const lower = candidates.map(h => h.toLowerCase());
  for (const kw of keywords) {
    const idx = lower.findIndex(h => h.includes(kw));
    if (idx !== -1) return candidates[idx];
  }
  return null;
}

// Guesses which column holds email/phone by sampling actual cell values,
// for when keyword matching finds nothing (e.g. an Arabic-only header).
// Requires >50% of a column's non-empty values to match to be confident.
export function sniffColumnByContent(headers, rows, exclude, test) {
  let best = null, bestScore = 0;
  for (const h of headers) {
    if (exclude.has(h)) continue;
    const vals = rows.map(r => String(r[h] ?? '').trim()).filter(Boolean);
    if (!vals.length) continue;
    const score = vals.filter(test).length / vals.length;
    if (score > 0.5 && score > bestScore) { best = h; bestScore = score; }
  }
  return best;
}

export function detectLeadColumns(headers, rows) {
  const used = new Set();
  const claim = col => { if (col) used.add(col); return col; };
  const sniffExclude = () => new Set([...used, ...headers.filter(h => META_SYSTEM_COLUMNS.has(h))]);

  const nameCol      = claim(findColByKeywords(headers, ['name','اسم'], META_SYSTEM_COLUMNS));
  const phoneCol      = claim(findColByKeywords(headers, ['phone','mobile','number','هاتف','جوال','موبايل'], META_SYSTEM_COLUMNS)
                          || sniffColumnByContent(headers, rows, sniffExclude(), v => { const d = v.replace(/\D/g,''); return d.length >= 7 && d.length <= 15; }));
  const emailCol      = claim(findColByKeywords(headers, ['email','ايميل','إيميل','بريد'], META_SYSTEM_COLUMNS)
                          || sniffColumnByContent(headers, rows, sniffExclude(), v => v.includes('@')));
  const platformCol   = claim(findColByKeywords(headers, ['platform'], META_SYSTEM_COLUMNS));
  const sourceCol      = platformCol || claim(findColByKeywords(headers, ['source'], META_SYSTEM_COLUMNS));
  const dateCol        = claim(findColByKeywords(headers, ['date'], META_SYSTEM_COLUMNS) || (headers.includes('created_time') ? 'created_time' : null));
  const statusCol      = claim(findColByKeywords(headers, ['status'], META_SYSTEM_COLUMNS));
  const deptCol        = claim(findColByKeywords(headers, ['department','dept'], META_SYSTEM_COLUMNS));
  const entityCol      = claim(findColByKeywords(headers, ['entity','branch'], META_SYSTEM_COLUMNS));
  const notesCol       = claim(findColByKeywords(headers, ['note','comment','notes'], META_SYSTEM_COLUMNS));
  // Deliberately no META_SYSTEM_COLUMNS exclusion here — campaign_name is
  // the one Meta bookkeeping field worth surfacing as a real value (the
  // ad campaign's human-readable name), unlike ad_name/adset_name/form_name.
  const campaignCol    = claim(findColByKeywords(headers, ['campaign']));

  // Anything left — e.g. a lead form's custom questions — isn't a column we
  // recognize but isn't Meta bookkeeping either. Carried into notes below
  // rather than silently dropped.
  const leftoverCols = headers.filter(h => !used.has(h) && !META_SYSTEM_COLUMNS.has(h));

  return { nameCol, phoneCol, emailCol, sourceCol, isPlatformSource: !!platformCol, dateCol, statusCol, deptCol, entityCol, notesCol, campaignCol, leftoverCols };
}

// ig/fb are Meta's own shorthand for where the lead form was shown — only
// applied when the detected source column really was "platform" (Meta's
// field), never to a genuinely free-typed Source column, where blank should
// stay blank rather than being overwritten with a guess.
export function normalizeLeadSource(raw, isPlatformSource) {
  const val = String(raw || '').trim();
  if (!isPlatformSource) return val;
  const lower = val.toLowerCase();
  if (lower === 'ig') return 'Instagram';
  if (lower === 'fb') return 'Facebook';
  return val || 'Meta';
}

// Appends any unrecognized columns (a lead form's custom questions) onto
// notes as "Question: Answer" pairs, so they're preserved instead of
// silently dropped — necessary because custom questions vary form-to-form
// and can't be mapped to a fixed field. Underscores are replaced with
// spaces in both the question and the answer — Meta's export encodes
// spaces as underscores in predefined multiple-choice answer text the same
// way it does in column headers, not just the header.
export function buildLeadNotesWithLeftover(row, leftoverCols, existingNotes) {
  const clean = s => String(s ?? '').trim().replace(/_/g, ' ');
  const qa = leftoverCols
    .map(col => { const val = clean(row[col]); return val ? `${clean(col)}: ${val}` : null; })
    .filter(Boolean);
  return [existingNotes, ...qa].map(s => (s||'').trim()).filter(Boolean).join('\n');
}

// ══ Automatic sync ═════════════════════════════════════════════════════════

// Turns the sheet's text into candidate leads (not yet filtered or saved).
// Automatic imports always create NEW leads: Untouched / Pending, whatever a
// sheet's own status column says.
export function buildCandidates(csvText) {
  const rows = parseCSVText(csvText);
  if(!rows.length) return { candidates: [], columns: null, error: 'No rows found in the sheet' };
  const headers = Object.keys(rows[0]);
  const c = detectLeadColumns(headers, rows);
  if(!c.nameCol || !c.phoneCol) return { candidates: [], columns: c, error: 'Could not find Name or Phone columns in the sheet' };
  const idCol = headers.find(h => h.toLowerCase() === 'id') || null;
  const timeCol = headers.find(h => h.toLowerCase() === 'created_time') || c.dateCol || null;
  const hintCols = headers.filter(h => ['form_name', 'ad_name', 'adset_name', 'campaign_name'].includes(h.toLowerCase()));
  const candidates = rows.map(r => {
    const rowTimeMs = timeCol ? parseRowTimeMs(r[timeCol]) : null;
    return {
      rowId: idCol ? (r[idCol] || '') : '',
      rowTimeMs,
      name: r[c.nameCol] || '',
      phone: normalizePhone(r[c.phoneCol]),
      email: c.emailCol ? (r[c.emailCol] || '') : '',
      source: c.sourceCol ? normalizeLeadSource(r[c.sourceCol], c.isPlatformSource) : '',
      entity: c.entityCol ? (r[c.entityCol] || '') : '',
      sheetDate: c.dateCol ? parseExcelDate(r[c.dateCol]) : '',
      notes: buildLeadNotesWithLeftover(r, c.leftoverCols, c.notesCol ? (r[c.notesCol] || '') : ''),
      department: matchDepartment(c.deptCol ? r[c.deptCol] : ''),
      campaignName: c.campaignCol ? (r[c.campaignCol] || '') : '',
      hint: hintCols.map(h => r[h] ? `${h.replace(/_/g, ' ')}: ${r[h]}` : '').filter(Boolean).join(' | '),
    };
  });
  return { candidates, columns: c, error: '' };
}

const digitsOnly = p => String(p || '').replace(/\D/g, '');
const dayNumber = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? Math.floor(Date.UTC(+m[1], +m[2]-1, +m[3]) / 86400000) : null; };

// Which candidates are genuinely new. Rules, in order:
//  1. no name/phone → skip
//  2. older than the cutoff (start-from time, or last-seen watermark minus the
//     overlap) → skip. This is what stops a lead you deleted from being
//     re-imported on the next run, and stops a first run swallowing history.
//  3. its sheet row id is already on a lead (sourceRowId) → skip
//  4. a LEGACY lead (imported before row ids were stored, so it has none) with
//     the same phone + campaign and a date within SAME_SUBMISSION_DAYS → skip:
//     that is almost certainly the same submission imported by hand
//  5. for rows with no id at all: same phone + campaign as any lead → skip
//  6. duplicated inside the sheet itself → keep the first
// A returning patient who submits again later (new row id) is NOT skipped —
// each submission is a real interaction and the cost of a missed hot lead is
// higher than a second record (Contact History groups them by phone).
export function selectEligible(candidates, existingLeads, opts = {}) {
  const cutoffMs = opts.cutoffMs || 0;
  const campaignIdFor = opts.campaignIdFor || (() => null);
  const skipped = { noContact: 0, tooOld: 0, dupRowId: 0, dupLegacy: 0, dupPair: 0, dupInSheet: 0 };
  const knownRowIds = new Set();
  const byPair = new Map(); // phone__campaign -> [lead]
  (existingLeads || []).forEach(l => {
    if(l.sourceRowId) knownRowIds.add(String(l.sourceRowId));
    const key = `${digitsOnly(l.phone)}__${l.campaignId || ''}`;
    if(!byPair.has(key)) byPair.set(key, []);
    byPair.get(key).push(l);
  });
  const seenInSheet = new Set();
  const eligible = [];
  candidates.forEach(r => {
    if(!r.name || !r.phone) { skipped.noContact++; return; }
    if(r.rowTimeMs != null && r.rowTimeMs < cutoffMs) { skipped.tooOld++; return; }
    if(r.rowId && knownRowIds.has(String(r.rowId))) { skipped.dupRowId++; return; }
    const campaignId = campaignIdFor(r) || '';
    const pair = `${digitsOnly(r.phone)}__${campaignId}`;
    const sameKey = byPair.get(pair) || [];
    if(r.rowId) {
      const rowDay = r.rowTimeMs != null ? dayNumber(riyadhDate(r.rowTimeMs)) : dayNumber(r.sheetDate);
      const legacyHit = sameKey.some(l => {
        if(l.sourceRowId) return false;
        const ld = dayNumber(l.dateCreated);
        return rowDay == null || ld == null || Math.abs(ld - rowDay) <= SAME_SUBMISSION_DAYS;
      });
      if(legacyHit) { skipped.dupLegacy++; return; }
    } else if(sameKey.length) { skipped.dupPair++; return; }
    const sheetKey = r.rowId ? `id:${r.rowId}` : `pair:${pair}`;
    if(seenInSheet.has(sheetKey)) { skipped.dupInSheet++; return; }
    seenInSheet.add(sheetKey);
    r._campaignId = campaignId || null;
    eligible.push(r);
  });
  return { eligible, skipped };
}

// ── Assignment ────────────────────────────────────────────────────────────
// "Online" = seen within the last PRESENCE_FRESH_MS, and not excluded by the
// admin. Names come from the admin-maintained directory (agents can't read
// team_members), falling back to whatever the presence record carries.
export function eligibleAgents(presence, cfg, nowMs) {
  const exclude = new Set((cfg && cfg.excludedAgentUids) || []);
  const dir = new Map(((cfg && cfg.agentDirectory) || []).map(a => [a.uid, a.name]));
  return (presence || [])
    .filter(p => p && p.uid && !exclude.has(p.uid) && nowMs - (p.lastSeen || 0) <= PRESENCE_FRESH_MS)
    .map(p => ({ uid: p.uid, name: dir.get(p.uid) || p.name || 'Agent' }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Fewest untouched leads first (the person most free to call right now),
// updated as each lead is handed out so a batch spreads evenly. Ties go to
// name order for determinism. Honours an optional cap per agent.
export function planAssignments(agents, existingLeads, items, cfg) {
  const plan = new Map();
  if(!agents.length || !items.length) return plan;
  const cap = Number(cfg && cfg.maxUntouchedPerAgent) > 0 ? Number(cfg.maxUntouchedPerAgent) : Infinity;
  const counts = {};
  agents.forEach(a => { counts[a.uid] = 0; });
  (existingLeads || []).forEach(l => {
    if(l.assignedAgentUid in counts && (l.contactStatus || 'Untouched') === 'Untouched') counts[l.assignedAgentUid]++;
  });
  items.forEach(item => {
    let best = null;
    agents.forEach(a => { if(counts[a.uid] < cap && (best === null || counts[a.uid] < counts[best.uid])) best = a; });
    if(!best) return; // everyone is at the cap — leave unassigned, picked up later
    counts[best.uid]++;
    plan.set(item.key, best);
  });
  return plan;
}

// ── Lead document ─────────────────────────────────────────────────────────
// Only keys that have a value are included (Firestore rejects `undefined`).
// The field set is mirrored in firestore.rules' agent-create whitelist.
export function buildLeadDoc(r, cfg, nowMs) {
  const doc = {
    name: r.name, phone: r.phone, email: r.email || '',
    source: r.source || '',
    entity: r.entity || cfg.defaultEntity || '',
    dateCreated: r.rowTimeMs != null ? riyadhDate(r.rowTimeMs) : (r.sheetDate || riyadhDate(nowMs)),
    contactStatus: 'Untouched', outcome: 'Pending',
    notes: r.notes || '',
    department: r.department || cfg.defaultDepartment || '',
    campaign: r.campaignName || '',
    campaignId: r._campaignId || null,
    autoImported: true, autoImportedAt: nowMs,
  };
  if(r.rowId) doc.sourceRowId = String(r.rowId);
  if(r.departmentSource) doc.departmentSource = r.departmentSource;
  if(r._pending) { doc.deptPending = true; if(r.hint) doc.sourceHint = String(r.hint).slice(0, 400); }
  return doc;
}

// ── The sync itself ───────────────────────────────────────────────────────
// d (all injected): { config, now, watermarkMs, fetchCsv(url), leads[], initiatives[],
//   presence[], addLeads(docs), updateLead(id, data), classify?(rows) }
// Returns { result, watermarkMs }. `classify` exists only where an API key is
// readable (the admin page); elsewhere leads that needed the AI are marked
// deptPending and swept later by an admin session.
export async function runLeadSync(d) {
  const cfg = d.config || {};
  const now = d.now;
  const result = { startedAt: now, sheetRows: 0, imported: 0, assignedNew: 0, assignedBacklog: 0, classified: 0, pendingDept: 0,
                   skipped: {}, capped: false, agentsOnline: 0, error: '' };
  if(!cfg.sheetUrl) { result.error = 'No sheet link is set'; return { result, watermarkMs: d.watermarkMs }; }

  const csv = await d.fetchCsv(cfg.sheetUrl);
  const parsed = buildCandidates(csv);
  if(parsed.error) { result.error = parsed.error; return { result, watermarkMs: d.watermarkMs }; }
  result.sheetRows = parsed.candidates.length;

  const cutoffMs = Math.max(cfg.startFromMs || 0, d.watermarkMs ? d.watermarkMs - SYNC_OVERLAP_MS : 0);
  const campaigns = (d.initiatives || []).filter(i => i.type === 'Campaign');
  const campaignIdFor = r => {
    const t = String(r.campaignName || '').trim().toLowerCase();
    if(!t) return null;
    const hit = campaigns.find(c => String(c.title || '').trim().toLowerCase() === t);
    return hit ? hit.id : null;
  };
  const sel = selectEligible(parsed.candidates, d.leads, { cutoffMs, campaignIdFor });
  result.skipped = sel.skipped;

  let eligible = sel.eligible.slice().sort((a, b) => (a.rowTimeMs ?? 0) - (b.rowTimeMs ?? 0));
  if(eligible.length > SYNC_MAX_PER_RUN) { eligible = eligible.slice(0, SYNC_MAX_PER_RUN); result.capped = true; }

  // Department: a sheet column always wins; otherwise the AI where this page can run it.
  const needDept = eligible.filter(r => !r.department);
  if(needDept.length && cfg.classifyWithAI) {
    if(d.classify) { await d.classify(needDept); }
    else needDept.forEach(r => { r._aiFailed = true; });
    needDept.forEach(r => { if(r.department) result.classified++; else if(r._aiFailed) { r._pending = true; result.pendingDept++; } });
  }

  const docs = eligible.map(r => buildLeadDoc(r, cfg, now));

  // Assignment: fresh leads first, then any earlier auto-imported leads still waiting for someone.
  let assignedBacklog = [];
  const agents = cfg.autoAssign ? eligibleAgents(d.presence, cfg, now) : [];
  result.agentsOnline = agents.length;
  if(agents.length) {
    const backlog = (d.leads || [])
      .filter(l => l.autoImported && !l.assignedAgentUid && (l.contactStatus || 'Untouched') === 'Untouched')
      .sort((a, b) => (a.autoImportedAt || 0) - (b.autoImportedAt || 0))
      .slice(0, SYNC_ASSIGN_BACKLOG_MAX);
    const items = [...backlog.map(l => ({ key: 'e:' + l.id })), ...docs.map((_, i) => ({ key: 'n:' + i }))];
    const plan = planAssignments(agents, d.leads, items, cfg);
    docs.forEach((doc, i) => { const a = plan.get('n:' + i); if(a) { doc.assignedAgentUid = a.uid; doc.assignedAgentName = a.name; result.assignedNew++; } });
    assignedBacklog = backlog.map(l => ({ l, a: plan.get('e:' + l.id) })).filter(x => x.a);
  }

  if(docs.length) await d.addLeads(docs);
  for(const { l, a } of assignedBacklog) { await d.updateLead(l.id, { assignedAgentUid: a.uid, assignedAgentName: a.name }); result.assignedBacklog++; }
  result.imported = docs.length;

  // Watermark: newest row time seen. If we hit the per-run cap, only advance as
  // far as what we actually imported, so the rest is picked up next time.
  const times = (result.capped ? eligible : parsed.candidates).map(r => r.rowTimeMs).filter(t => t != null);
  const wm = times.length ? Math.max(...times, d.watermarkMs || 0) : (d.watermarkMs || 0);
  return { result, watermarkMs: wm || d.watermarkMs };
}

// ── Scheduler ─────────────────────────────────────────────────────────────
// One per page. Ticks every minute; a Firestore lease (acquireLock) makes sure
// only one browser actually syncs at a time, and `minIntervalMs` is re-checked
// inside that transaction, so ten open tabs don't mean ten syncs a minute.
//   force=true  → page just opened / an agent just came online: skip the long
//                 interval (still honours a 30s floor so a burst of page loads
//                 doesn't hammer the sheet).
export function createLeadAutomationRunner(o) {
  const runnerId = o.runnerId || Math.random().toString(36).slice(2, 10);
  const nowFn = o.now || (() => Date.now());
  let timer = null, running = false, visHandler = null;

  async function tick(force = false) {
    const cfg = o.getCfg();
    if(!cfg || !cfg.enabled || !cfg.sheetUrl) return { skipped: 'disabled' };
    if(running) return { skipped: 'running' };
    // SAFETY: never run before the page has finished loading the existing leads
    // and campaigns. With an empty "existing leads" list every row in the sheet
    // would look new and the whole sheet would be imported a second time.
    if(o.isReady && !o.isReady()) return { skipped: 'not-ready' };
    const intervalMs = Math.min(30, Math.max(1, Number(cfg.intervalMinutes) || 2)) * 60000;
    const minIntervalMs = force ? 30000 : Math.round(intervalMs * 0.9);
    const state = o.getState() || {};
    if(state.lastRunAt && nowFn() - state.lastRunAt < minIntervalMs) return { skipped: 'recent' };
    running = true;
    try {
      const lock = await o.acquireLock({ runnerId, name: o.who(), page: o.page, leaseMs: 180000, minIntervalMs });
      if(!lock.acquired) return { skipped: lock.reason };
      let out;
      try {
        // A watermark belongs to the sheet it was measured on — a different sheet starts fresh.
        const st = lock.state || {};
        out = await runLeadSync(o.buildDeps({ ...st, watermarkMs: st.watermarkSheet === cfg.sheetUrl ? (st.watermarkMs || 0) : 0 }, cfg));
      } catch(e) {
        out = { result: { startedAt: nowFn(), error: e.message || String(e), imported: 0, assignedNew: 0, assignedBacklog: 0, skipped: {} }, watermarkMs: undefined };
      }
      out.result.runBy = o.who(); out.result.runPage = o.page;
      await o.finishRun({ runnerId, result: out.result, watermarkMs: out.watermarkMs, watermarkSheet: cfg.sheetUrl });
      if(o.onRun) o.onRun(out.result);
      return { ran: true, result: out.result };
    } finally { running = false; }
  }

  return {
    runnerId, tick,
    start() {
      if(timer) return;
      timer = setInterval(() => { tick(false).catch(() => {}); }, 60000);
      if(typeof document !== 'undefined') {
        visHandler = () => { if(document.visibilityState === 'visible') tick(false).catch(() => {}); };
        document.addEventListener('visibilitychange', visHandler);
      }
      tick(true).catch(() => {});
    },
    stop() {
      if(timer) { clearInterval(timer); timer = null; }
      if(visHandler && typeof document !== 'undefined') { document.removeEventListener('visibilitychange', visHandler); visHandler = null; }
    },
    isRunning: () => running,
  };
}
