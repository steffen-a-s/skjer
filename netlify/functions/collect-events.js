// Skjer: hente arrangementer fra USF og Loppi.
// Denne versjonen returnerer arrangementene direkte og krever ikke Netlify Blobs-oppsett.

function clean(s = "") {
  return s.replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ").trim();
}

async function getHtml(url) {
  const response = await fetch(url, {
    headers: { "user-agent": "Skjer/1.0 event collector" }
  });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
}

function parseLoppi(html) {
  const out = [];
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const seen = new Set();
  for (const match of html.matchAll(re)) {
    const url = new URL(match[1], "https://www.loppi.no").href;
    const title = clean(match[2]);
    if (!title || seen.has(url) || !/loppemarked/i.test(title + " " + url)) continue;
    if (/loppi\.no\/?$/.test(url)) continue;
    seen.add(url);
    out.push({ source: "loppi", title, category: "Loppemarked", source_url: url });
  }
  return out.slice(0, 50);
}

function parseUsf(html) {
  const out = [];
  const re = /<a\b[^>]*href=["']([^"']*(?:events|arrangement)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const seen = new Set();
  for (const match of html.matchAll(re)) {
    const title = clean(match[2]);
    const url = new URL(match[1], "https://www.usf.no").href;
    if (!title || title.length < 3 || seen.has(url)) continue;
    if (/facebook|instagram|ticketmaster/i.test(url)) continue;
    seen.add(url);
    out.push({ source: "usf", title, category: "Arrangement", source_url: url });
  }
  return out.slice(0, 100);
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

  return {
    statusCode: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300"
    },
    body: JSON.stringify({
      ok: errors.length === 0,
      updated_at: new Date().toISOString(),
      count: events.length,
      errors,
      events
    })
  };
};
