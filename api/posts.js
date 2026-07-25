// Verified sponsors you control (always shown first for their towns). Add real advertisers here.
const VERIFIED = [
  {
    towns: ["waltham", "watertown", "belmont", "newton", "lexington", "weston", "lincoln"],
    biz: "Brasco & Sons Memorial Chapels",
    cat: "Funeral Home", pic: "flowers,memorial", city: "Waltham",
    img: "https://local-waltham-api.vercel.app/brasco-logo.png",
    url: "https://www.brascofuneralhome.com",
  },
  {
    towns: ["columbia", "jefferson city", "chamois", "linn", "fulton", "california", "russellville",
            "holts summit", "st. martins", "saint martins", "westphalia", "belle", "owensville",
            "vienna", "bland", "meta", "freeburg", "loose creek", "taos", "wardsville", "centertown"],
    biz: "Millard Family Chapels",
    cat: "Funeral Home", pic: "flowers,memorial", city: "",
    img: "https://local-waltham-api.vercel.app/millard-logo.png",
    url: "https://www.millardfamilychapels.com",
  },
];

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  const town = (req.query.town || "").toString();
  const st = (req.query.st || "").toString();
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    if (isNaN(lat) || isNaN(lng)) return res.status(200).json({ town, sponsors: [] });

    let radius = parseInt(req.query.radius, 10);
    if (isNaN(radius)) radius = 6000;
    radius = Math.min(80000, Math.max(3000, radius));

    const norm = (s) => (s || "").trim().toLowerCase();
    const nkey = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
    const cap = (s) => (s || "").replace(/\b\w/g, (c) => c.toUpperCase());
    const townSet = (req.query.towns || town).toString().split("|").map(norm).filter(Boolean);
    const homeT = norm(town);

    const blurb = (kind, city, isHome) => {
      const k = (kind || "business").toLowerCase();
      return isHome
        ? "A local " + k + " in " + city + ", serving " + city + " and surrounding areas."
        : "A local " + k + " in " + city + ", serving " + (town || "the area") + " and nearby towns.";
    };

    const verifiedPicks = VERIFIED
      .filter((v) => v.towns.includes(homeT) || v.towns.some((t) => townSet.includes(t)))
      .map((v) => {
        let lock = 0; for (let i = 0; i < v.biz.length; i++) lock = (lock * 31 + v.biz.charCodeAt(i)) % 9999;
        const city = v.city || cap(town);
        const isHome = norm(city) === homeT;
        return { biz: v.biz, tag: v.cat + " · " + city, body: blurb(v.cat, city, isHome), pic: v.pic, img: v.img || null, lock, cta: "Visit website", url: v.url, verified: true };
      });

    const cats = {
      bakery:["bakery,pastry","Bakery"], cafe:["cafe,coffee","Cafe"], coffee:["cafe,coffee","Coffee"],
      restaurant:["restaurant,food","Restaurant"], fast_food:["restaurant,food","Eatery"], deli:["deli,sandwich","Deli"], ice_cream:["ice cream,dessert","Ice Cream"],
      bar:["bar,pub","Bar"], pub:["bar,pub","Pub"], pharmacy:["pharmacy","Pharmacy"],
      florist:["flowers,florist","Florist"], hairdresser:["salon,hair","Salon"], beauty:["salon,spa","Beauty"], barber:["barber,haircut","Barber"],
      books:["bookstore","Bookshop"], hardware:["hardware,tools","Hardware"], doityourself:["hardware,tools","Hardware"],
      bicycle:["bicycle,shop","Bike Shop"], butcher:["butcher,meat","Butcher"], greengrocer:["grocery,produce","Grocer"], supermarket:["grocery,market","Market"],
      convenience:["store,shop","Market"], clothes:["clothing,boutique","Boutique"], shoes:["shoes,store","Shoe Store"], jewelry:["jewelry","Jeweler"],
      car_repair:["auto,garage","Auto Repair"], car:["car,dealer","Auto"], tyres:["tires,auto","Tire Shop"], gym:["gym,fitness","Fitness"],
      funeral_directors:["flowers,memorial","Funeral Home"], funeral_hall:["flowers,memorial","Funeral Home"],
      monuments:["monument,headstone","Headstones"], gravestone:["monument,headstone","Headstones"], stonemason:["monument,headstone","Monument Maker"],
      pet:["pet,supplies","Pet Store"], toys:["toys,store","Toy Store"], carpet:["rugs,home","Rugs & Carpet"], furniture:["furniture,home","Furniture"],
      confectionery:["dessert,sweets","Sweets"], alcohol:["wine,spirits","Wine & Spirits"], hifi:["electronics","Electronics"],
      dentist:["dental,office","Dentist"], doctors:["medical,clinic","Doctor"], clinic:["medical,clinic","Clinic"], optician:["eyewear,optical","Optician"],
      veterinary:["veterinary,animal","Veterinary"], childcare:["childcare,kids","Childcare"], kindergarten:["childcare,kids","Preschool"],
      lawyer:["law,office","Law Office"], insurance:["insurance,office","Insurance"], accountant:["accounting,office","Accountant"],
      estate_agent:["real estate,office","Real Estate"], financial:["finance,office","Financial"], travel_agent:["travel,agency","Travel"],
    };
    const CHAINS = /(mcdonald|starbucks|dunkin|subway|burger king|wendy|domino|pizza hut|taco bell|kfc|chipotle|panera|five guys|chick-fil|popeyes|arby|cvs|walgreens|rite aid|walmart|target|costco|home depot|7-?eleven|circle k|shell|mobil|exxon|citgo|sunoco|bank of america|chase|wells fargo|citizens bank|td bank|santander|dollar |family dollar|gamestop|verizon|t-mobile|planet fitness|ups store|fedex|autozone|advance auto|jiffy lube|supercuts|great clips|petco|petsmart|staples|marshalls|old navy|panda express|wingstop|jersey mike|sonic|dairy queen|baskin|cumberland farms|stop & shop|midas|meineke|firestone|jackson hewitt|h&r block|geico|state farm|allstate|edward jones)/i;

    const R = radius;
    const q = '[out:json][timeout:14];('
      + 'node["shop"]["name"](around:'+R+','+lat+','+lng+');'
      + 'node["amenity"~"restaurant|cafe|bar|pub|bakery|fast_food|ice_cream|pharmacy|dentist|doctors|clinic|veterinary|childcare|kindergarten|funeral_hall|funeral_directors"]["name"](around:'+R+','+lat+','+lng+');'
      + 'node["office"~"lawyer|insurance|accountant|estate_agent|financial|travel_agent"]["name"](around:'+R+','+lat+','+lng+');'
      + 'node["craft"~"stonemason"]["name"](around:'+R+','+lat+','+lng+');'
      + ');out 180;';
    const eps = ["https://overpass.kumi.systems/api/interpreter", "https://overpass-api.de/api/interpreter"];

    let j = null;
    for (const ep of eps) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 9000);
        const r = await fetch(ep, {
          method: "POST",
          body: "data=" + encodeURIComponent(q),
          headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "local-waltham/1.0" },
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        if (r.ok) { j = await r.json(); break; }
      } catch (e) {}
    }
    if (!j || !j.elements) return res.status(200).json({ town, sponsors: verifiedPicks });

    const typeOf = (t) => (t.shop || t.amenity || t.office || t.craft || t.healthcare || "").toLowerCase();
    const FUNERAL = { funeral_directors:1, funeral_hall:1, florist:1, monuments:1, gravestone:1, stonemason:1 };
    const isFuneral = (t) => !!FUNERAL[typeOf(t)];
    const webOf = (t) => (t.website || t["contact:website"] || t.url || "").trim();
    const hasWeb = (t) => !!webOf(t);
    const isChain = (t) => !!(t.brand || t["brand:wikidata"] || CHAINS.test(t.name || ""));
    const cityOf = (t) => norm(t["addr:city"] || t["addr:suburb"] || t["addr:neighbourhood"]);
    const inScope = (t) => {
      if (isFuneral(t)) return true;
      if (!townSet.length) return true;
      const c = cityOf(t);
      if (!c) return true;
      return townSet.includes(c);
    };
    const keep = (t) => isFuneral(t) || hasWeb(t);
    const homeScore = (t) => { const c = cityOf(t); if (!c) return 1; return c === homeT ? 2 : 0; };
    const prio = (t) => (isFuneral(t) ? 1 : 0);
    // a record whose category we actually recognise beats a vague/wrong one
    const known = (t) => (cats[typeOf(t)] ? 1 : 0);

    let named = j.elements.filter((e) => e && e.tags && e.tags.name && !isChain(e.tags) && keep(e.tags) && inScope(e.tags));
    if (named.length < 3) named = j.elements.filter((e) => e && e.tags && e.tags.name && !isChain(e.tags) && keep(e.tags));

    // collapse punctuation/spacing variants of the same business ("Adi's" vs "Adis")
    const byKey = {};
    for (const el of named) {
      const k = nkey(el.tags.name);
      if (!k) continue;
      const cur = byKey[k];
      if (!cur) { byKey[k] = el; continue; }
      const score = (e) => (hasWeb(e.tags) ? 4 : 0) + (known(e.tags) ? 2 : 0) + (cityOf(e.tags) ? 1 : 0);
      if (score(el) > score(cur)) byKey[k] = el;
    }
    named = Object.values(byKey);

    named.sort((a, b) =>
      (homeScore(b.tags) - homeScore(a.tags)) ||
      (prio(b.tags) - prio(a.tags)) ||
      ((hasWeb(b.tags) ? 1 : 0) - (hasWeb(a.tags) ? 1 : 0)) ||
      (norm(a.tags.name) < norm(b.tags.name) ? -1 : 1)
    );

    const seenName = {}; verifiedPicks.forEach((v) => { seenName[nkey(v.biz)] = 1; });
    const seenType = {}, picks = [];
    for (const pass of [1, 2]) {
      for (const el of named) {
        const t = el.tags, name = t.name;
        if (seenName[nkey(name)]) continue;
        const type = typeOf(t);
        if (pass === 1 && seenType[type]) continue;
        const meta = cats[type] || ["storefront,shop", cap((type || "shop").replace(/_/g, " "))];

        const realCity = t["addr:city"] || t["addr:suburb"] || t["addr:neighbourhood"] || "";
        const cityLabel = realCity ? cap(realCity) : "";
        const isHome = cityLabel && norm(cityLabel) === homeT;

        let web = webOf(t);
        const direct = !!web;
        if (web && !/^https?:\/\//i.test(web)) web = "https://" + web;
        if (!web) web = "https://www.google.com/search?q=" + encodeURIComponent(name + " " + (cityLabel || town) + " " + st);
        let lock = 0; for (let i = 0; i < name.length; i++) lock = (lock * 31 + name.charCodeAt(i)) % 9999;

        const tag = cityLabel ? (meta[1] + " · " + cityLabel) : (meta[1] + " · Near " + cap(town));
        const body = cityLabel
          ? blurb(meta[1], cityLabel, isHome)
          : "A local " + meta[1].toLowerCase() + " serving " + cap(town) + " and surrounding areas.";

        picks.push({ biz: name, tag, body, pic: meta[0], lock, cta: direct ? "Visit website" : "View business", url: web });
        seenName[nkey(name)] = 1; seenType[type] = 1;
        if (picks.length >= 12) break;
      }
      if (picks.length >= 12) break;
    }

    const sponsors = verifiedPicks.concat(picks).slice(0, 12);
    res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=604800");
    return res.status(200).json({ town, sponsors });
  } catch (e) {
    return res.status(200).json({ town, sponsors: [], error: String(e) });
  }
}
Duplicate business records now collapse into one card, keeping whichever has a real website and the correct category — so "Adi's Bike World" shows once, as a Bike Shop.

Tell me when committed, and whether to start on registration-gating + photo posts.

ok lets do recommendation 1 and 2 and once that is done let me know what it would take for 3 to happen
Building both now — registration gate on posting/replying, and photo attachments.

Now the photo in the composer and rendered on posts:

Now the "register to post" notice:

Both built:

1. Registration required to post or reply — reading stays completely free and open. Tapping + or Reply without registering shows a friendly prompt: "Reading is always free. Registering with your email and town lets you post and reply — and keeps the conversation real neighbors only." Blocked attempts get tracked, so you'll see how many people hit that wall (a good signal).

2. Photo attachments — an "Add a photo" button in the composer. The phone shrinks the image before uploading (max 900px, compressed), shows a preview with a Remove option, and photos display in the feed.

Step 1
Download this file:

What #3 (private messaging) would take:

It's a bigger lift than 1 and 2, but very doable — roughly:

Message storage — a new backend endpoint (api/messages.js) using the same Redis store you already have. Conversations keyed by the two users' IDs.
Stable user identity — right now users are anonymous IDs. For messaging, each registered person needs a persistent account ID tied to their email, so messages find them across sessions.
A "Message" button on neighbor posts, plus an Inbox (probably a new tab or a badge in the header).
Relay privacy — neither side ever sees the other's email; the app passes messages between IDs only.
Safety controls — block/report, and rate limits so one person can't spam the town. Non-negotiable for private messaging.
Time/complexity: meaningfully more than today's work — call it a focused session, mostly because of the inbox UI and the safety controls.

My honest advice: wait. Private messaging only matters once people are actively posting. Right now public replies handle 90% of real needs ("who's a good plumber" gets answered in the thread, where everyone benefits). Build messaging when you see real posts piling up and people asking for it — that's earned demand rather than guessed.

Move the file to www, sync, and rebuild. Tell me how the photo posting feels.

Edited 2 files
Found issues — fixing…
Caught an important gap: the backend wasn't saving photos or reply threading — both worked on your own screen but vanished for everyone else. Backend fix:

Step 1
Go to https://github.com/YOURLOCALTOWN/local-waltham-api/blob/main/api/posts.js

Click the pencil icon → select all (Cmd+A) → delete → paste this entire file → Commit changes:

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

      // photo: accept a reasonably sized data URL only
      let photo = (b.photo || "").toString();
      if (photo && !/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(photo)) photo = "";
      if (photo.length > 700000) photo = "";

      const post = {
        id: b.id || ("nb_" + Date.now()),
        town, st: (b.st || "").toString(),
        parent: (b.parent || "").toString(),
        cat: (b.cat || "General").toString().slice(0, 30),
        author: mask((b.author || "A neighbor").toString().slice(0, 40)),
        body: mask((b.body || "").toString().slice(0, 800)),
        photo,
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
