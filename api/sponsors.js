export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  const town = (req.query.town || "").toString();
  const st = (req.query.st || "").toString();
  if (isNaN(lat) || isNaN(lng)) return res.status(200).json({ sponsors: [] });

  const cats = {
    bakery:["bakery,pastry","Bakery"], cafe:["cafe,coffee","Cafe"], coffee:["cafe,coffee","Coffee"],
    restaurant:["restaurant,food","Restaurant"], fast_food:["restaurant,food","Eatery"],
    bar:["bar,pub","Bar"], pub:["bar,pub","Pub"], pharmacy:["pharmacy","Pharmacy"],
    florist:["flowers,florist","Florist"], hairdresser:["salon,hair","Salon"], beauty:["salon,spa","Beauty"],
    books:["bookstore","Bookshop"], hardware:["hardware,tools","Hardware"], doityourself:["hardware,tools","Hardware"],
    bicycle:["bicycle,shop","Bike Shop"], butcher:["butcher,meat","Butcher"], greengrocer:["grocery,produce","Grocer"],
    convenience:["store,shop","Market"], clothes:["clothing,boutique","Boutique"], jewelry:["jewelry","Jeweler"],
    car_repair:["auto,garage","Auto Repair"], gym:["gym,fitness","Fitness"], deli:["deli,sandwich","Deli"],
  };
  const cap = (s) => (s || "").replace(/\b\w/g, (c) => c.toUpperCase());
  const q = '[out:json][timeout:25];(node["shop"]["name"](around:7000,'+lat+','+lng+');node["amenity"~"restaurant|cafe|bar|pub|pharmacy|fast_food|bank|fuel"]["name"](around:7000,'+lat+','+lng+'););out 200;';
  const eps = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];

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
  if (!j || !j.elements) return res.status(200).json({ town, sponsors: [] });

  const hasWeb = (t) => !!(t.website || t["contact:website"] || t.url);
  const named = j.elements.filter((e) => e.tags && e.tags.name);
  const els = named.sort((a, b) => (hasWeb(b.tags) ? 1 : 0) - (hasWeb(a.tags) ? 1 : 0));

  const seenName = {}, seenType = {}, picks = [];
  for (const pass of [1, 2]) {
    for (const el of els) {
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
        body: "Your neighborhood " + meta[1].toLowerCase() + " in " + town + ". Tap for hours, reviews & directions.",
        pic: meta[0], lock, cta: direct ? "Visit website" : "View business", url: web,
      });
      seenName[name] = 1; seenType[type] = 1;
      if (picks.length >= 12) break;
    }
    if (picks.length >= 12) break;
  }

  res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=604800");
  return res.status(200).json({ town, sponsors: picks });
}
