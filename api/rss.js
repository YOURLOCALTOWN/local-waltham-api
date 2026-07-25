// Discovers and pulls each town's real local outlets: Patch, town gov, police/fire, schools, weeklies.
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

const BLOCK = /(maxpreps|eventbrite|yelp\.com|tripadvisor|zillow|realtor\.com|redfin|indeed\.com|ziprecruiter|apartments\.com|trulia)/i;

const strip = (s) => {
  let t = (s || "").replace(/<!\[CDATA\[|\]\]>/g, "");
  t = t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
       .replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&nbsp;/g, " ")
       .replace(/&amp;/g, "&");
  t = t.replace(/<[^>]*>/g, " ").replace(/<[^>]*>/g, " ").replace(/<[^>]*$/, " ");
  t = t.replace(/https?:\/\/\S+/g, " ");
  t = t.replace(/\s*<\s*\/?\s*[a-z]*\s*(href|src)?\s*=?\s*["']?\s*$/i, " ");
  return t.replace(/\s+/g, " ").trim();
};

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

    let link = "";
    const lm = chunk.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
    if (lm) link = lm[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim();
    if (!link) { const m = chunk.match(/<link[^>]*href="([^"]+)"/i); if (m) link = m[1]; }
    if (BLOCK.test(title) || BLOCK.test(link)) continue;
    if (/\bschedule\b|\broster\b|\bstandings\b/i.test(title)) continue;

    const dateStr = get("pubDate") || get("updated") || get("published") || get("dc:date");
    const t = dateStr ? Date.parse(dateStr) : NaN;
    if (isNaN(t)) continue;
    if (t > Date.now() + 864e5) continue;
    if (t < Date.now() - 60 * 864e5) continue;

    let thumb = null;
    const mt = chunk.match(/<media:(?:thumbnail|content)[^>]*url="([^"]+)"/i) || chunk.match(/<enclosure[^>]*url="([^"]+\.(?:jpg|jpeg|png|webp))"/i);
    if (mt) thumb = mt[1];

    out.push({
      id: "rss_" + Math.abs([...title].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7)),
      title, url: link,
      selftext: get("description").slice(0, 220),
      author: source,
      created: Math.floor(t / 1000),
      thumb,
    });
  }
  return out;
}

async function grab(url, source, ms) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms || 4500);
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
  const county = (req.query.county || "").toString().trim();
  try {
    if (!town) return res.status(200).json({ posts: [] });

    const slug = town.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const flat = town.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const stateSlug = STATES[st] || "";
    const stl = st.toLowerCase();
    const gq = (q) => "https://news.google.com/rss/search?q=" + encodeURIComponent(q) + "&hl=en-US&gl=US&ceid=US:en";

    const sources = [];

    // 1. Patch (town page)
    if (stateSlug) sources.push([`https://patch.com/${stateSlug}/${slug}/rss`, "Patch"]);

    // 2. common town-government / police / school RSS patterns
    const govHosts = [
      `https://www.${flat}ma.gov`, `https://www.${slug}-${stl}.gov`, `https://www.${flat}.gov`,
      `https://www.city.${flat}.${stl}.us`, `https://www.town.${flat}.${stl}.us`, `https://www.${flat}.org`,
    ];
    const govPaths = ["/RSSFeed.aspx?ModID=1&CID=All", "/rss.xml", "/feed", "/news/rss", "/CivicAlerts.aspx?AID=&ARC=RSS"];
    for (const h of govHosts.slice(0, 3)) for (const p of govPaths.slice(0, 3)) sources.push([h + p, "Town of " + town]);

    // 3. Google News scoped to real local outlets and civic sources
    sources.push([gq(`"${town}" ${st} when:30d`), "Local News"]);
    sources.push([gq(`"${town}" ${st} (police OR fire OR "police log" OR arrested OR "structure fire") when:30d`), "Police & Fire"]);
    sources.push([gq(`"${town}" ${st} ("school committee" OR "public schools" OR superintendent OR "town meeting" OR "city council") when:30d`), "Local News"]);
    sources.push([gq(`site:patch.com "${town}"`), "Patch"]);
    sources.push([gq(`site:wickedlocal.com OR site:*.com "${town}" ${st} local news when:30d`), "Local News"]);
    if (county) sources.push([gq(`"${county}" ${st} (sheriff OR "emergency management" OR deputies OR "county fire") when:30d`), "County"]);

    const results = await Promise.allSettled(sources.map(([u, s]) => grab(u, s)));
    const seen = {}, posts = [];
    const working = [];
    results.forEach((r, i) => {
      if (r.status !== "fulfilled" || !r.value.length) return;
      working.push(sources[i][0]);
      for (const p of r.value) {
        const k = (p.url || p.title).toLowerCase();
        if (seen[k]) continue;
        seen[k] = 1;
        posts.push(p);
      }
    });
    posts.sort((a, b) => (b.created || 0) - (a.created || 0));

    res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=3600");
    return res.status(200).json({ town, sources: working.length, posts: posts.slice(0, 100) });
  } catch (e) {
    return res.status(200).json({ posts: [], error: String(e) });
  }
}
