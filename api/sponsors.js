xport default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  const town = (req.query.town || "").toString();
  const st = (req.query.st || "").toString();
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    if (isNaN(lat) || isNaN(lng)) return res.status(200).json({ town, sponsors: [] });

    const cats = {
      bakery:["bakery,pastry","Bakery"], cafe:["cafe,coffee","Cafe"], coffee:["cafe,coffee","Coffee"],
      restaurant:["restaurant,food","Restaurant"], fast_food:["restaurant,food","Eatery"],
      bar:["bar,pub","Bar"], pub:["bar,pub","Pub"], pharmacy:["pharmacy","Pharmacy"],
      florist:["flowers,florist","Florist"], hairdresser:["salon,hair","Salon"], beauty:["salon,spa","Beauty"],
      books:["bookstore","Bookshop"], hardware:["hardware,tools","Hardware"], doityourself:["hardware,tools","Hardware"],
      bicycle:["bicycle,shop","Bike Shop"], butcher:["butcher,meat","Butcher"], greengrocer:["grocery,produce","Grocer"],
      convenience:["store,shop","Market"], clothes:["clothing,boutique","Boutique"], jewelry:["jewelry","Jeweler"],
      car_repair:["auto,garage","Auto Repair"], gym:["gym,fitness","Fitness"], deli:["deli,sandwich","Deli"], ice_cream:["ice cream,dessert","Ice Cream"],
    };
    const cap = (s) => (s || "").replace(/\b\w/g, (c) => c.toUpperCase());
    const CHAINS = /(mcdonald|starbucks|dunkin|subway|burger king|wendy|domino|pizza hut|taco bell|kfc|chipotle|panera|five guys|chick-fil|popeyes|arby|cvs|walgreens|rite aid|walmart|target|costco|home depot|7-?eleven|circle k|shell|mobil|exxon|citgo|sunoco|bank of america|chase|wells fargo|citizens bank|td bank|santander|dollar |family dollar|gamestop|verizon|t-mobile|planet fitness|ups store|fedex|autozone|advance auto|jiffy lube|supercuts|great clips|petco|petsmart|staples|marshalls|old navy|panda express|wingstop|jersey mike|sonic|dairy queen|baskin|cumberland farms|stop & shop)/i;

    const q = '[out:json][timeout:8];(nwr["shop"]["name"](around:6000,'+lat+','+lng+');nwr["amenity"~"restaurant|cafe|bar|pub|bakery|fast_food|ice_cream"]["name"](around:6000,'+lat+','+lng+'););out center 80;';
    const eps = ["https://overpass.kumi.systems/api/interpreter", "https://overpass-api.de/api/interpreter"];

    let j = null;
    for (const ep of eps) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 6000);
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
    if (!j || !j.elements) return res.status(200).json({ town, sponsors: [] });

    const hasWeb = (t) => !!(t.website || t["contact:website"] || t.url);
    const isChain = (t) => !!(t.brand || t["brand:wikidata"] || CHAINS.test(t.name || ""));
    const norm = (s) => (s || "").trim().toLowerCase();
    const inTown = (t) => !town || norm(t["addr:city"]) === norm(town);
    let named = j.elements.filter((e) => e && e.tags && e.tags.name && !isChain(e.tags) && inTown(e.tags));
    if (named.length < 4) named = j.elements.filter((e) => e && e.tags && e.tags.name && !isChain(e.tags));
    named.sort((a, b) => (hasWeb(b.tags) ? 1 : 0) - (hasWeb(a.tags) ? 1 : 0));

    const seenName = {}, seenType = {}, picks = [];
    for (const pass of [1, 2]) {
      for (const el of named) {
        const t = el.tags, name = t.name;
        if (seenName[name]) continue;
        const type = (t.shop || t.amenity || "").toLowerCase();
        if (pass === 1 && seenType[type]) continue;
        const meta = cats[type] || ["storefront,shop", cap((type || "shop").replace(/_/g, " "))];
        let web = (t.website || t["contact:website"] || t.url || "").trim();
        const direct = !!web;
        if (web && !/^https?:\/\//i.test(web)) web = "https://" + web;
        if (!web) web = "https://www.google.com/search?q=" + encodeURIComponent(name + " " + town + " " + st);
        let lock = 0; for (let i = 0; i < name.length; i++) lock = (lock * 31 + name.charCodeAt(i)) % 9999;
        picks.push({
          biz: name, tag: meta[1] + " · " + town,
          body: "A local " + meta[1].toLowerCase() + " right here in " + town + ". Tap for hours, reviews & directions.",
          pic: meta[0], lock, cta: direct ? "Visit website" : "View business", url: web,
        });
        seenName[name] = 1; seenType[type] = 1;
        if (picks.length >= 12) break;
      }
      if (picks.length >= 12) break;
    }

    res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=604800");
    return res.status(200).json({ town, sponsors: picks });
  } catch (e) {
    return res.status(200).json({ town, sponsors: [], error: String(e) });
  }
}
