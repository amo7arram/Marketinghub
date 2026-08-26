// ── IMC Marketing Strategy 2026 — Shared Firebase Data Layer ──────────────
// Used by both admin.html and the public portal.
// This module centralizes Firebase init + Firestore read/write helpers
// so both pages always talk to the data the same way.

import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, doc, addDoc, updateDoc, deleteDoc, getDoc, setDoc,
  getDocs, onSnapshot, query, where, Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDLktYF2OOJ4XSF666eMuh2QGjropF-zfQ",
  authDomain: "imc-marketing-strategy-2-6905e.firebaseapp.com",
  projectId: "imc-marketing-strategy-2-6905e",
  storageBucket: "imc-marketing-strategy-2-6905e.firebasestorage.app",
  messagingSenderId: "1098696173291",
  appId: "1:1098696173291:web:da704572f2339bb925c0ae"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// ── COLLECTIONS ─────────────────────────────────────────────────────────
const INITIATIVES = "initiatives";
const METRICS     = "metrics";
const RESOURCES   = "resources";
const REQUESTS    = "requests";
const EXPENSES    = "expenses";
const CONFIG      = "config";
const PROMOTIONS  = "promotions";
const BD_CARDS          = "bd_cards";
const WELLSPAN_PACKAGES = "wellspan_packages";
const LOYALTY_CARDS     = "loyalty_cards";
const ENTITIES_COLLECTION = "entities";
const HEALTH_DAYS = "health_days";
const TEAM_MEMBERS = "team_members";
const MARKETING_ACTIONS = "marketing_actions";

// ── AUTH HELPERS ────────────────────────────────────────────────────────
export function login(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}
export function logout() {
  return signOut(auth);
}
export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

// Looks up this user's role from the 'roles' collection (doc ID = user UID).
// Returns 'admin', 'coordinator', or null if no role has been assigned.
export async function getUserRole(uid) {
  const snap = await getDoc(doc(db, "roles", uid));
  return snap.exists() ? snap.data().role : null;
}

// ── INITIATIVES CRUD ────────────────────────────────────────────────────
export async function getInitiatives() {
  const snap = await getDocs(collection(db, INITIATIVES));
  const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  data.sort((a,b) => (b.startDate||'').localeCompare(a.startDate||''));
  return data;
}

export function watchInitiatives(callback) {
  return onSnapshot(collection(db, INITIATIVES), snap => {
    const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    data.sort((a,b) => (b.startDate||'').localeCompare(a.startDate||''));
    callback(data);
  });
}

export function addInitiative(data) {
  return addDoc(collection(db, INITIATIVES), {
    ...data,
    createdAt: Timestamp.now()
  });
}

export function updateInitiative(id, data) {
  return updateDoc(doc(db, INITIATIVES, id), {
    ...data,
    updatedAt: Timestamp.now()
  });
}

export function deleteInitiative(id) {
  return deleteDoc(doc(db, INITIATIVES, id));
}


// Canonical deterministic ID for a metric doc — the ONLY id new saves ever use.
function canonicalMetricId(name, period) {
  return `${name}_${period}`.replace(/\s+/g, "_");
}

// Collapses duplicate docs (same metricName + period) down to one.
// Prefers the doc at the canonical deterministic ID; if none match
// (shouldn't happen going forward), falls back to the most recently updated.
// This guards every read against stale leftover duplicates from the old
// updateDoc→addDoc bug, so a query can never silently return an old value.
function dedupeMetricDocs(docs) {
  const groups = {};
  docs.forEach(d => {
    const key = `${d.metricName}__${d.period}`;
    (groups[key] = groups[key] || []).push(d);
  });
  const result = [];
  Object.values(groups).forEach(group => {
    if (group.length === 1) { result.push(group[0]); return; }
    const canonicalId = canonicalMetricId(group[0].metricName, group[0].period);
    let winner = group.find(g => g.id === canonicalId);
    if (!winner) {
      winner = group.reduce((latest, cur) => {
        const lt = latest.updatedAt?.toMillis ? latest.updatedAt.toMillis() : 0;
        const ct = cur.updatedAt?.toMillis ? cur.updatedAt.toMillis() : 0;
        return ct > lt ? cur : latest;
      });
    }
    result.push(winner);
  });
  return result;
}

// One-click cleanup — permanently deletes stale duplicate metric docs left
// over from the old buggy save logic, keeping only the canonical doc per
// metric+period. Safe to run any time; a no-op if there are no duplicates.
export async function cleanupDuplicateMetrics() {
  const snap = await getDocs(collection(db, METRICS));
  const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const groups = {};
  docs.forEach(d => {
    const key = `${d.metricName}__${d.period}`;
    (groups[key] = groups[key] || []).push(d);
  });
  const deletions = [];
  Object.values(groups).forEach(group => {
    if (group.length <= 1) return;
    const canonicalId = canonicalMetricId(group[0].metricName, group[0].period);
    let winner = group.find(g => g.id === canonicalId);
    if (!winner) {
      winner = group.reduce((latest, cur) => {
        const lt = latest.updatedAt?.toMillis ? latest.updatedAt.toMillis() : 0;
        const ct = cur.updatedAt?.toMillis ? cur.updatedAt.toMillis() : 0;
        return ct > lt ? cur : latest;
      });
    }
    group.forEach(g => { if (g.id !== winner.id) deletions.push(deleteDoc(doc(db, METRICS, g.id))); });
  });
  await Promise.all(deletions);
  return deletions.length;
}

// watchMetrics — real-time listener for dashboard (reads any format metric doc)
export function watchMetrics(callback) {
  return onSnapshot(collection(db, METRICS), snap => {
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(dedupeMetricDocs(docs));
  });
}

// ── METRICS CRUD (period-based — one document per metric per month) ──────
// Document ID format: "metricName_YYYY-MM" e.g. "Instagram Reach_2026-06"
// This preserves full history so the portal can show any past month.

export const METRIC_NAMES = [
  "Instagram Reach",
  "Instagram Views",
  "Instagram Engagements",
  "Instagram Engagement Rate",
  "Instagram New Followers",
  "Instagram Conversations",
  "TikTok Views",
  "TikTok Engagements",
  "TikTok New Followers",
  "X Reach",
  "LinkedIn Reach",
  "SM Messages Received",
  "PR Mentions",
  "Website Visits",
];

export const METRIC_UNITS = {
  "Instagram Engagement Rate": "Percentage",
};

// Fetch all metrics for a specific period e.g. "2026-06"
export async function getMetricsForPeriod(period) {
  const snap = await getDocs(
    query(collection(db, METRICS), where("period", "==", period))
  );
  const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return dedupeMetricDocs(docs);
}

// Fetch all available periods (distinct months that have data)
export async function getMetricPeriods() {
  const snap = await getDocs(collection(db, METRICS));
  const periods = new Set();
  snap.docs.forEach(d => { if(d.data().period) periods.add(d.data().period); });
  return Array.from(periods).sort().reverse(); // newest first
}

// Fetch all metrics across all periods (for chart history)
export async function getAllMetrics() {
  const snap = await getDocs(collection(db, METRICS));
  const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const data = dedupeMetricDocs(docs);
  data.sort((a,b) => (a.period||'').localeCompare(b.period||''));
  return data;
}

// Save (upsert) a full month's metrics in one batch
// data = { period: "2026-06", metrics: { "Instagram Reach": 45000, ... } }
export async function saveMonthMetrics(period, metricsObj) {
  // Use setDoc with a deterministic document ID: "MetricName_YYYY-MM"
  // setDoc creates the doc if it doesn't exist, or fully overwrites it if it does.
  // This is intentional — we always want a clean write at a known, predictable ID.
  // The old updateDoc → addDoc fallback was broken: addDoc created random IDs,
  // so repeat saves always failed the updateDoc and kept stacking new random-ID docs.
  const writes = Object.entries(metricsObj).map(([name, value]) => {
    const docId = `${name}_${period}`.replace(/\s+/g, "_");
    const unit  = METRIC_UNITS[name] || "Number";
    return setDoc(doc(db, METRICS, docId), {
      metricName: name, period, value: Number(value) || 0, unit,
      updatedAt:  Timestamp.now(),
    });
  });
  return Promise.all(writes);
}

export function deleteMetric(id) {
  return deleteDoc(doc(db, METRICS, id));
}

// ── RESOURCES CRUD (Brand Resources page) ───────────────────────────────
export async function getResources() {
  const snap = await getDocs(collection(db, RESOURCES));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export function watchResources(callback) {
  return onSnapshot(collection(db, RESOURCES), snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

export function addResource(data) {
  return addDoc(collection(db, RESOURCES), { ...data, createdAt: Timestamp.now() });
}

export function updateResource(id, data) {
  return updateDoc(doc(db, RESOURCES, id), data);
}

export function deleteResource(id) {
  return deleteDoc(doc(db, RESOURCES, id));
}

export const RESOURCE_TYPES = ["Social Media","Print","Stationery","Logo & Brand Mark","Presentation Template","Guideline Document","Other"];

// ── EXPENSE TYPES ────────────────────────────────────────────────────────
export const EXPENSE_TYPES = [
  "Paid Social","Print Production","Event","Tools & Subscriptions",
  "Agency / Freelance","Photography / Videography","Outdoor / OOH","Other"
];

// ── EXPENSES CRUD ────────────────────────────────────────────────────────
export function watchExpenses(callback) {
  return onSnapshot(collection(db, EXPENSES), snap => {
    const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    data.sort((a,b) => (b.date||'').localeCompare(a.date||''));
    callback(data);
  });
}
export function addExpense(data) {
  return addDoc(collection(db, EXPENSES), { ...data, createdAt: Timestamp.now() });
}
export function updateExpense(id, data) {
  return updateDoc(doc(db, EXPENSES, id), data);
}
export function deleteExpense(id) {
  return deleteDoc(doc(db, EXPENSES, id));
}

// ── PROMOTIONS CRUD ───────────────────────────────────────────────────────
export function watchPromotions(callback) {
  return onSnapshot(collection(db, PROMOTIONS), snap => {
    const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // Sort in JS — avoids Firestore composite index requirement
    data.sort((a,b) => (b.startDate||'').localeCompare(a.startDate||''));
    callback(data);
  });
}
export function addPromotion(data) {
  return addDoc(collection(db, PROMOTIONS), { ...data, createdAt: Timestamp.now() });
}
export function updatePromotion(id, data) {
  return updateDoc(doc(db, PROMOTIONS, id), data);
}
export function deletePromotion(id) {
  return deleteDoc(doc(db, PROMOTIONS, id));
}

// Helper: derive promotion status from dates (no manual status needed)
export function promoStatus(startDate, endDate) {
  if(!startDate) return 'Upcoming';
  const today = new Date(); today.setHours(0,0,0,0);
  const start = new Date(startDate);
  const end   = endDate ? new Date(endDate) : null;
  if(today < start) return 'Upcoming';
  if(end && today > end) return 'Expired';
  return 'Active';
}


// ── BRAND VOICE CONFIG ───────────────────────────────────────────────────
// Stored as config/brand_voice — editable from admin, feeds every AI caption
// generation call so the voice stays consistent and tunable without code changes.
const DEFAULT_BRAND_VOICE = {
  hashtagCloser: "#غايتنا_عافيتكم",
  formality: "Warm and conversational, still professional",
  emojiUsage: "Light use — 1-2 relevant emojis max",
  toneNotes: "Respectful, family-oriented, non-alarmist. Confident without being clinical or cold. Preventive care and long-term patient relationships are core themes. Aware of Islamic occasions (Ramadan, Eid) and Saudi National Day as natural moments to speak to — never forced.",
  avoidWords: "guaranteed, cure, miracle, best in Jeddah, #1",
  ctaStyleEN: "For booking & inquiries call 920027778 or download the MY IMC app",
  ctaStyleAR: "للحجز والاستفسار 920027778 أو حمل تطبيق MY IMC",
};
export async function getBrandVoice() {
  const snap = await getDoc(doc(db, CONFIG, "brand_voice"));
  return snap.exists() ? { ...DEFAULT_BRAND_VOICE, ...snap.data() } : DEFAULT_BRAND_VOICE;
}
export function setBrandVoice(data) {
  return setDoc(doc(db, CONFIG, "brand_voice"), data, { merge: true });
}
export function watchBrandVoice(callback) {
  return onSnapshot(doc(db, CONFIG, "brand_voice"),
    snap => callback(snap.exists() ? { ...DEFAULT_BRAND_VOICE, ...snap.data() } : DEFAULT_BRAND_VOICE),
    err => { console.error('watchBrandVoice:', err.code); callback(DEFAULT_BRAND_VOICE); }
  );
}


// Stored as config/bd_targets — single doc with all 2026 KPI targets
// ── AI / ANTHROPIC API KEY ───────────────────────────────────────────────
// Stored as config/ai_settings — required for the caption generator to work
// once deployed outside claude.ai (see admin.html for the security note
// shown alongside the input field).
export async function getAnthropicKey() {
  const snap = await getDoc(doc(db, CONFIG, "ai_settings"));
  return snap.exists() ? (snap.data().apiKey || '') : '';
}
export function setAnthropicKey(apiKey) {
  return setDoc(doc(db, CONFIG, "ai_settings"), { apiKey }, { merge: true });
}
export function watchAnthropicKey(callback) {
  return onSnapshot(doc(db, CONFIG, "ai_settings"),
    snap => callback(snap.exists() ? (snap.data().apiKey || '') : ''),
    err  => { console.error('watchAnthropicKey:', err.code); callback(''); }
  );
}


// ── SHARED PASSWORD HASHING (Web Crypto — no library needed) ────────────
// Used by the public access gate below. Passwords are never stored or
// compared in plain text.
export async function hashPassword(pw) {
  const enc = new TextEncoder().encode(pw);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── TEAM MEMBERS ──────────────────────────────────────────────────────────
// A lightweight team directory used to populate "Assigned To" dropdowns.
// Optionally, a team member can also get a real Firebase Auth login account
// (admin or coordinator role) — created via a SECONDARY app instance so it
// never disturbs the currently logged-in admin's own session.
export function watchTeamMembers(callback) {
  return onSnapshot(collection(db, TEAM_MEMBERS), snap => {
    const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    data.sort((a,b) => (a.name||'').localeCompare(b.name||''));
    callback(data);
  }, err => { console.error('watchTeamMembers:', err.code); callback([]); });
}

// Directory-only entry — no login access, just shows up in "Assigned To".
export function addTeamMember(data) {
  return addDoc(collection(db, TEAM_MEMBERS), {
    ...data, hasLoginAccount: false, authUid: null, active: true, createdAt: Timestamp.now(),
  });
}

export function updateTeamMember(id, data) {
  return updateDoc(doc(db, TEAM_MEMBERS, id), data);
}

// Deletes the directory entry. If this person has a login account, also
// deletes their roles/{uid} document — which immediately revokes their
// admin panel access (the existing login flow blocks anyone with no role
// doc). Note: this does NOT delete the underlying Firebase Auth account
// itself — client-side code can only delete the currently signed-in user's
// own account, not someone else's. The orphaned account is harmless (no
// role = no access) but for full removal, delete it manually in Firebase
// Console → Authentication → Users.
export async function deleteTeamMember(id, authUid) {
  if (authUid) {
    await deleteDoc(doc(db, "roles", authUid)).catch(() => {});
  }
  return deleteDoc(doc(db, TEAM_MEMBERS, id));
}

// Creates a REAL Firebase Auth login account for a team member, using a
// secondary app instance so the admin's own current session is untouched.
// Then writes their role and saves the team member record together.
export async function createTeamMemberWithLogin({ name, email, department, password, role }) {
  const secondaryApp = initializeApp(firebaseConfig, `secondary-${Date.now()}`);
  const secondaryAuth = getAuth(secondaryApp);
  let newUid;
  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    newUid = cred.user.uid;
    await signOut(secondaryAuth);
  } finally {
    await deleteApp(secondaryApp);
  }

  // Write the role doc (requires the current signed-in admin's Firestore
  // rules to permit this — see the updated `roles` rule).
  await setDoc(doc(db, "roles", newUid), { role });

  // Save the team member directory entry, linked to their new auth account.
  const docRef = await addDoc(collection(db, TEAM_MEMBERS), {
    name, email, department: department || '', role,
    hasLoginAccount: true, authUid: newUid, active: true, createdAt: Timestamp.now(),
  });
  return { id: docRef.id, authUid: newUid };
}

// ── ADMIN LOGIN PASSCODE ("Magic Word") ───────────────────────────────────
// A temporary, parallel login path alongside real email/password auth —
// not a replacement for it. Entering the correct passcode triggers a real,
// silent Firebase Auth login behind the scenes (see admin.html), so nothing
// about Firestore security rules changes; this is purely a faster front door
// for trusted staff during a transitional period.
// Stored as config/admin_passcode → { passwordHash: string }
// Auto-seeds the default passcode "openIMC@123admin" on first use.
export async function getAdminPasscode() {
  const snap = await getDoc(doc(db, CONFIG, "admin_passcode"));
  if (snap.exists()) return snap.data().passwordHash;
  const defaultHash = await hashPassword("openIMC@123admin");
  await setDoc(doc(db, CONFIG, "admin_passcode"), { passwordHash: defaultHash });
  return defaultHash;
}
export function setAdminPasscode(passwordHash) {
  return setDoc(doc(db, CONFIG, "admin_passcode"), { passwordHash }, { merge: true });
}

// ── PUBLIC ACCESS GATE ───────────────────────────────────────────────────
// Stored as config/access_gate → { enabled: bool, passwordHash: string }
// This is a client-side "soft gate" — it deters casual/unauthenticated
// browsing and search indexing, but is not real security since index.html
// is a static public file with no backend to enforce anything server-side.
export async function getAccessGate() {
  const snap = await getDoc(doc(db, CONFIG, "access_gate"));
  return snap.exists() ? snap.data() : { enabled: false, passwordHash: '' };
}
export function setAccessGate(data) {
  return setDoc(doc(db, CONFIG, "access_gate"), data, { merge: true });
}


// ── ENTITIES (admin-manageable, replaces the old hardcoded list) ─────────
// Auto-seeds the original 5 entities on first load if the collection is
// empty, so nothing breaks for existing deployments.
export function watchEntities(callback) {
  return onSnapshot(collection(db, ENTITIES_COLLECTION), async snap => {
    if (snap.empty) {
      const seedNames = ["IMC","Makkah","TFC","JP","RSM"];
      await Promise.all(seedNames.map(name =>
        addDoc(collection(db, ENTITIES_COLLECTION), { name, createdAt: Timestamp.now() })
      ));
      return; // onSnapshot fires again automatically once the seed writes land
    }
    const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    data.sort((a,b) => (a.name||'').localeCompare(b.name||''));
    callback(data);
  }, err => { console.error('watchEntities:', err.code); callback([]); });
}

export async function addEntity(name) {
  const clean = (name||'').trim();
  if (!clean) throw new Error('Entity name cannot be empty');
  const snap = await getDocs(collection(db, ENTITIES_COLLECTION));
  const exists = snap.docs.some(d => (d.data().name||'').toLowerCase() === clean.toLowerCase());
  if (exists) throw new Error(`"${clean}" already exists`);
  return addDoc(collection(db, ENTITIES_COLLECTION), { name: clean, createdAt: Timestamp.now() });
}

// Counts how many initiatives, BD cards, and promotions reference this
// entity — used to block deletion when the entity is still in use anywhere.
export async function checkEntityUsage(entityName) {
  const [initSnap, bdSnap, promoSnap] = await Promise.all([
    getDocs(query(collection(db, INITIATIVES), where("entity", "array-contains", entityName))),
    getDocs(query(collection(db, BD_CARDS), where("entity", "==", entityName))),
    getDocs(query(collection(db, PROMOTIONS), where("entity", "array-contains", entityName))),
  ]);
  return {
    initiatives: initSnap.size,
    bdCards: bdSnap.size,
    promotions: promoSnap.size,
    total: initSnap.size + bdSnap.size + promoSnap.size,
  };
}

export async function deleteEntity(id, name) {
  const usage = await checkEntityUsage(name);
  if (usage.total > 0) {
    const parts = [];
    if (usage.initiatives) parts.push(`${usage.initiatives} initiative(s)`);
    if (usage.bdCards) parts.push(`${usage.bdCards} BD card(s)`);
    if (usage.promotions) parts.push(`${usage.promotions} promotion(s)`);
    throw new Error(`Cannot delete "${name}" — still used by ${parts.join(', ')}. Remove or reassign these first.`);
  }
  return deleteDoc(doc(db, ENTITIES_COLLECTION, id));
}


// ── HEALTH DAYS — standalone collection (independent of initiatives) ─────
export function watchHealthDays(callback) {
  return onSnapshot(collection(db, HEALTH_DAYS), snap => {
    const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    data.sort((a,b) => (a.date||'').localeCompare(b.date||''));
    callback(data);
  }, err => { console.error('watchHealthDays:', err.code); callback([]); });
}
export function addHealthDay(data) {
  return addDoc(collection(db, HEALTH_DAYS), { ...data, createdAt: Timestamp.now() });
}
export function updateHealthDay(id, data) {
  return updateDoc(doc(db, HEALTH_DAYS, id), data);
}
export function deleteHealthDay(id) {
  return deleteDoc(doc(db, HEALTH_DAYS, id));
}

// One-time migration: moves any legacy type="Health Day" initiatives into the
// new standalone health_days collection, then removes them from initiatives.
// Safe to run more than once — it only ever acts on remaining Health Day
// initiatives, so a second run simply finds nothing left to migrate.
export async function migrateHealthDaysFromInitiatives() {
  const snap = await getDocs(query(collection(db, INITIATIVES), where("type", "==", "Health Day")));
  const legacy = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (!legacy.length) return { migrated: 0 };

  await Promise.all(legacy.map(item =>
    addDoc(collection(db, HEALTH_DAYS), {
      name: item.title || '',
      nameAr: item.nameAr || '',
      date: item.startDate || '',
      category: item.hdCategory || 'MOH Health Day',
      department: item.department || '',
      createdAt: Timestamp.now(),
    })
  ));
  await Promise.all(legacy.map(item => deleteDoc(doc(db, INITIATIVES, item.id))));
  return { migrated: legacy.length };
}

// ── BD TARGETS ───────────────────────────────────────────────────────────
export function watchBdTargets(callback) {
  return onSnapshot(doc(db, CONFIG, "bd_targets"),
    snap => { callback(snap.exists() ? snap.data() : {}); },
    err  => { console.error('watchBdTargets:', err.code); callback({}); }
  );
}
export function setBdTargets(data) {
  return setDoc(doc(db, CONFIG, "bd_targets"), data, { merge: true });
}

// Stored as a single document: config/budget → { annualBudget: number, year: number }
export async function getAnnualBudget() {
  const snap = await getDoc(doc(db, CONFIG, "budget"));
  return snap.exists() ? snap.data() : { annualBudget: 0, year: new Date().getFullYear() };
}
export function setAnnualBudget(annualBudget, year) {
  return setDoc(doc(db, CONFIG, "budget"), { annualBudget, year }, { merge: true });
}



// ── REQUESTS CRUD (Coordinator Request Form → log visible in admin) ────
export function watchRequests(callback) {
  return onSnapshot(collection(db, REQUESTS), snap => {
    const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    data.sort((a,b) => {
      const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return tb - ta;
    });
    callback(data);
  });
}

export function addRequest(data) {
  return addDoc(collection(db, REQUESTS), { ...data, createdAt: Timestamp.now() });
}

export function deleteRequest(id) {
  return deleteDoc(doc(db, REQUESTS, id));
}

export function updateRequest(id, data) {
  return updateDoc(doc(db, REQUESTS, id), data);
}

// Accept/Reject writes go through here instead of updateRequest() so
// reviewedAt is always stamped automatically — mirrors updateMarketingAction's
// auto-stamped updatedAt, keeps admin.html from having to import Timestamp.
export function reviewRequest(id, data) {
  return updateDoc(doc(db, REQUESTS, id), { ...data, reviewedAt: Timestamp.now() });
}

export const DAILY_REQUEST_LIMIT = 5;

// Returns how many requests this email has submitted since midnight today
export async function getTodayRequestCount(email) {
  const startOfDay = new Date();
  startOfDay.setHours(0,0,0,0);
  const q = query(
    collection(db, REQUESTS),
    where("submittedBy", "==", email),
    where("createdAt", ">=", Timestamp.fromDate(startOfDay))
  );
  const snap = await getDocs(q);
  return snap.size;
}

export const REQUEST_TYPES = [
  "New Doctor Announcement","Specialty Awareness Campaign","Event / Seminar / Webinar Promotion",
  "Print Flyer / Poster","Brochure / Booklet","Sticker / Signage","Countertop Display",
  "Social Media Post (single)","Video / Reel Production",
  "Seasonal / Occasion Campaign","Patient Education Content","Internal Communication","Other"
];
export const PRIORITIES = ["Normal","High","Urgent"];

export const REQUEST_STATUSES = ["Pending", "Accepted", "Rejected"];
export const REQUEST_REJECTION_REASONS = [
  "Insufficient Detail / Needs Clarification", "Outside Marketing Scope", "Duplicate Request",
  "Budget Not Available", "Lower Priority Than Current Workload",
  "Already Covered by Existing Campaign", "Other"
];

// Live view scoped to the submitting coordinator only — used by request.html's
// "My Requests" panel so a coordinator can see what happened to what they
// submitted. Client-side sort, no orderBy() (CLAUDE.md rule 5).
export function watchMyRequests(email, callback) {
  const q = query(collection(db, REQUESTS), where("submittedBy", "==", email));
  return onSnapshot(q, snap => {
    const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    data.sort((a,b) => (b.createdAt?.toMillis?.()||0) - (a.createdAt?.toMillis?.()||0));
    callback(data);
  });
}

// One-time migration for requests created before the accept/reject workflow
// existed: they only ever had a boolean `done`. A fulfilled legacy request is
// assumed to have been accepted and executed; mirrors migrateLegacyLeadStatuses().
export async function migrateLegacyRequestStatuses() {
  const snap = await getDocs(collection(db, REQUESTS));
  const targets = snap.docs.filter(d => d.data().status === undefined);
  await Promise.all(targets.map(d =>
    updateDoc(doc(db, REQUESTS, d.id), { status: d.data().done ? "Accepted" : "Pending" })
  ));
  return { migrated: targets.length };
}

// ── MARKETING ACTIONS (executive/marketing action-item tracker) ──────────
// Action items agreed between executive leadership and marketing in meetings.
// Optionally linked to a real `initiatives` document once the action becomes
// actual campaign work — see admin.html's "auto-create linked initiative"
// checkbox and linkedInitiativeId/linkedInitiativeTitle in docs/DATA_MODEL.md.
export const ACTION_STATUSES = ["Not Started", "In Progress", "Blocked", "Completed"];

export function watchMarketingActions(callback) {
  return onSnapshot(collection(db, MARKETING_ACTIONS), snap => {
    const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    data.sort((a,b) => (a.deadline||'').localeCompare(b.deadline||''));
    callback(data);
  }, err => { console.error('watchMarketingActions:', err.code, '— add Firestore rules for marketing_actions'); callback([]); });
}
export function addMarketingAction(data) {
  return addDoc(collection(db, MARKETING_ACTIONS), { ...data, createdAt: Timestamp.now() });
}
export function updateMarketingAction(id, data) {
  return updateDoc(doc(db, MARKETING_ACTIONS, id), { ...data, updatedAt: Timestamp.now() });
}
export function deleteMarketingAction(id) {
  return deleteDoc(doc(db, MARKETING_ACTIONS, id));
}

// ── SHARED CONSTANTS (used by both admin + portal for consistency) ──────
export const DEPARTMENTS = [
  // Existing — unchanged
  "Women's Health","Cardiology","Children's Health","Diabetes & Chronic",
  "Dermatology & Plastics","Orthopedics","Oncology","General Surgery","General / Brand",
  // Added
  "Internal Medicine","ENT (Otolaryngology)","Ophthalmology","Urology","Neurology",
  "Nephrology","Gastroenterology","Pulmonology","Physiotherapy & Rehabilitation","Dental",
  "Family Medicine","Psychiatry & Mental Health","Nutrition & Dietetics","Home Healthcare",
  "Fertility & IVF","Radiology & Imaging","Emergency Medicine (ER)"
];
export const ENTITIES = ["IMC","Makkah","TFC","JP","RSM"];
export const CHANNELS = ["Instagram","TikTok","Facebook","X","LinkedIn","Print","Multi-channel"];
export const STATUSES = ["Planned","In Production","Ready","Published","Cancelled"];
export const TYPES = ["Campaign","Event","SM Content","Print","Website Update","Physician Video"];
export const WEBSITE_UPDATE_TYPES = ["News Article","Department Page Update","Doctor Profile Added","Doctor Profile Removed","Other"];
export const CONTENT_TYPES = ["Post","Reel","Video","Story","Carousel"];
export const PRINT_TYPES = ["Brochure","Sticker","Flyer","Booklet","Signage","Countertop","Backdrop/Rollup"];
export const HEALTH_DAY_CATEGORIES = ["MOH Health Day","Saudi Occasion","Islamic Occasion","IMC Campaign"];

// Explicit colors for the original 9 departments — preserved exactly as before
// so nothing already on screen changes color.
export const DEPT_COLORS = {
  "Women's Health":"#8C1F47","Cardiology":"#992020","Children's Health":"#0E7A55",
  "Diabetes & Chronic":"#4535B0","Dermatology & Plastics":"#9B6000",
  "Orthopedics":"#0F4D99","Oncology":"#8C3200","General Surgery":"#06607A","General / Brand":"#2E3BAA"
};
export const DEPT_BG = {
  "Women's Health":"#FFE8F0","Cardiology":"#FFE8E8","Children's Health":"#E4F8F0",
  "Diabetes & Chronic":"#EEEAFF","Dermatology & Plastics":"#FFF6E0",
  "Orthopedics":"#E4F0FF","Oncology":"#FFF0E4","General Surgery":"#E4F8FF","General / Brand":"#EEF0FF"
};

// Fallback palette for any department NOT in the explicit maps above (all newly
// added departments, and any future ones). A department name is hashed to a
// stable index into this palette, so the same department always gets the same
// color — no manual color entry needed as the list grows.
const DEPT_PALETTE = [
  {t:"#A3266B", bg:"#FCE8F3"}, {t:"#0F7B6C", bg:"#E1F5F0"}, {t:"#B45309", bg:"#FEF3E2"},
  {t:"#5B3FA8", bg:"#F0EBFB"}, {t:"#1D6FA5", bg:"#E5F2FB"}, {t:"#B0234A", bg:"#FCE7EE"},
  {t:"#4D7C0F", bg:"#EEF7E0"}, {t:"#A34B0F", bg:"#FDECE0"}, {t:"#0E6E8C", bg:"#E2F3F8"},
  {t:"#7C3F9E", bg:"#F3E9FA"}, {t:"#9E3F3F", bg:"#FAEAEA"}, {t:"#2A6E4E", bg:"#E4F5EC"},
  {t:"#9E7A0F", bg:"#FBF3DC"}, {t:"#3F5C9E", bg:"#E7EDFB"}, {t:"#8C3F73", bg:"#F7E7F1"},
  {t:"#5C7A2A", bg:"#EEF4E2"}, {t:"#7A3F2A", bg:"#F5E9E2"}
];
function hashDeptName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) { hash = (hash * 31 + name.charCodeAt(i)) >>> 0; }
  return hash;
}
// Returns {t, bg} for ANY department — explicit map first, hash-based fallback after.
export function getDeptColor(dept) {
  if (!dept) return { t: "#2E3BAA", bg: "#EEF0FF" };
  if (DEPT_COLORS[dept]) return { t: DEPT_COLORS[dept], bg: DEPT_BG[dept] };
  const idx = hashDeptName(dept) % DEPT_PALETTE.length;
  return { t: DEPT_PALETTE[idx].t, bg: DEPT_PALETTE[idx].bg };
}

// ── BUSINESS DEVELOPMENT CARDS ───────────────────────────────────────────
export function watchBdCards(callback) {
  return onSnapshot(collection(db, BD_CARDS),
    snap => { const data=snap.docs.map(d=>({id:d.id,...d.data()})); data.sort((a,b)=>(b.date||'').localeCompare(a.date||'')); callback(data); },
    err  => { console.error('watchBdCards:', err.code, '— add Firestore rules for bd_cards'); callback([]); }
  );
}
export function addBdCard(data) {
  return addDoc(collection(db, BD_CARDS), {...data, createdAt:Timestamp.now()});
}
export function updateBdCard(id, data) {
  return updateDoc(doc(db, BD_CARDS, id), data);
}
export function deleteBdCard(id) {
  return deleteDoc(doc(db, BD_CARDS, id));
}

// ── WELLSPAN PACKAGES ─────────────────────────────────────────────────────
export function watchWellspanPackages(callback) {
  return onSnapshot(collection(db, WELLSPAN_PACKAGES),
    snap => { const data=snap.docs.map(d=>({id:d.id,...d.data()})); data.sort((a,b)=>(a.name||'').localeCompare(b.name||'')); callback(data); },
    err  => { console.error('watchWellspanPackages:', err.code, '— add Firestore rules for wellspan_packages'); callback([]); }
  );
}
export function addWellspanPackage(data) {
  return addDoc(collection(db, WELLSPAN_PACKAGES), {...data, createdAt:Timestamp.now()});
}
export function updateWellspanPackage(id, data) {
  return updateDoc(doc(db, WELLSPAN_PACKAGES, id), data);
}
export function deleteWellspanPackage(id) {
  return deleteDoc(doc(db, WELLSPAN_PACKAGES, id));
}
export const WELLSPAN_ITEM_TYPES = ["Test","Consultation","Service","Vaccine","Imaging","Other"];

// ── LOYALTY CARDS ─────────────────────────────────────────────────────────
export function watchLoyaltyCards(callback) {
  return onSnapshot(collection(db, LOYALTY_CARDS),
    snap => { const data=snap.docs.map(d=>({id:d.id,...d.data()})); data.sort((a,b)=>(a.tierOrder||0)-(b.tierOrder||0)); callback(data); },
    err  => { console.error('watchLoyaltyCards:', err.code, '— add Firestore rules for loyalty_cards'); callback([]); }
  );
}
export function addLoyaltyCard(data) {
  return addDoc(collection(db, LOYALTY_CARDS), {...data, createdAt:Timestamp.now()});
}
export function updateLoyaltyCard(id, data) {
  return updateDoc(doc(db, LOYALTY_CARDS, id), data);
}
export function deleteLoyaltyCard(id) {
  return deleteDoc(doc(db, LOYALTY_CARDS, id));
}

// Sample loyalty cards — used to seed admin on first setup
export const SAMPLE_LOYALTY_CARDS = [
  {
    name:"Sehat Card", tier:"Silver", tierOrder:1,
    price:299, priceLabel:"SAR / year",
    description:"Our entry-level wellness card — the perfect start for proactive health management.",
    color:"#8890A8", bgColor:"#F0F2F7",
    benefits:[
      {text:"Annual checkup — 10 tests (CBC, lipid profile, blood sugar, kidney & liver function)"},
      {text:"10% discount on all outpatient specialist consultations"},
      {text:"Free annual flu vaccination"},
      {text:"Priority appointment booking via dedicated hotline"},
      {text:"Digital health record access via IMC app"},
    ]
  },
  {
    name:"Sehat Plus Card", tier:"Gold", tierOrder:2,
    price:699, priceLabel:"SAR / year",
    description:"Our most popular card — comprehensive coverage for you and your family.",
    color:"#9B6000", bgColor:"#FFF6E0",
    benefits:[
      {text:"Comprehensive annual checkup — 20+ tests including thyroid and vitamin D"},
      {text:"15% discount on all outpatient specialist consultations"},
      {text:"10% discount on procedures and minor surgeries"},
      {text:"1 annual professional dental cleaning"},
      {text:"Free flu + pneumonia vaccinations annually"},
      {text:"VIP waiting area access for all visits"},
      {text:"Priority appointment + same-day slots"},
      {text:"Digital health record access via IMC app"},
    ]
  },
  {
    name:"Sehat Premium Card", tier:"Platinum", tierOrder:3,
    price:1499, priceLabel:"SAR / year",
    description:"Our elite platinum card — executive-level care with the highest level of attention.",
    color:"#00539B", bgColor:"#E4EDFF",
    benefits:[
      {text:"Executive annual checkup — 30+ tests including full cardiac profile and tumor markers"},
      {text:"20% discount on all outpatient services and consultations"},
      {text:"15% discount on all procedures and elective surgeries"},
      {text:"3 specialist consultations fully covered per year"},
      {text:"Annual dermatology assessment + skin care session"},
      {text:"VIP lounge access with concierge service"},
      {text:"Dedicated patient coordinator for all bookings"},
      {text:"Free flu, pneumonia, and shingles vaccines annually"},
      {text:"Free home lab collection for annual checkup"},
      {text:"Family member 10% discount (up to 3 members)"},
    ]
  }
];

// ── LEADS CRM ─────────────────────────────────────────────────────────────
const LEADS = "leads";

// Two-dimension status model:
// contactStatus — mutually exclusive, always sums to 100% of leads.
// outcome — only meaningful once contactStatus is "Reached".
export const CONTACT_STATUSES = ["Untouched", "Reached", "Unreached", "Missed"];
export const OUTCOMES = ["Pending", "Open File", "Follow-up Scheduled", "Booked", "Wrong Number", "Already a Patient", "Closed - Unsuccessful"];

// Reasons captured only when outcome is "Closed - Unsuccessful" — separates
// *why* a lead didn't convert from the fact that it didn't, since the old
// single catch-all outcome value threw that information away.
export const CLOSURE_REASONS = ["Not Interested", "Price/Insurance Objection", "Went Elsewhere", "Wrong Department/Specialty", "Unable to Reach After Multiple Attempts", "Other"];

export const CONTACT_STATUS_COLORS = {
  "Untouched": {bg:"#F0F2F7", t:"#8890A8"},
  "Reached":   {bg:"#D4F0E2", t:"#0D6E44"},
  "Unreached": {bg:"#FFF0D4", t:"#9B5800"},
  "Missed":    {bg:"#FDE4E4", t:"#B0234A"},
};
export const OUTCOME_COLORS = {
  "Pending":                {bg:"#F0F2F7", t:"#8890A8"},
  "Open File":              {bg:"#FFF0D4", t:"#9B5800"},
  "Follow-up Scheduled":    {bg:"#E4EDFF", t:"#1649A3"},
  "Booked":                 {bg:"#D4F0E2", t:"#0D6E44"},
  "Wrong Number":           {bg:"#F5F0E8", t:"#8C6D3F"},
  "Already a Patient":      {bg:"#F3E9FA", t:"#7C3F9E"},
  "Closed - Unsuccessful":  {bg:"#FDE4E4", t:"#B0234A"},
};

export function watchLeads(callback) {
  return onSnapshot(collection(db, LEADS),
    snap => {
      const data = snap.docs.map(d=>({id:d.id,...d.data()}));
      data.sort((a,b)=>(b.createdAt?.toMillis?.()||0)-(a.createdAt?.toMillis?.()||0));
      callback(data);
    },
    err => { console.error('watchLeads:', err.code, '— add Firestore rules for leads'); callback([]); }
  );
}
export function addLead(data) {
  return addDoc(collection(db, LEADS), {...data, createdAt:Timestamp.now()});
}
export function updateLead(id, data) {
  return updateDoc(doc(db, LEADS, id), {...data, updatedAt:Timestamp.now()});
}
export function deleteLead(id) {
  return deleteDoc(doc(db, LEADS, id));
}
export async function bulkAddLeads(leadsArray, onProgress) {
  let done = 0;
  for(const lead of leadsArray) {
    await addDoc(collection(db, LEADS), {...lead, createdAt:Timestamp.now()});
    done++;
    if(onProgress) onProgress(done, leadsArray.length);
  }
  return done;
}

// One-time migration: converts legacy flat `status` (Lead/Open File/Booked/
// Closed) into the new two-field model. Safe to run more than once — only
// acts on leads that still have an old-style status and no contactStatus yet.
const LEGACY_STATUS_MAP = {
  "Lead":      { contactStatus: "Untouched", outcome: "Pending" },
  "Open File": { contactStatus: "Reached",   outcome: "Open File" },
  "Booked":    { contactStatus: "Reached",   outcome: "Booked" },
  "Closed":    { contactStatus: "Reached",   outcome: "Closed - Unsuccessful" },
};
export async function migrateLegacyLeadStatuses() {
  const snap = await getDocs(collection(db, LEADS));
  const legacy = snap.docs.filter(d => d.data().status && !d.data().contactStatus);
  if (!legacy.length) return { migrated: 0 };
  await Promise.all(legacy.map(d => {
    const mapped = LEGACY_STATUS_MAP[d.data().status] || { contactStatus: "Untouched", outcome: "Pending" };
    return updateDoc(doc(db, LEADS, d.id), mapped);
  }));
  return { migrated: legacy.length };
}

// ── PHONE NORMALIZATION ────────────────────────────────────────────────────
// Unifies phone numbers to bare-digits international format (e.g.
// "966539958558", no +, no spaces/dashes) — the format wa.me and tel: links
// need, and the format the Contact History lookup (which matches leads by
// exact phone string) has always silently depended on. Shared by every
// phone-write site: admin.html's manual add/edit form, Excel import, Google
// Sheet import, and call-center.html's edit modal.
export function normalizePhone(raw) {
  if (!raw) return '';
  let digits = String(raw).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) digits = '966' + digits.slice(1); // local 0-prefixed (05XXXXXXXX)
  else if (digits.length === 9 && digits.startsWith('5')) digits = '966' + digits; // local, no leading 0
  return digits; // already-international numbers (966..., other country codes) pass through unchanged
}

// One-time migration: normalizes every existing lead's phone number. Safe to
// run more than once — only touches documents whose stored phone differs
// from its normalized form.
export async function normalizeAllLeadPhones() {
  const snap = await getDocs(collection(db, LEADS));
  const updates = snap.docs
    .map(d => ({ id: d.id, phone: d.data().phone }))
    .filter(l => l.phone && normalizePhone(l.phone) !== l.phone);
  await Promise.all(updates.map(l => updateDoc(doc(db, LEADS, l.id), { phone: normalizePhone(l.phone) })));
  return { migrated: updates.length };
}

// One-time correction for a real incident: parseExcelDate() (admin.html)
// used to silently misread 2-digit-year dates (e.g. "8/19/01") as year 2001
// instead of 2026 — corrupting 241 leads' dateCreated on an Excel import.
// Fixed at the source (parseExcelDate now rejects ambiguous 2-digit years
// instead of guessing), but existing corrupted records still need fixing.
// Only ever shifts a "2001-" year prefix to "2026-", preserving month/day —
// safe to run more than once, a no-op once nothing matches.
export async function fixCorruptedLeadYears() {
  const snap = await getDocs(collection(db, LEADS));
  const updates = snap.docs
    .map(d => ({ id: d.id, dateCreated: d.data().dateCreated }))
    .filter(l => l.dateCreated && l.dateCreated.startsWith('2001-'));
  await Promise.all(updates.map(l =>
    updateDoc(doc(db, LEADS, l.id), { dateCreated: l.dateCreated.replace(/^2001-/, '2026-') })
  ));
  return { migrated: updates.length };
}

// ── LEADS ↔ GOOGLE SHEETS (live-read, on-demand sync) ─────────────────────
// Extracts the sheet ID from any normal Google Sheets share URL.
export function parseGoogleSheetId(url) {
  const m = String(url||'').match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : null;
}

// Fetches a sheet's first tab as raw CSV text via Google's public CSV export
// endpoint. Works for any sheet with "Anyone with the link can view" sharing
// — no separate "Publish to web" step needed. This is a one-time fetch, not
// a live connection — call it again (e.g. via a Sync button) to get fresh data.
export async function fetchGoogleSheetCSV(sheetUrlOrId) {
  const sheetId = sheetUrlOrId.includes('/') ? parseGoogleSheetId(sheetUrlOrId) : sheetUrlOrId;
  if (!sheetId) throw new Error('Could not find a valid Google Sheet ID in that link');
  const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`;
  const res = await fetch(exportUrl);
  if (!res.ok) throw new Error('Could not fetch the sheet — check that link-sharing is set to "Anyone with the link can view"');
  return res.text();
}

// ── DEPARTMENT REVENUE ESTIMATES (ROI fallback) ───────────────────────────
// Stored as config/department_revenue_estimates → { "Cardiology": 1200, ... }
// Used as a fallback when a booked lead has no actual revenueValue entered,
// so campaign ROI always has a number rather than showing "no data."
export async function getDepartmentRevenueEstimates() {
  const snap = await getDoc(doc(db, CONFIG, "department_revenue_estimates"));
  return snap.exists() ? snap.data() : {};
}
export function setDepartmentRevenueEstimates(estimates) {
  return setDoc(doc(db, CONFIG, "department_revenue_estimates"), estimates);
}
export function watchDepartmentRevenueEstimates(callback) {
  return onSnapshot(doc(db, CONFIG, "department_revenue_estimates"),
    snap => callback(snap.exists() ? snap.data() : {}),
    err => { console.error('watchDepartmentRevenueEstimates:', err.code); callback({}); }
  );
}

// ── PUBLIC LEAD STATS (aggregated, no PII) ────────────────────────────────
// Written by the admin app whenever leads change (see admin.html). Stored
// separately from the leads collection itself so the public portal never
// needs read access to individual names/phone numbers — only this
// pre-computed, aggregate-only snapshot.
export async function getLeadStats() {
  const snap = await getDoc(doc(db, CONFIG, "lead_stats"));
  return snap.exists() ? snap.data() : null;
}
export function setLeadStats(stats) {
  return setDoc(doc(db, CONFIG, "lead_stats"), { ...stats, updatedAt: Timestamp.now() });
}
export function watchLeadStats(callback) {
  return onSnapshot(doc(db, CONFIG, "lead_stats"),
    snap => callback(snap.exists() ? snap.data() : null),
    err => { console.error('watchLeadStats:', err.code); callback(null); }
  );
}

// ── METRICOOL SETTINGS (admin-only) ───────────────────────────────────────
// Stored as config/metricool_settings → { apiToken, userId, blogId }
// Same sensitivity as config/ai_settings — the raw token is visible to
// anyone with admin login and dev tools open. Firestore rule for this
// document must be authenticated-read/write only (see ARCHITECTURE.md).
export async function getMetricoolSettings() {
  const snap = await getDoc(doc(db, CONFIG, "metricool_settings"));
  return snap.exists() ? snap.data() : { apiToken: '', userId: '', blogId: '' };
}
export function setMetricoolSettings(data) {
  return setDoc(doc(db, CONFIG, "metricool_settings"), data, { merge: true });
}
export function watchMetricoolSettings(callback) {
  return onSnapshot(doc(db, CONFIG, "metricool_settings"),
    snap => callback(snap.exists() ? snap.data() : { apiToken: '', userId: '', blogId: '' }),
    err => { console.error('watchMetricoolSettings:', err.code); callback({ apiToken: '', userId: '', blogId: '' }); }
  );
}

// ── PUBLIC METRICOOL STATS (aggregated social performance, no PII) ───────
// Written by admin.html's "Sync Now" action. Stored separately from the
// raw Metricool token so the public portal never needs the credential —
// only this pre-computed snapshot. Shape:
//   { updatedAt, series: { <seriesKey>: [{date, value, source}] } }
// where seriesKey is e.g. "instagram_reach", "linkedin_followers", and
// source is "metricool" (auto-synced) or "manual" (admin override for
// that month — see docs/DATA_MODEL.md).
export async function getMetricoolStats() {
  const snap = await getDoc(doc(db, CONFIG, "metricool_stats"));
  return snap.exists() ? snap.data() : null;
}
export function setMetricoolStats(stats) {
  return setDoc(doc(db, CONFIG, "metricool_stats"), { ...stats, updatedAt: Timestamp.now() });
}
export function watchMetricoolStats(callback) {
  return onSnapshot(doc(db, CONFIG, "metricool_stats"),
    snap => callback(snap.exists() ? snap.data() : null),
    err => { console.error('watchMetricoolStats:', err.code); callback(null); }
  );
}

// Shared between admin.html (which syncs+edits these series) and index.html
// (which only ever reads them) so the aggregation rule for "what number do
// we show for this month" can never drift between the two pages.
export const METRICOOL_SERIES = {
  instagram_reach:           { label:'Instagram Reach',           network:'Instagram', agg:'sum' },
  instagram_engagement_rate: { label:'Instagram Engagement Rate', network:'Instagram', agg:'avg', isPercent:true },
  instagram_likes:           { label:'Instagram Likes',           network:'Instagram', agg:'sum' },
  instagram_comments:        { label:'Instagram Comments',        network:'Instagram', agg:'sum' },
  instagram_reel_views:      { label:'Instagram Reel Views',      network:'Instagram', agg:'sum' },
  instagram_followers:       { label:'Instagram Followers',       network:'Instagram', agg:'last' },
  tiktok_video_views:        { label:'TikTok Views',              network:'TikTok',    agg:'sum' },
  linkedin_impressions:      { label:'LinkedIn Impressions',      network:'LinkedIn',  agg:'sum' },
  linkedin_followers:        { label:'LinkedIn Followers',        network:'LinkedIn',  agg:'last' },
  twitter_followers:         { label:'X Followers',               network:'X',         agg:'last' },
};

// Derives one display number for a series+month from a metricool_stats doc:
// a manual override (if any) wins outright; otherwise sum/average/latest of
// Metricool-sourced points, per that series' aggregation rule. Returns null
// if there's no data at all for that month.
export function metricoolMonthlyValue(stats, seriesKey, period) {
  const def = METRICOOL_SERIES[seriesKey];
  const pts = ((stats?.series?.[seriesKey])||[]).filter(p => p.date.startsWith(period));
  const manual = pts.find(p => p.source === 'manual');
  if(manual) return manual.value;
  const auto = pts.filter(p => p.source !== 'manual');
  if(!auto.length) return null;
  if(def.agg === 'sum') return auto.reduce((s,p)=>s+p.value,0);
  if(def.agg === 'avg') return auto.reduce((s,p)=>s+p.value,0)/auto.length;
  if(def.agg === 'last') return auto[auto.length-1].value;
  return null;
}
