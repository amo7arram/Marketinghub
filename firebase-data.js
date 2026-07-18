// ── IMC Marketing Strategy 2026 — Shared Firebase Data Layer ──────────────
// Used by both admin.html and the public portal.
// This module centralizes Firebase init + Firestore read/write helpers
// so both pages always talk to the data the same way.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, doc, addDoc, updateDoc, deleteDoc, getDoc, setDoc,
  getDocs, onSnapshot, query, orderBy, where, Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged
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


// watchMetrics — real-time listener for dashboard (reads any format metric doc)
export function watchMetrics(callback) {
  return onSnapshot(collection(db, METRICS), snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
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
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
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
  const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  data.sort((a,b) => (a.period||'').localeCompare(b.period||''));
  return data;
}

// Save (upsert) a full month's metrics in one batch
// data = { period: "2026-06", metrics: { "Instagram Reach": 45000, ... } }
export async function saveMonthMetrics(period, metricsObj) {
  const writes = Object.entries(metricsObj).map(([name, value]) => {
    const docId = `${name}_${period}`.replace(/\s+/g, "_");
    const unit = METRIC_UNITS[name] || "Number";
    return updateDoc(doc(db, METRICS, docId), {
      metricName: name, period, value: Number(value) || 0, unit,
      updatedAt: Timestamp.now(),
    }).catch(() =>
      // doc doesn't exist yet — create it
      addDoc(collection(db, METRICS), {
        metricName: name, period, value: Number(value) || 0, unit,
        updatedAt: Timestamp.now(),
      })
    );
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


// ── BD TARGETS ───────────────────────────────────────────────────────────
// Stored as config/bd_targets — single doc with all 2026 KPI targets
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

// ── SHARED CONSTANTS (used by both admin + portal for consistency) ──────
export const DEPARTMENTS = [
  "Women's Health","Cardiology","Children's Health","Diabetes & Chronic",
  "Dermatology & Plastics","Orthopedics","Oncology","General Surgery","General / Brand"
];
export const ENTITIES = ["IMC","Makkah","TFC","JP","RSM"];
export const CHANNELS = ["Instagram","TikTok","Facebook","X","LinkedIn","Print","Multi-channel"];
export const STATUSES = ["Planned","In Production","Ready","Published","Cancelled"];
export const TYPES = ["Campaign","Event","SM Content","Print","Health Day"];
export const CONTENT_TYPES = ["Post","Reel","Video","Story","Carousel"];
export const PRINT_TYPES = ["Brochure","Sticker","Flyer","Booklet","Signage","Countertop"];
export const HEALTH_DAY_CATEGORIES = ["MOH Health Day","Saudi Occasion","Islamic Occasion","IMC Campaign"];

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
