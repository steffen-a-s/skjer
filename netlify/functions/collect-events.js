// Skjer: scheduled event collector
// Første versjon henter USF + Loppi. Data lagres i Netlify Blobs.
// Planlagt kjøring: én gang daglig via Netlify Scheduled Functions.

const { getStore } = require("@netlify/blobs");

function clean(s = "") {
  return s.replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ").trim();
}

async function getHtml(url) {
  const r = await fetch(url, { headers: { "user-agent": "Skjer/1.0 event collector" } });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return await r.text();
}

function parseLoppi(html) {
  const out = [];
  const names = [...html.matchAll(/<h[1-4][^>]*>(.*?)<\/h[1-4]>/gis)]
    .map(m => clean(m[1]))
    .filter(x => x && !/loppemarkeder i bergen|tidligere/i.test(x));
  for (const title of names.slice(0, 30)) {
    out.push({
      source: "loppi",
      title,
      category: "loppemarked",
      source_url: "https://www.loppi.no/loppemarkeder/bergen"
    });
  }
  return out;
}

function parseUsf(html) {
  const out = [];
  const re = /<a[^>]+href=["']([^"']*\/events\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const seen = new Set();
  for (const m of html.matchAll(re)) {
    const title = clean(m[2]);
    const url = new URL(m[1], "https://www.usf.no").href;
    if (!title || seen.has(url)) continue;
    seen.add(url);
    out.push({ source: "usf", title, category: "arrangement", source_url: url });
  }
  return out.slice(0, 100);
}

exports.config = { schedule: "@daily" };

exports.handler = async () => {
  const results = [];
  const errors = [];

  try {
    const html = await getHtml("https://www.usf.no/arrangementer");
    results.push(...parseUsf(html));
  } catch (e) {
    errors.push(String(e));
  }

  try {
    const html = await getHtml("https://www.loppi.no/loppemarkeder/bergen");
    results.push(...parseLoppi(html));
  } catch (e) {
    errors.push(String(e));
  }

  const store = getStore("skjer-events");
  await store.setJSON("latest", {
    updated_at: new Date().toISOString(),
    count: results.length,
    errors,
    events: results
  });

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: errors.length === 0, count: results.length, errors })
  };
};
