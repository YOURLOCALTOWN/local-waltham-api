// Pulls extra local stories from real RSS feeds (Patch, town gov, local outlets) per town.
const STATES = {
  AL:"alabama",AK:"alaska",AZ:"arizona",AR:"arkansas",CA:"california",CO:"colorado",CT:"connecticut",
  DE:"delaware",FL:"florida",GA:"georgia",HI:"hawaii",ID:"idaho",IL:"illinois",IN:"indiana",IA:"iowa",
  KS:"kansas",KY:"kentucky",LA:"louisiana",ME:"maine",MD:"maryland",MA:"massachusetts",MI:"michigan",
  MN:"minnesota",MS:"mississippi",MO:"missouri",MT:"montana",NE:"nebraska",NV:"nevada",NH:"new-hampshire",
  NJ:"new-jersey",NM:"new-mexico",NY:"new-york",NC:"north-carolina",ND:"north-dakota",OH:"ohio",
  OK:"oklahoma",OR:"oregon",PA:"pennsylvania",RI:"rhode-island",SC:"south-carolina",SD:"south-dakota",
  TN:"tennessee",TX:"texas",UT:"utah",VT:"vermont",VA:"virginia",WA:"washington",WV:"west-virginia",
  WI:"wisconsin",WY:"wyoming",DC:"washington-dc",
};

const strip = (s) => (s || "")
  .replace(/<!\[CDATA\[|\]\]>/g, "")
  .replace(/<[^>]+>/g, "")
  .replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"')
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
  .trim();

function parseRSS(xml, source) {
  const out = [];
  const blocks = xml.split(/<item[\s>]/i).slice(1);
  for (const b of blocks) {
    const chunk = b.split(/<\/item>/i)[0];
    const get = (tag) => {
      const m = chunk.match(new RegExp("<" + tag + "[^>]*>([\\s\\S]*?)<\\/" + tag + ">", "i"));
      return m ? strip(m[1]) : "";
    };
    const title = get("title");
    if (!title) continue;
    let link = get("link");
    if (!link) { const m = chunk.match(/<link[^>]*href="([^"]+)"/i); if (m) link = m[1]; }
    const dateStr = get("pubDate") || get("updated") || get("published") || get("dc:date");
    const t = dateStr ? Date.parse(dateStr) : NaN;
    let thumb = null;
    const mt = chunk.match(/<media:(?:thumbnail|content)[^>]*url="([^"]+)"/i) || chunk.match(/<enclosure[^>]*url="([^"]+\.(?:jpg|jpeg|png|webp))"/i);
    if (mt) thumb = mt[1];
    out.push({
      id: "rss_" + Math.abs([...title].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7)),
      title, url: link,
      selftext: get("description").slice(0, 300),
      author: source,
      created: isNaN(t) ? Math.floor(Date.now() / 1000) : Math.floor(t / 1000),
      thumb,
    });
  }
  return out;
}

async function grab(url, source) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0 (compatible; LocalTown/1.0)" } });
    clearTimeout(timer);
    if (!r.ok) return [];
    const xml = await r.text();
    if (!/<item[\s>]/i.test(xml)) return [];
    return parseRSS(xml, source);
  } catch (e) { return []; }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  const town = (req.query.town || "").toString().trim();
  const st = (req.query.st || "").toString().trim().toUpperCase();
  try {
    if (!town) return res.status(200).json({ posts: [] });

    const slug = town.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const stateSlug = STATES[st] || "";
    const gq = (q) => "https://news.google.com/rss/search?q=" + encodeURIComponent(q) + "&hl=en-US&gl=US&ceid=US:en";

    const sources = [];
    if (stateSlug) sources.push([`https://patch.com/${stateSlug}/${slug}/rss`, "Patch"]);
    sources.push([gq(`"${town}" ${st} when:30d`), "Local News"]);
    sources.push([gq(`"${town}" ${st} (police OR fire OR school OR "town meeting" OR "city council") when:30d`), "Local News"]);
    sources.push([gq(`site:patch.com "${town}"`), "Patch"]);

    const results = await Promise.allSettled(sources.map(([u, s]) => grab(u, s)));
    const seen = {}, posts = [];
    for (const r of results) {
      if (r.status !== "fulfilled") continue;
      for (const p of r.value) {
        const k = (p.url || p.title).toLowerCase();
        if (seen[k]) continue;
        seen[k] = 1;
        posts.push(p);
      }
    }
    posts.sort((a, b) => (b.created || 0) - (a.created || 0));

    res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=3600");
    return res.status(200).json({ town, posts: posts.slice(0, 80) });
  } catch (e) {
    return res.status(200).json({ posts: [], error: String(e) });
  }
}
