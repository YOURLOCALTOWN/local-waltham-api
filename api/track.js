const BASE = process.env.STORAGE_KV_REST_API_URL || process.env.KV_REST_API_URL;
const TOKEN = process.env.STORAGE_KV_REST_API_TOKEN || process.env.KV_REST_API_TOKEN;

async function redis(cmd) {
  const r = await fetch(BASE, {
    method: "POST",
    headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  const j = await r.json();
  return j.result;
}

const day = (ts) => new Date(ts || Date.now()).toISOString().slice(0, 10);
const clean = (s) => String(s || "").slice(0, 80).replace(/[\r\n]/g, " ");

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    if (!BASE || !TOKEN) return res.status(200).json({ ok: false, error: "no store" });

    if (req.method === "POST") {
      let b = req.body;
      if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = {}; } }
      const ev = clean(b.ev);
      if (!ev) return res.status(200).json({ ok: false });
      const town = clean(b.town) || "unknown";
      const uid = clean(b.uid) || "anon";
      const meta = clean(b.meta);
      const d = day(b.ts);
      const T = town.toLowerCase();

      await redis(["HINCRBY", "stats:ev:" + T, ev, 1]);
      await redis(["HINCRBY", "stats:day:" + T + ":" + d, ev, 1]);
      await redis(["SADD", "stats:users:" + T, uid]);
      await redis(["SADD", "stats:towns", town]);
      if (meta) await redis(["HINCRBY", "stats:meta:" + T + ":" + ev, meta, 1]);
      await redis(["LPUSH", "stats:recent", JSON.stringify({ ev, town, uid, meta, ts: b.ts || Date.now() })]);
      await redis(["LTRIM", "stats:recent", "0", "499"]);
      return res.status(200).json({ ok: true });
    }

    // GET = report
    const town = (req.query.town || "").toString().trim();
    if (!town) {
      const towns = (await redis(["SMEMBERS", "stats:towns"])) || [];
      return res.status(200).json({ towns });
    }
    const T = town.toLowerCase();
    const flat = (arr) => { const o = {}; for (let i = 0; i < (arr || []).length; i += 2) o[arr[i]] = Number(arr[i + 1]); return o; };

    const events = flat(await redis(["HGETALL", "stats:ev:" + T]));
    const users = (await redis(["SCARD", "stats:users:" + T])) || 0;
    const clicks = flat(await redis(["HGETALL", "stats:meta:" + T + ":sponsor_click"]));
    const views = flat(await redis(["HGETALL", "stats:meta:" + T + ":sponsor_view"]));
    const dirClicks = flat(await redis(["HGETALL", "stats:meta:" + T + ":directory_click"]));
    const filters = flat(await redis(["HGETALL", "stats:meta:" + T + ":filter"]));
    const tabs = flat(await redis(["HGETALL", "stats:meta:" + T + ":tab"]));

    // advertiser report: views, clicks, click-through rate per business
    const names = [...new Set([...Object.keys(views), ...Object.keys(clicks), ...Object.keys(dirClicks)])];
    const advertisers = names.map((n) => {
      const v = views[n] || 0;
      const c = (clicks[n] || 0) + (dirClicks[n] || 0);
      return { business: n, views: v, clicks: c, ctr: v ? Math.round((c / v) * 1000) / 10 + "%" : "—" };
    }).sort((a, b) => (b.views - a.views) || (b.clicks - a.clicks));

    const days = {};
    for (let i = 0; i < 14; i++) {
      const d = day(Date.now() - i * 86400000);
      const v = flat(await redis(["HGETALL", "stats:day:" + T + ":" + d]));
      if (Object.keys(v).length) days[d] = v;
    }

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ town, users, events, advertisers, sponsors: clicks, filters, tabs, days });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String(e) });
  }
}
