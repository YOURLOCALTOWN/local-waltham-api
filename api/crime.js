// Recent local crime incidents from city open-data portals (free, no key).
const REGISTRY = {
  "chicago|il":       ["data.cityofchicago.org", "ijzp-q8t2"],
  "new york|ny":      ["data.cityofnewyork.us", "5uac-w243"],
  "los angeles|ca":   ["data.lacity.org", "2nrs-mtv8"],
  "san francisco|ca": ["data.sfgov.org", "wg3w-h783"],
  "seattle|wa":       ["data.seattle.gov", "tazs-3rd5"],
  "austin|tx":        ["data.austintexas.gov", "fdj4-gpfu"],
  "nashville|tn":     ["data.nashville.gov", "2u6v-ujjs"],
  "cincinnati|oh":    ["data.cincinnati-oh.gov", "k59e-2pvf"],
  "kansas city|mo":   ["data.kcmo.org", "vsgj-ufrb"],
  "new orleans|la":   ["data.nola.gov", "5fn8-vtui"],
  "hartford|ct":      ["data.hartford.gov", "889t-nwfu"],
  "baton rouge|la":   ["data.brla.gov", "6z2d-cfmi"],
  "montgomery|md":    ["data.montgomerycountymd.gov", "icn6-v9z3"],
};

const CODEY = /_(cd|code|id)$|^(iucr|beat|district|ward|precinct|sector|zip)/i;
const has = (v) => v !== null && v !== undefined && String(v).trim() !== "";

// Socrata drops null fields, so learn the schema from a batch of rows, not one
function sniff(rows) {
  const sample = rows.slice(0, 60);
  const keys = [];
  for (const r of sample) for (const k of Object.keys(r || {})) if (!keys.includes(k)) keys.push(k);
  const valOf = (k) => { for (const r of sample) if (has(r[k])) return r[k]; return null; };

  const pick = (re, skipCodes) => keys.find((k) => re.test(k) && (!skipCodes || !CODEY.test(k)) && has(valOf(k)));
  const dateK = keys.find((k) => /(^|_)(date|datetime)/i.test(k) && !isNaN(Date.parse(valOf(k))))
             || keys.find((k) => /(occur|report|start)/i.test(k) && !isNaN(Date.parse(valOf(k))));
  const num = (k) => { const v = parseFloat(valOf(k)); return !isNaN(v) ? v : null; };
  const latK = keys.find((k) => /^lat(itude)?$/i.test(k) && num(k) !== null && Math.abs(num(k)) <= 90)
            || keys.find((k) => /lat/i.test(k) && !CODEY.test(k) && num(k) !== null && Math.abs(num(k)) <= 90);
  const lngK = keys.find((k) => /^(lon|lng|long|longitude)$/i.test(k) && num(k) !== null && Math.abs(num(k)) <= 180)
            || keys.find((k) => /(lon|lng)/i.test(k) && !CODEY.test(k) && num(k) !== null && Math.abs(num(k)) <= 180);
  const descK = pick(/(desc|offense|offence|crime_?type|primary_?type|category|charge|nibrs|incident_?type)/i, true);
  const addrK = pick(/(block|address|intersection|street|location_?desc|location_?name|^location$)/i, true);
  const geoK  = keys.find((k) => { const v = valOf(k); return v && typeof v === "object" && (v.coordinates || v.latitude); });
  return { dateK, descK, latK, lngK, addrK, geoK };
}

const miles = (a, b, c, d) => {
  const R = 3958.8, t = Math.PI / 180;
  const dLat = (c - a) * t, dLng = (d - b) * t;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a * t) * Math.cos(c * t) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

const title = (s) =>
  String(s || "").toLowerCase().replace(/\s+/g, " ").trim()
    .replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 70);

async function getJSON(url, ms) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms || 6000);
    const r = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "LocalTown/1.0", Accept: "application/json" } });
    clearTimeout(timer);
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
}

// newest-first, and only rows that carry map coordinates when the dataset has them
async function pullRecent(domain, id) {
  const base = "https://" + domain + "/resource/" + id + ".json";
  const peek = await getJSON(base + "?$limit=60", 6000);
  if (!Array.isArray(peek) || !peek.length) return null;
  const f = sniff(peek);
  if (f.dateK) {
    const q = base + "?$limit=600&$order=" + encodeURIComponent(f.dateK) + "%20DESC"
      + (f.latK ? "&$where=" + encodeURIComponent(f.latK + " IS NOT NULL") : "");
    const ordered = await getJSON(q, 7000);
    if (Array.isArray(ordered) && ordered.length) return ordered;
    const plain = await getJSON(base + "?$limit=600&$order=" + encodeURIComponent(f.dateK) + "%20DESC", 7000);
    if (Array.isArray(plain) && plain.length) return plain;
  }
  return peek;
}

function shape(rows, lat, lng, radiusMi) {
  if (!Array.isArray(rows) || !rows.length) return [];
  const f = sniff(rows);
  if (!f.dateK) return [];
  const cutoff = Date.now() - 30 * 864e5;
  const out = [];
  for (const r of rows) {
    const t = Date.parse(r[f.dateK]);
    if (isNaN(t) || t < cutoff || t > Date.now() + 864e5) continue;

    let la = f.latK ? parseFloat(r[f.latK]) : NaN;
    let ln = f.lngK ? parseFloat(r[f.lngK]) : NaN;
    if ((isNaN(la) || isNaN(ln)) && f.geoK && r[f.geoK]) {
      const g = r[f.geoK];
      if (g.coordinates) { ln = parseFloat(g.coordinates[0]); la = parseFloat(g.coordinates[1]); }
      else if (g.latitude) { la = parseFloat(g.latitude); ln = parseFloat(g.longitude); }
    }
    let dist = null;
    if (!isNaN(la) && !isNaN(ln) && Math.abs(la) <= 90 && Math.abs(ln) <= 180 && (la !== 0 || ln !== 0)) {
      dist = miles(lat, lng, la, ln);
      if (dist > radiusMi) continue;
    } else { la = null; ln = null; }

    // a real offense description or it isn't worth showing
    const what = title(f.descK ? r[f.descK] : "");
    if (what.length < 4 || /^\d+$/.test(what)) continue;

    out.push({
      id: "cr_" + Math.abs([...(what + t)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7)),
      what,
      where: f.addrK && has(r[f.addrK]) && typeof r[f.addrK] !== "object" ? title(r[f.addrK]).slice(0, 60) : "",
      ts: t, lat: la, lng: ln,
      dist: dist == null ? null : Math.round(dist * 10) / 10,
    });
  }
  const seen = {}, dedup = [];
  for (const c of out.sort((a, b) => b.ts - a.ts)) {
    const k = c.what + "|" + c.where + "|" + Math.floor(c.ts / 36e5);
    if (seen[k]) continue;
    seen[k] = 1; dedup.push(c);
  }
  return dedup.slice(0, 60);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  const town = (req.query.town || "").toString().trim();
  const st = (req.query.st || "").toString().trim().toUpperCase();
  try {
    const lat = parseFloat(req.query.lat), lng = parseFloat(req.query.lng);
    if (!town || isNaN(lat) || isNaN(lng)) return res.status(200).json({ town, incidents: [] });
    let radiusMi = parseFloat(req.query.miles);
    if (isNaN(radiusMi)) radiusMi = 6;
    radiusMi = Math.min(40, Math.max(2, radiusMi));

    const key = town.toLowerCase() + "|" + st.toLowerCase();
    const setCache = () => res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");

    const hit = REGISTRY[key];
    if (hit) {
      const rows = await pullRecent(hit[0], hit[1]);
      const incidents = shape(rows, lat, lng, radiusMi);
      if (incidents.length) { setCache(); return res.status(200).json({ town, source: hit[0], incidents }); }
    }

    // search the national catalog — only accepted if incidents land near THIS town
    const cat = await getJSON(
      "https://api.us.socrata.com/api/catalog/v1?only=dataset&limit=8&q=" +
      encodeURIComponent(town + " " + st + " police incidents crime"), 6000);
    const cands = ((cat && cat.results) || [])
      .filter((c) => {
        const n = ((c.resource && c.resource.name) || "").toLowerCase();
        const d = ((c.metadata && c.metadata.domain) || "").toLowerCase();
        return /crime|incident|police|offense|arrest/.test(n) && /\.gov|\.us|opendata/.test(d);
      })
      .slice(0, 3);

    for (const c of cands) {
      const rows = await pullRecent(c.metadata.domain, c.resource.id);
      const incidents = shape(rows, lat, lng, radiusMi);
      if (incidents.filter((i) => i.lat != null).length >= 3) {
        setCache();
        return res.status(200).json({ town, source: c.metadata.domain, incidents });
      }
    }

    setCache();
    return res.status(200).json({ town, incidents: [], note: "no open crime data published for this town" });
  } catch (e) {
    return res.status(200).json({ town, incidents: [], error: String(e) });
  }
}
