// Cloudflare Worker — stateless CORS-adding passthrough for the Metricool
// API, so admin.html's browser-side fetch() calls to app.metricool.com
// aren't blocked by CORS (Metricool's API sends no Access-Control-Allow-*
// headers at all — confirmed, not assumed). Never stores the token; it
// flows through exactly as supplied, one extra hop.
//
// NOT auto-deployed from this repo — Cloudflare Workers has no CI/CD wired
// up here. This file is the versioned source of truth; whenever it changes,
// paste the updated code into the live Worker manually:
//   Cloudflare dashboard → Workers & Pages → (this worker) → Edit code → Deploy
// Keep this file and the live Worker in sync the same way firestore.rules
// is kept in sync with the Firebase Console (see docs/ARCHITECTURE.md §4.2).
//
// admin.html's METRICOOL_API_BASE constant points at this Worker's URL.

const ALLOWED_ORIGINS = new Set([
  'https://amo7arram.github.io',
  'https://marketing.imcprojects.app', // internal-domain mirror of the same site — Netlify transparently
                                        // proxies GitHub Pages content under this domain (confirmed via
                                        // response headers: zero redirects, Server: Netlify, X-Github-*
                                        // headers present), so the browser's real Origin becomes this
                                        // domain, not amo7arram.github.io, when accessed this way.
]);

// Real incident: a user on a restricted corporate/hospital network had
// every single Metricool sync call fail identically (all 9 timeline
// series + the follower snapshot + the post-image sync), while the token,
// this Worker, and Metricool's API all tested healthy from elsewhere.
// The one thing every failing call shared: a custom X-Mc-Auth header,
// which forces a CORS preflight — and some corporate proxies/security
// software strip the Origin header from outgoing requests entirely. When
// that happens, fall back to Referer (the full page URL the request came
// from) — if it starts with an allowed origin, treat the request as
// legitimate. A direct address-bar visit to this Worker's URL will still
// correctly show "Origin not allowed", since typed navigation sends
// neither Origin nor Referer — that's expected and isn't evidence of a
// problem; it's just not how the real page-driven fetch() calls behave.
function resolveAllowedOrigin(request) {
  const origin = request.headers.get('Origin');
  if (origin && ALLOWED_ORIGINS.has(origin)) return origin;
  const referer = request.headers.get('Referer') || '';
  for (const allowed of ALLOWED_ORIGINS) {
    if (referer.startsWith(allowed)) return allowed;
  }
  return null;
}

export default {
  async fetch(request) {
    const allowOrigin = resolveAllowedOrigin(request);
    const corsHeaders = {
      'Access-Control-Allow-Origin': allowOrigin || 'null',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'X-Mc-Auth, Content-Type',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
    if (!allowOrigin) return new Response('Origin not allowed', { status: 403 });

    const url = new URL(request.url);
    const targetUrl = 'https://app.metricool.com' + url.pathname + url.search;
    const proxied = await fetch(targetUrl, {
      method: request.method,
      headers: { 'X-Mc-Auth': request.headers.get('X-Mc-Auth') || '', 'Content-Type': 'application/json' },
    });
    const body = await proxied.text();
    return new Response(body, { status: proxied.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  },
};
