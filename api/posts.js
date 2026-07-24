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

function mask(str) {
  if (!str) return "";
  const bad = ["motherfucker","fuck","shit","bitch","asshole","bastard","dick","piss","cunt","crap","slut","whore","fag","nigger","pussy","cock","douche","wtf"];
  let out = String(str);
  for (const w of bad) out = out.replace(new RegExp("\\b" + w + "\\w*", "gi"), (m) => m[0] + "$".repeat(Math.max(2, m.length - 1)));
  return out;
}

const keyFor = (town) => "posts:" + (town || "").trim().toLowerCase();

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    if (!BASE || !TOKEN) return res.status(200).json({ posts: [], error: "no store" });

    if (req.method === "POST") {
      let b = req.body;
      if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = {}; } }
      const town = (b.town || "").toString();
      if (!town || !b.body) return res.status(200).json({ ok: false });
      const post = {
        id: b.id || ("nb_" + Date.now()),
        town, st: (b.st || "").toString(),
        cat: (b.cat || "General").toString().slice(0, 30),
        author: mask((b.author || "A neighbor").toString().slice(0, 40)),
        body: mask((b.body || "").toString().slice(0, 800)),
        ts: b.ts || Date.now(),
      };
      const key = keyFor(town);
      await redis(["LPUSH", key, JSON.stringify(post)]);
      await redis(["LTRIM", key, "0", "199"]);
      await redis(["EXPIRE", key, "7776000"]); // auto-expire after 90 days
      return res.status(200).json({ ok: true, post });
    }

    const town = (req.query.town || "").toString();
    if (!town) return res.status(200).json({ posts: [] });
    const rows = (await redis(["LRANGE", keyFor(town), "0", "99"])) || [];
    const posts = rows.map((r) => { try { return JSON.parse(r); } catch (e) { return null; } }).filter(Boolean);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ posts });
  } catch (e) {
    return res.status(200).json({ posts: [], error: String(e) });
  }
}
