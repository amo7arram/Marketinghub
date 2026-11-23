// ── Content-calendar import ────────────────────────────────────────────────
// Turns a monthly social-media calendar (an Excel file or a Google Sheet, in
// Arabic or English) into `SM Content` activities. Everything here is PURE — no
// Firebase, no DOM — so it can be tested on its own; admin.html owns the screen
// and the writes. It imports only constants from firebase-data.js.
//
// What it deliberately does NOT take from a calendar: design/script briefs,
// compliance notes, paid-promotion plans, post times. `initiatives` is
// public-read (the public portal renders its text), so internal working notes
// must not be copied into it. See docs/ARCHITECTURE.md §4.13.

import { DEPARTMENTS, CHANNELS, CONTENT_TYPES } from './firebase-data.js';

// ══ Text helpers ═══════════════════════════════════════════════════════════
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩', FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
export function westernDigits(s) {
  return String(s ?? '').replace(/[٠-٩]/g, c => AR_DIGITS.indexOf(c)).replace(/[۰-۹]/g, c => FA_DIGITS.indexOf(c));
}
// Arabic-insensitive comparison key: no diacritics/tatweel, one alef, ى=ي, ة=ه,
// hamza-carriers folded, punctuation → space, lower-cased.
export function normAr(s) {
  return westernDigits(s).toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
}
// Text that will be shown on the PUBLIC portal (which renders some fields as raw
// HTML): no angle brackets, bounded length.
export function cleanText(s, max) {
  return String(s ?? '').replace(/[<>]/g, '').replace(/\r\n?/g, '\n').trim().slice(0, max);
}
const asText = v => (v == null ? '' : typeof v === 'number' ? String(v) : String(v)).trim();

// ══ Columns ════════════════════════════════════════════════════════════════
// For each field: headers that match exactly (after normAr), then headers that
// merely CONTAIN one of the fragments. Order = the order fields claim columns.
export const FIELDS = [
  { key: 'title',      label: 'Title',                exact: ['موضوع', 'title', 'topic', 'post title', 'عنوان'], contains: ['عنوان', 'post title'] },
  { key: 'date',       label: 'Date',                 exact: ['تاريخ', 'date', 'publish date', 'post date'], contains: ['تاريخ', 'publish date', 'post date'] },
  { key: 'weekday',    label: 'Weekday (to check the date)', exact: ['اليوم', 'day', 'weekday'], contains: [] },
  { key: 'department', label: 'Department',           exact: ['department', 'specialty', 'speciality'], contains: ['القسم', 'التخصص', 'department', 'specialty', 'speciality'] },
  { key: 'format',     label: 'Content type',         exact: ['format', 'content type', 'نوع'], contains: ['الصيغه', 'نوع المحتوي', 'نوع البوست', 'نوع المنشور', 'content type', 'format'] },
  { key: 'channels',   label: 'Channels',             exact: ['platforms', 'platform', 'channels', 'channel'], contains: ['المنصات', 'المنصه', 'القنوات', 'platform', 'channels'] },
  { key: 'caption',    label: 'Caption',              exact: ['caption', 'copy'], contains: ['كابشن', 'الكابشن', 'caption', 'post copy'] },
  { key: 'hashtags',   label: 'Hashtags',             exact: ['hashtags'], contains: ['هاشتاق', 'هاشتاغ', 'hashtag'] },
  { key: 'status',     label: 'Status',               exact: ['الحاله', 'status', 'حاله'], contains: ['الحاله', 'status'] },
  { key: 'pillar',     label: 'Objective (pillar)',   exact: ['pillar', 'objective', 'الهدف'], contains: ['الركيزه', 'الركايز', 'pillar'] },
  { key: 'campaign',   label: 'Campaign',             exact: ['campaign'], contains: ['الحمله', 'campaign'] },
  { key: 'entity',     label: 'Entity',               exact: ['entity', 'branch'], contains: ['الكيان', 'المنشاه', 'entity'] },
];
const FIELD_PATTERNS = FIELDS.map(f => ({ ...f, exact: f.exact.map(normAr), contains: f.contains.map(normAr) }));

// Which field (if any) a header cell looks like — used to find the header row.
function classifyHeader(cell) {
  const h = normAr(cell);
  if(!h) return null;
  for(const f of FIELD_PATTERNS) if(f.exact.includes(h)) return f.key;
  for(const f of FIELD_PATTERNS) if(f.contains.some(c => c && h.includes(c))) return f.key;
  return null;
}

// The header is usually NOT row 1 (a calendar has a title above it). Score each
// of the first rows by how many cells look like known headers; take the best.
export function detectHeaderRow(rows) {
  let best = -1, bestScore = 0;
  for(let i = 0; i < Math.min(rows.length, 30); i++) {
    const keys = new Set((rows[i] || []).map(classifyHeader).filter(Boolean));
    const score = keys.size + (keys.has('title') ? 1 : 0) + (keys.has('date') ? 1 : 0);
    if(keys.size >= 3 && score > bestScore) { best = i; bestScore = score; }
  }
  return best;
}

// → { field: columnIndex } for the header row.
export function detectColumns(headerCells, dataRows) {
  const map = {}, used = new Set();
  const norm = (headerCells || []).map(normAr);
  FIELD_PATTERNS.forEach(f => {
    let idx = norm.findIndex((h, i) => !used.has(i) && h && f.exact.includes(h));
    if(idx < 0) idx = norm.findIndex((h, i) => !used.has(i) && h && f.contains.some(c => c && h.includes(c)));
    if(idx >= 0) { map[f.key] = idx; used.add(idx); }
  });
  // No date header? Pick the column whose values mostly read as dates.
  if(map.date == null && dataRows && dataRows.length) {
    let bestCol = -1, bestShare = 0.6;
    for(let c = 0; c < norm.length; c++) {
      if(used.has(c)) continue;
      const vals = dataRows.map(r => (r || [])[c]).filter(v => v !== '' && v != null);
      if(vals.length < 3) continue;
      const share = vals.filter(v => parseCalendarDate(v).iso).length / vals.length;
      if(share > bestShare) { bestShare = share; bestCol = c; }
    }
    if(bestCol >= 0) map.date = bestCol;
  }
  return map;
}

// ══ Dates ══════════════════════════════════════════════════════════════════
const WEEKDAYS = [['احد', 'sun'], ['اثنين', 'mon'], ['ثلاثاء', 'tue'], ['اربعاء', 'wed'], ['خميس', 'thu'], ['جمعه', 'fri'], ['سبت', 'sat']];
export function weekdayFromText(v) {
  const t = normAr(v);
  if(!t) return null;
  for(let i = 0; i < 7; i++) if(t.includes(WEEKDAYS[i][0]) || t.startsWith(WEEKDAYS[i][1])) return i; // Sunday = 0
  return null;
}
export const WEEKDAY_NAMES_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export function isoWeekday(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay() : null;
}
const MONTHS = { يناير: 1, كانون2: 1, فبراير: 2, شباط: 2, مارس: 3, اذار: 3, ابريل: 4, نيسان: 4, مايو: 5, ايار: 5, يونيو: 6, حزيران: 6, يوليو: 7, تموز: 7, اغسطس: 8, اب: 8, سبتمبر: 9, ايلول: 9, اكتوبر: 10, نوفمبر: 11, ديسمبر: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function monthFromWord(w) {
  const t = normAr(w).replace(/\s/g, '');
  if(!t) return null;
  if(MONTHS[t]) return MONTHS[t];
  const en = t.slice(0, 3);
  return /^[a-z]{3}$/.test(en) && MONTHS[en] ? MONTHS[en] : null;
}
function validYmd(y, m, d) {
  if(!(y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if(dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
// A date cell → { iso, ambiguous }. `weekdayHint` (0-6) settles 3/4/2026-style
// day/month ambiguity; with no hint, day-first is assumed (Saudi convention) and
// the row is flagged. Numbers are Excel serials (read with raw:true — never trust a
// formatted display string for a date; a year-less format silently drops the year).
export function parseCalendarDate(v, weekdayHint = null, order = null) {
  if(v == null || v === '') return { iso: null };
  if(v instanceof Date && !isNaN(v)) return { iso: validYmd(v.getFullYear(), v.getMonth() + 1, v.getDate()) };
  if(typeof v === 'number') {
    if(!(v >= 20000 && v < 80000)) return { iso: null };
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000);
    return { iso: validYmd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()) };
  }
  const s = westernDigits(v).trim();
  if(/^\d{5}(\.\d+)?$/.test(s)) return parseCalendarDate(Number(s));      // an Excel serial that arrived as text
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  if(m) return { iso: validYmd(+m[1], +m[2], +m[3]) };
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(s);
  if(m) {
    const a = +m[1], b = +m[2], y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
    const dmy = validYmd(y, b, a), mdy = validYmd(y, a, b);
    if(dmy && !mdy) return { iso: dmy };
    if(mdy && !dmy) return { iso: mdy };
    if(!dmy && !mdy) return { iso: null };
    if(dmy === mdy) return { iso: dmy };
    if(order === 'dmy') return { iso: dmy };      // decided for the whole column (see detectDateOrder)
    if(order === 'mdy') return { iso: mdy };
    if(weekdayHint != null) {
      const okD = isoWeekday(dmy) === weekdayHint, okM = isoWeekday(mdy) === weekdayHint;
      if(okD !== okM) return { iso: okD ? dmy : mdy };
    }
    return { iso: dmy, ambiguous: true };
  }
  m = /(\d{1,2})\s+([^\d\s,.]+)\.?\s*,?\s*(\d{4})/.exec(s);                       // 1 نوفمبر 2026 · 1 Nov 2026
  if(m && monthFromWord(m[2])) return { iso: validYmd(+m[3], monthFromWord(m[2]), +m[1]) };
  m = /([^\d\s,.]+)\.?\s+(\d{1,2})\s*,?\s*(\d{4})/.exec(s);                        // Nov 1, 2026
  if(m && monthFromWord(m[1])) return { iso: validYmd(+m[3], monthFromWord(m[1]), +m[2]) };
  return { iso: null };
}

// Day-first or month-first? Decide ONCE for the whole date column rather than per
// cell, because a single "11/1/2026" is genuinely ambiguous (and its weekday can
// agree with both readings) while a month of dates always contains some day > 12:
// 13/11/2026 can only be day-first, 11/13/2026 only month-first. Where the column
// never settles it, the weekday column votes. → 'dmy' | 'mdy' | null
export function detectDateOrder(dateCells, weekdayCells = []) {
  let dFirst = 0, mFirst = 0;
  const amb = [];
  dateCells.forEach((v, i) => {
    const m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(westernDigits(v).trim());
    if(!m) return;
    const a = +m[1], b = +m[2];
    if(a > 12 && b <= 12) dFirst++;
    else if(b > 12 && a <= 12) mFirst++;
    else if(a <= 12 && b <= 12 && a !== b) amb.push(i);
  });
  if(dFirst && !mFirst) return 'dmy';
  if(mFirst && !dFirst) return 'mdy';
  if(dFirst && mFirst) return null;               // mixed — leave each cell to its own weekday
  let vd = 0, vm = 0;
  amb.forEach(i => {
    const wd = weekdayFromText(weekdayCells[i]);
    if(wd == null) return;
    const dm = parseCalendarDate(dateCells[i], null, 'dmy').iso, md = parseCalendarDate(dateCells[i], null, 'mdy').iso;
    const okD = dm && isoWeekday(dm) === wd, okM = md && isoWeekday(md) === wd;
    if(okD && !okM) vd++; else if(okM && !okD) vm++;
  });
  return vd > vm && vd >= 2 ? 'dmy' : vm > vd && vm >= 2 ? 'mdy' : null;
}

// ══ Value mappings ═════════════════════════════════════════════════════════
const anyIn = (t, list) => list.some(k => t.includes(normAr(k)));

export function mapContentType(v) {
  const t = normAr(v);
  if(!t) return null;
  if(anyIn(t, ['ستوري', 'story', 'قصه'])) return 'Story';
  if(anyIn(t, ['ريلز', 'reel', 'ريل'])) return 'Reel';          // before "video": "فيديو (Reels)" is a Reel
  if(anyIn(t, ['كاروسيل', 'carousel', 'سلايد', 'slides'])) return 'Carousel';
  if(anyIn(t, ['فيديو', 'video'])) return 'Video';
  if(anyIn(t, ['صوره', 'بوست', 'post', 'image', 'photo', 'انفوجراف', 'infographic', 'تصميم'])) return 'Post';
  return null;
}

const CHANNEL_ALIASES = [
  ['Instagram', ['instagram', 'انستقرام', 'انستجرام', 'انستغرام', 'insta', 'ig']],
  ['TikTok',    ['tiktok', 'tik tok', 'تيك توك', 'تيكتوك']],
  ['Facebook',  ['facebook', 'فيسبوك', 'فيس بوك', 'fb']],
  ['X',         ['x', 'twitter', 'تويتر', 'اكس']],
  ['LinkedIn',  ['linkedin', 'لينكد ان', 'لينكدان', 'لنكد ان']],
  ['Snapchat',  ['snapchat', 'snap', 'سناب شات', 'سناب', 'سنابشات']],
];
// "Instagram · Snapchat · Facebook" → { channels: [...known], unknown: [...] }
export function mapChannels(v) {
  const out = [], unknown = [];
  String(v ?? '').split(/[·•,،;/|+&\n]|\s-\s|\sو\s/).map(s => s.trim()).filter(Boolean).forEach(tok => {
    const t = normAr(tok);
    const hit = CHANNEL_ALIASES.find(([, al]) => al.some(a => normAr(a) === t)) || CHANNEL_ALIASES.find(([, al]) => al.some(a => a.length > 2 && t.includes(normAr(a))));
    if(hit && CHANNELS.includes(hit[0])) { if(!out.includes(hit[0])) out.push(hit[0]); }
    else unknown.push(tok);
  });
  return { channels: out, unknown };
}

export function mapStatus(v) {
  const t = normAr(v);
  if(!t) return { status: 'Planned', known: true };
  if(anyIn(t, ['ملغي', 'الغاء', 'cancel'])) return { status: 'Cancelled', known: true };
  if(anyIn(t, ['منشور', 'تم النشر', 'published', 'live'])) return { status: 'Published', known: true };
  if(anyIn(t, ['جاهز', 'معتمد', 'موافق', 'ready', 'approved'])) return { status: 'Ready', known: true };
  if(anyIn(t, ['قيد', 'جاري', 'تصميم', 'انتاج', 'تنفيذ', 'production', 'progress', 'design'])) return { status: 'In Production', known: true };
  if(anyIn(t, ['فكره', 'مخطط', 'مقترح', 'مسوده', 'idea', 'planned', 'draft'])) return { status: 'Planned', known: true };
  return { status: 'Planned', known: false };
}

// Specialty names → the hub's departments. Order matters (specific before general).
// `sure:false` = a judgment call the admin must confirm once (then it is remembered).
const DEPT_RULES = [
  [['جراحة الأطفال'], "Children's Health", true],
  [['صحة الطفل', 'طب الأطفال', 'الأطفال', 'pediatric'], "Children's Health", true],
  [['جراحة المخ', 'الأعصاب', 'عصبية', 'neuro'], 'Neurology', true],
  [['جراحة التجميل', 'تجميل', 'الجلدية', 'جلدية', 'dermat', 'plastic'], 'Dermatology & Plastics', true],
  [['جراحة الأوعية', 'الأوعية الدموية'], 'General Surgery', false],
  [['جراحة السمنة', 'السمنة', 'bariatric'], 'General Surgery', true],
  [['جراحة الصدر'], 'General Surgery', false],
  [['الجراحة العامة', 'general surgery'], 'General Surgery', true],
  [['القلب', 'cardio'], 'Cardiology', true],
  [['السكري', 'الغدد', 'diabet', 'endocrin'], 'Diabetes & Chronic', true],
  [['المرأة', 'النساء', 'الولادة', 'women'], "Women's Health", true],
  [['الإخصاب', 'الحقن المجهري', 'العقم', 'fertility', 'ivf'], 'Fertility & IVF', true],
  [['المسالك', 'الذكورة', 'urolog'], 'Urology', true],
  [['العيون', 'عيون', 'ophthalm'], 'Ophthalmology', true],
  [['الأسنان', 'أسنان', 'dental'], 'Dental', true],
  [['العظام', 'العضلات', 'المفاصل', 'orthop'], 'Orthopedics', true],
  [['الأورام', 'سرطان', 'oncolog'], 'Oncology', true],
  [['أمراض الدم'], 'Internal Medicine', false],
  [['الأنف', 'الأذن', 'الحنجرة', 'otolaryng'], 'ENT (Otolaryngology)', true],
  [['الأشعة', 'التصوير', 'radiolog'], 'Radiology & Imaging', true],
  [['الطوارئ', 'emergency'], 'Emergency Medicine (ER)', true],
  [['النفسي', 'نفسية', 'psychiatr'], 'Psychiatry & Mental Health', true],
  [['التأهيل', 'العلاج الطبيعي', 'physio'], 'Physiotherapy & Rehabilitation', true],
  [['طب الأسرة', 'الأسرة', 'family'], 'Family Medicine', true],
  [['الجهاز الهضمي', 'الكبد', 'الهضمي', 'gastro'], 'Gastroenterology', true],
  [['الكلى', 'الغسيل', 'nephro'], 'Nephrology', true],
  [['الصدرية', 'الرئة', 'التنفسي', 'طب النوم', 'pulmon'], 'Pulmonology', true],
  [['التغذية', 'nutrition'], 'Nutrition & Dietetics', true],
  [['المنزلية', 'home health'], 'Home Healthcare', true],
  [['الباطنة', 'internal'], 'Internal Medicine', true],
  [['الروماتيزم'], 'Internal Medicine', false],
  [['طب الألم'], 'Orthopedics', false],
  [['الطب الوظيفي', 'العافية'], 'Family Medicine', false],
  [['الفحوصات', 'المختبر'], 'Internal Medicine', false],
  [['الصيدلانية', 'الصيدلة'], 'General / Brand', false],
  [['البراند', 'brand'], 'General / Brand', true],
].map(([kws, dept, sure]) => [kws.map(normAr), dept, sure]);

// → { dept, sure } | null
export function suggestDepartment(raw) {
  const t = normAr(raw);
  if(!t) return null;
  const exact = DEPARTMENTS.find(d => normAr(d) === t);
  if(exact) return { dept: exact, sure: true };
  const padded = t + ' ';
  for(const [kws, dept, sure] of DEPT_RULES) if(kws.some(k => padded.includes(k))) return { dept, sure };
  if(t.split(' ').includes('عام')) return { dept: 'General / Brand', sure: true }; // the word "general" on its own (as a substring it appears inside other words)
  return null;
}

// ══ Campaigns ══════════════════════════════════════════════════════════════
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if(!m) return n; if(!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for(let i = 1; i <= m; i++) {
    const cur = [i];
    for(let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
// → { kind:'exact', id, title } | { kind:'near', id, title } | { kind:'none' }
// A near-miss ("Ramadan Offer" vs "Ramadan Offers") is NEVER auto-matched and never
// auto-created: the admin chooses, because a duplicate campaign splits that
// campaign's leads and costs.
export function matchCampaign(raw, campaigns) {
  const t = normAr(raw);
  if(!t) return { kind: 'none' };
  const list = (campaigns || []).map(c => ({ c, n: normAr(c.title) })).filter(x => x.n);
  const exact = list.find(x => x.n === t);
  if(exact) return { kind: 'exact', id: exact.c.id, title: exact.c.title };
  let best = null, bestSim = 0;
  list.forEach(x => {
    const longer = x.n.length >= t.length ? x.n : t, shorter = x.n.length >= t.length ? t : x.n;
    let sim = 1 - levenshtein(x.n, t) / Math.max(x.n.length, t.length);
    // one name is a whole-word part of the other ("Ramadan" / "Ramadan Offers")
    if(shorter.length >= 4 && (' ' + longer + ' ').includes(' ' + shorter + ' ') && shorter.length / longer.length >= 0.5) sim = Math.max(sim, 0.85);
    if(sim > bestSim) { bestSim = sim; best = x; }
  });
  return best && bestSim >= 0.8 ? { kind: 'near', id: best.c.id, title: best.c.title } : { kind: 'none' };
}

// ══ Building the review rows ═══════════════════════════════════════════════
export const dupKey = (title, date) => `${normAr(title)}|${date || ''}`;
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// rows: array of arrays (the whole sheet); sheet: { headerRow, map };
// o: { entityDefault, entityNames[], includeCaption, includeHashtags, existing[] (initiatives), campaigns[] }
export function buildCalendarRows(rows, sheet, o) {
  const { headerRow, map } = sheet;
  const cellOf = (r, f) => (hasOwn(map, f) && map[f] != null && map[f] >= 0 ? (r || [])[map[f]] : '');
  const entityNames = o.entityNames || [];
  const existingKeys = new Set((o.existing || []).filter(i => i.type !== 'Campaign').map(i => dupKey(i.title, i.startDate)));
  const seen = new Set();
  const items = [], deptMap = new Map(), campMap = new Map();
  const skipped = { blank: 0, nonPost: 0 };

  const body = rows.slice(headerRow + 1);
  const dateOrder = hasOwn(map, 'date') ? detectDateOrder(body.map(r => (r || [])[map.date]), body.map(r => (hasOwn(map, 'weekday') ? (r || [])[map.weekday] : ''))) : null;

  for(let i = headerRow + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    if(!r.some(c => asText(c))) { skipped.blank++; continue; }
    const title = cleanText(asText(cellOf(r, 'title')), 160);
    const dateRaw = cellOf(r, 'date');
    const deptRaw = cleanText(asText(cellOf(r, 'department')), 80);
    const captionRaw = asText(cellOf(r, 'caption'));
    // A line with no date, no department and no caption is a divider/note, not a post.
    if(!asText(dateRaw) && !deptRaw && !captionRaw) { skipped.nonPost++; continue; }

    const flags = [];
    const wdText = asText(cellOf(r, 'weekday'));
    const wd = wdText ? weekdayFromText(wdText) : null;
    const pd = parseCalendarDate(dateRaw, wd, dateOrder);
    const date = pd.iso || '';
    if(!date) flags.push({ text: asText(dateRaw) ? `Date "${cleanText(asText(dateRaw), 20)}" couldn't be read — pick one` : 'No date — pick one', level: 'bad' });
    else {
      if(pd.ambiguous) flags.push({ text: 'Day/month could be either way — read as day first; check', level: 'warn' });
      if(wd != null && isoWeekday(date) !== wd) flags.push({ text: `Sheet says ${wdText} but ${date} is a ${WEEKDAY_NAMES_EN[isoWeekday(date)]} — check the date`, level: 'warn' });
    }
    if(!title) flags.push({ text: 'No title — please add one', level: 'bad' });

    const fmtRaw = asText(cellOf(r, 'format'));
    let contentType = mapContentType(fmtRaw);
    if(!contentType) { contentType = 'Post'; if(fmtRaw) flags.push({ text: `Content type "${cleanText(fmtRaw, 30)}" wasn't recognised — set to Post`, level: 'warn' }); }
    if(!CONTENT_TYPES.includes(contentType)) contentType = 'Post';

    const chRaw = asText(cellOf(r, 'channels'));
    const ch = mapChannels(chRaw);
    if(!ch.channels.length) flags.push({ text: chRaw ? `Platform "${cleanText(chRaw, 40)}" not recognised — none set` : 'No platform given — none set', level: 'warn' });
    else if(ch.unknown.length) flags.push({ text: `Not recognised, left out: ${ch.unknown.join(', ').slice(0, 60)}`, level: 'warn' });

    const stRaw = asText(cellOf(r, 'status'));
    const st = mapStatus(stRaw);
    if(!st.known) flags.push({ text: `Status "${cleanText(stRaw, 20)}" wasn't recognised — set to Planned`, level: 'warn' });

    let caption = cleanText(captionRaw, 3000);
    const tags = cleanText(asText(cellOf(r, 'hashtags')), 600);
    if(o.includeHashtags && tags) caption = caption ? `${caption}\n\n${tags}` : tags;
    if(!o.includeCaption) caption = '';

    const entRaw = asText(cellOf(r, 'entity'));
    let entityName = o.entityDefault || '';
    if(entRaw) {
      const hit = entityNames.find(n => normAr(n) === normAr(entRaw));
      if(hit) entityName = hit; else flags.push({ text: `Entity "${cleanText(entRaw, 20)}" isn't one of yours — used ${entityName || 'none'}`, level: 'warn' });
    }

    const deptKey = normAr(deptRaw);
    if(deptRaw) {
      if(!deptMap.has(deptKey)) deptMap.set(deptKey, { key: deptKey, raw: deptRaw, count: 0, suggestion: suggestDepartment(deptRaw) });
      deptMap.get(deptKey).count++;
    }

    const campRaw = cleanText(asText(cellOf(r, 'campaign')), 120);
    const campKey = normAr(campRaw);
    if(campKey) {
      if(!campMap.has(campKey)) campMap.set(campKey, { key: campKey, raw: campRaw, count: 0, match: matchCampaign(campRaw, o.campaigns) });
      campMap.get(campKey).count++;
    }

    let include = true;
    const dk = date && title ? dupKey(title, date) : null;
    if(dk && existingKeys.has(dk)) { include = false; flags.push({ text: 'Already in your activities (same title and date) — left unticked', level: 'warn', dup: true }); }
    else if(dk && seen.has(dk)) { include = false; flags.push({ text: 'Listed twice in this sheet — left unticked', level: 'warn', dup: true }); }
    if(dk) seen.add(dk);

    items.push({ id: `r${i + 1}`, rowNo: i + 1, include, title, date, weekdayText: wdText, deptRaw, deptKey, contentType, channels: ch.channels,
      caption, status: st.status, pillar: cleanText(asText(cellOf(r, 'pillar')), 200), campKey, campRaw, entityName, flags });
  }
  return { items, deptValues: [...deptMap.values()], campValues: [...campMap.values()], skipped };
}

// ══ Documents ══════════════════════════════════════════════════════════════
export function newImportId(now = new Date()) {
  return `cal-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${Math.random().toString(36).slice(2, 8)}`;
}

// One SM Content activity. Only fields that exist on activities; no internal notes.
export function buildActivityDoc(it, department, ctx) {
  const doc = {
    type: 'SM Content', title: it.title, department, entity: it.entityName ? [it.entityName] : [],
    startDate: it.date, status: it.status, objective: it.pillar || '', channels: [...it.channels], contentType: it.contentType,
    importId: ctx.importId, importSource: 'calendar-import',
    createdByUid: ctx.createdByUid || null, createdByName: ctx.createdByName || 'Unknown',
  };
  if(it.caption) doc.captionAR = it.caption;
  if(ctx.parentCampaignId) doc.parentCampaignId = ctx.parentCampaignId;
  return doc;
}

// A brand-new campaign container for a campaign name the sheet introduced:
// spans its posts' dates, takes their most common department.
export function buildCampaignDoc(title, kids, deptOf, ctx) {
  const dates = kids.map(k => k.date).filter(Boolean).sort();
  const tally = {};
  kids.forEach(k => { const d = deptOf(k); if(d) tally[d] = (tally[d] || 0) + 1; });
  const department = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0] || 'General / Brand';
  return {
    type: 'Campaign', title: cleanText(title, 160), department,
    entity: [...new Set(kids.map(k => k.entityName).filter(Boolean))],
    startDate: dates[0] || '', endDate: dates[dates.length - 1] || '', status: 'Planned', objective: '',
    channels: [...new Set(kids.flatMap(k => k.channels))],
    importId: ctx.importId, importSource: 'calendar-import',
    createdByUid: ctx.createdByUid || null, createdByName: ctx.createdByName || 'Unknown',
  };
}

// What "Undo this import" may delete: items still in Planned. A campaign the import
// created goes only if every child of it goes too (nothing else hangs under it).
export function undoTargets(initiatives, importId) {
  const mine = initiatives.filter(i => i.importId === importId);
  const children = mine.filter(i => i.type !== 'Campaign');
  const delChildren = children.filter(i => i.status === 'Planned');
  const delIds = new Set(delChildren.map(i => i.id));
  const delContainers = mine.filter(i => i.type === 'Campaign' && i.status === 'Planned' &&
    !initiatives.some(k => k.parentCampaignId === i.id && !delIds.has(k.id)));
  return { deleteIds: [...delChildren, ...delContainers].map(i => i.id), keptCount: mine.length - delChildren.length - delContainers.length, total: mine.length };
}
