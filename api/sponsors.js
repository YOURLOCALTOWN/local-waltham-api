// Verified sponsors you control (always shown first for their towns). Add real advertisers here.
const VERIFIED = [
  {
    towns: ["waltham", "watertown", "belmont", "newton", "lexington", "weston", "lincoln"],
    biz: "Brasco & Sons Memorial Chapels",
    cat: "Funeral Home", pic: "flowers,memorial", city: "Waltham",
    url: "https://www.brascofuneralhome.com",
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
    const townSet = (req.query.towns || town).toString().split("|").map(norm).filter(Boolean);
    const homeT = norm(town);

    // verified sponsors that serve this town
    const verifiedPicks = VERIFIED
      .filter((v) => v.towns.includes(homeT) || v.towns.some((t) => townSet.includes(t)))
      .map((v) => {
        let lock = 0; for (let i = 0; i < v.biz.length; i++) lock = (lock * 31 + v.biz.charCodeAt(i)) % 9999;
        return { biz: v.biz, tag: v.cat + " · " + v.city, body: "A local " + v.cat.toLowerCase() + " serving " + v.city + " families. Tap for details.", pic: v.pic, lock, cta: "Visit website", url: v.url, verified: true };
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
      pet:["pet,supplies","Pet Store"], toys:["toys,store","Toy Store"],
      dentist:["dental,office","Dentist"], doctors:["medical,clinic","Doctor"], clinic:["medical,clinic","Clinic"], optician:["eyewear,optical","Optician"],
      veterinary:["veterinary,animal","Veterinary"], childcare:["childcare,kids","Childcare"], kindergarten:["childcare,kids","Preschool"],
      lawyer:["law,office","Law Office"], insurance:["insurance,office","Insurance"], accountant:["accounting,office","Accountant"],
      estate_agent:["real estate,office","Real Estate"], financial:["finance,office","Financial"], travel_agent:["travel,agency","Travel"],
    };
    const cap = (s) => (s || "").replace(/\b\w/g, (c) => c.toUpperCase());
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

    let named = j.elements.filter((e) => e && e.tags && e.tags.name && !isChain(e.tags) && keep(e.tags) && inScope(e.tags));
    if (named.length < 3) named = j.elements.filter((e) => e && e.tags && e.tags.name && !isChain(e.tags) && keep(e.tags));
    named.sort((a, b) =>
      (prio(b.tags) - prio(a.tags)) ||
      (homeScore(b.tags) - homeScore(a.tags)) ||
      ((hasWeb(b.tags) ? 1 : 0) - (hasWeb(a.tags) ? 1 : 0)) ||
      (norm(a.tags.name) < norm(b.tags.name) ? -1 : 1)
    );

    const seenName = {}; verifiedPicks.forEach((v) => { seenName[norm(v.biz)] = 1; });
    const seenType = {}, picks = [];
    for (const pass of [1, 2]) {
      for (const el of named) {
        const t = el.tags, name = t.name;
        if (seenName[norm(name)]) continue;
        const type = typeOf(t);
        if (pass === 1 && seenType[type]) continue;
        const meta = cats[type] || ["storefront,shop", cap((type || "shop").replace(/_/g, " "))];
        const cityLabel = cap(t["addr:city"] || t["addr:suburb"] || town);
        let web = webOf(t);
        const direct = !!web;
        if (web && !/^https?:\/\//i.test(web)) web = "https://" + web;
        if (!web) web = "https://www.google.com/search?q=" + encodeURIComponent(name + " " + cityLabel + " " + st);
        let lock = 0; for (let i = 0; i < name.length; i++) lock = (lock * 31 + name.charCodeAt(i)) % 9999;
        picks.push({
          biz: name, tag: meta[1] + " · " + cityLabel,
          body: "A local " + meta[1].toLowerCase() + " serving " + cityLabel + " families. Tap for details.",
          pic: meta[0], lock, cta: direct ? "Visit website" : "View business", url: web,
        });
        seenName[norm(name)] = 1; seenType[type] = 1;
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
