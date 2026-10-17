// Skjer: hente arrangementer fra USF Verftet og Loppi Bergen.
// Henter ferske sider ved hvert kall og filtrerer bort generelle overskrifter.
function clean(s = "") {
  return s.replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#(d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ").trim();
}
const genericTitle = /^(arrangementer?|broadcast|loppemarkeder?|events?|program|forside|les mer|se alle arrangementer|kalender|hva skjer)$/i;
function isUsefulTitle(title) {
  return title && title.length >= 4 && !genericTitle.test(title) &&
    !/^(facebook|instagram|youtube|meny|logg inn|søk)$/i.test(title);
}
async function getHtml(url) {
  const response = await fetch(url, {
    headers: { "user-agent": "Skjer/1.1 (Bergen event discovery)" },
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}
function collectLinks(html, baseUrl, source, category, pattern) {
  const out = [];
  const seen = new Set();
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(re)) {
    let url;
    try { url = new URL(match[1], baseUrl).href; } catch { continue; }
    const title = clean(match[2]);
    if (!isUsefulTitle(title) || !pattern.test(title + " " + url)) continue;
    if (!/^https?:$/.test(new URL(url).protocol) || seen.has(url)) continue;
    if (/facebook|instagram|ticketmaster|mailto:|javascript:/i.test(url)) continue;
    if (new URL(url).hostname !== new URL(baseUrl).hostname) continue;
    seen.add(url);
    out.push({ source, title, category, source_url: url });
  }
  return out;
}
function parseLoppi(html) {
  return collectLinks(html, "https://www.loppi.no", "loppi", "Loppemarked", /loppemarked/i).slice(0, 50);
}
function parseUsf(html) {
  return collectLinks(html, "https://www.usf.no", "usf", "Arrangement", /arrangement|event|konsert|film|teater|foredrag|utstilling|festival/i).slice(0, 100);
}
exports.handler = async () => {
  const events = [];
  const errors = [];
  const sources = [
    { name: "usf", url: "https://www.usf.no/arrangementer", parse: parseUsf },
    { name: "loppi", url: "https://www.loppi.no/loppemarkeder/bergen", parse: parseLoppi }
  ];
  await Promise.all(sources.map(async source => {
    try {
      const html = await getHtml(source.url);
      events.push(...source.parse(html));
    } catch (error) {
      errors.push({ source: source.name, message: String(error.message || error) });
    }
  }));
  const unique = [];
  const seen = new Set();
  for (const event of events) {
    const key = event.source + "|" + event.source_url;
    if (!seen.has(key)) { seen.add(key); unique.push(event); }
  }
  return {
    statusCode: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300"
    },
    body: JSON.stringify({
      ok: errors.length === 0,
      updated_at: new Date().toISOString(),
      count: unique.length,
      errors,
      events: unique
    })
  };
};
