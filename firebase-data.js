// ── IMC Marketing Strategy 2026 — Shared Firebase Data Layer ──────────────
// Used by both admin.html and the public portal.
// This module centralizes Firebase init + Firestore read/write helpers
// so both pages always talk to the data the same way.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, doc, addDoc, updateDoc, deleteDoc,
  getDocs, onSnapshot, query, orderBy, Timestamp
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
const METRICS = "metrics";
const RESOURCES = "resources";
const REQUESTS = "requests";

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

// ── INITIATIVES CRUD ────────────────────────────────────────────────────
export async function getInitiatives() {
  const snap = await getDocs(query(collection(db, INITIATIVES), orderBy("startDate", "desc")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export function watchInitiatives(callback) {
  // Real-time listener — portal + admin both stay in sync automatically
  const q = query(collection(db, INITIATIVES), orderBy("startDate", "desc"));
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
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

// ── METRICS CRUD ────────────────────────────────────────────────────────
export async function getMetrics() {
  const snap = await getDocs(collection(db, METRICS));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export function watchMetrics(callback) {
  return onSnapshot(collection(db, METRICS), snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

export function addMetric(data) {
  return addDoc(collection(db, METRICS), data);
}

export function updateMetric(id, data) {
  return updateDoc(doc(db, METRICS, id), data);
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

// ── REQUESTS CRUD (Coordinator Request Form → log visible in admin) ────
export function watchRequests(callback) {
  const q = query(collection(db, REQUESTS), orderBy("createdAt", "desc"));
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

export function addRequest(data) {
  return addDoc(collection(db, REQUESTS), { ...data, createdAt: Timestamp.now() });
}

export function deleteRequest(id) {
  return deleteDoc(doc(db, REQUESTS, id));
}

export const REQUEST_TYPES = [
  "New Doctor Announcement","Specialty Awareness Campaign","Event / Seminar / Webinar Promotion",
  "Print Flyer / Poster","Social Media Post (single)","Video / Reel Production",
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
export const TYPES = ["Campaign","Event","Content","Health Day"];
export const CONTENT_TYPES = ["Post","Reel","Video","Story","Carousel"];
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
