xport default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  const townRaw = (req.query.town || "Waltham MA").toString().trim();
  const q = encodeURIComponent(townRaw);
  const url = `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;

  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      },
    });

    if (!r.ok) {
      return res.status(200).json({ town: townRaw, posts: [], error: `news ${r.status}` });
    }

    const xml = await r.text();
    const items = xml.split("<item>").slice(1).map((chunk) => {
      const grab = (tag) => {
        const m = chunk.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
        return m ? m[1] : "";
      };
      const clean = (s) =>
        s
          .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
          .replace(/<[^>]+>/g, "")
          .replace(/&amp;/g, "&")
          .replace(/&#39;/g, "'")
          .replace(/&quot;/g, '"')
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .trim();

      let title = clean(grab("title"));
      const source = clean(grab("source")) || "Local News";
      // Google News titles end with " - Source"; strip it
      title = title.replace(new RegExp(`\\s*-\\s*${source}\\s*$`), "");

      const link = clean(grab("link"));
      const pub = grab("pubDate");
      const created = pub ? Math.floor(new Date(pub).getTime() / 1000) : null;

      return {
        id: link.slice(-16) || Math.random().toString(36).slice(2),
        title,
        author: source,
        score: null,
        comments: null,
        created,
        url: link,
        thumb: null,
        selftext: "",
        flair: source,
      };
    }).filter((p) => p.title);

    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=1200");
    return res.status(200).json({ town: townRaw, count: items.length, posts: items });
  } catch (e) {
    return res.status(200).json({ town: townRaw, posts: [], error: String(e) });
  }
}
