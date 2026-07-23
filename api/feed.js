export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  const townRaw = (req.query.town || "Waltham MA").toString().trim();
  const q = encodeURIComponent(townRaw);
  const url = `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;

  const UA =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

  const clean = (s) =>
    (s || "")
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"')
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();

  async function ogImage(link) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 2800);
      const r = await fetch(link, { headers: { "User-Agent": UA }, redirect: "follow", signal: ctrl.signal });
      clearTimeout(timer);
      // If we couldn't escape Google's redirect, don't show its logo
      if (!r.ok || /(^|\.)google\.com$/i.test(new URL(r.url).hostname)) return null;
      const html = (await r.text()).slice(0, 150000);
      const m =
        html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
        html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
        html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
      const img = m && m[1];
      return img && /^https?:\/\//i.test(img) ? img : null;
    } catch (e) {
      return null;
    }
  }

  try {
    const r = await fetch(url, { headers: { "User-Agent": UA } });
    if (!r.ok) return res.status(200).json({ town: townRaw, posts: [], error: `news ${r.status}` });

    const xml = await r.text();
    const chunks = xml.split("<item>").slice(1);
    const posts = [];

    for (const chunk of chunks) {
      try {
        const grab = (tag) => {
          const m = chunk.match(new RegExp("<" + tag + "[^>]*>([\\s\\S]*?)</" + tag + ">"));
          return m ? m[1] : "";
        };
        let title = clean(grab("title"));
        const source = clean(grab("source")) || "Local News";
        if (source && title.endsWith(source)) {
          title = title.slice(0, title.length - source.length).replace(/\s*-\s*$/, "").trim();
        }
        const link = clean(grab("link"));
        const pub = grab("pubDate").trim();
        const t = pub ? new Date(pub).getTime() : NaN;
        const created = isNaN(t) ? null : Math.floor(t / 1000);
        if (!title) continue;
        posts.push({
          id: link.slice(-16) || String(posts.length),
          title, author: source, score: null, comments: null, created,
          url: link, thumb: null, selftext: "", flair: source,
        });
      } catch (e) {}
    }

    // best-effort preview images for the first batch (parallel, capped)
    const N = Math.min(16, posts.length);
    await Promise.allSettled(posts.slice(0, N).map(async (p) => { p.thumb = await ogImage(p.url); }));

    res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=1800");
    return res.status(200).json({ town: townRaw, count: posts.length, posts });
  } catch (e) {
    return res.status(200).json({ town: townRaw, posts: [], error: String(e) });
  }
}
