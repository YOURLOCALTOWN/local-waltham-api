export default async function handler(req, res) {
  // Allow your app to call this from anywhere
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  const town = (req.query.town || "waltham")
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");
  const sort = (req.query.sort || "hot").toString();

  const url = `https://www.reddit.com/r/${town}/${sort}.json?limit=40&raw_json=1`;

  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": "web:local-waltham:v1.0 (by /u/yourlocaltown)",
      },
    });

    if (!r.ok) {
      return res.status(200).json({ town, posts: [], error: `reddit ${r.status}` });
    }

    const data = await r.json();
    const posts = (data?.data?.children || []).map((c) => {
      const p = c.data;
      return {
        id: p.id,
        title: p.title,
        author: p.author,
        score: p.score,
        comments: p.num_comments,
        created: p.created_utc,
        url: `https://www.reddit.com${p.permalink}`,
        thumb: p.thumbnail && p.thumbnail.startsWith("http") ? p.thumbnail : null,
        selftext: (p.selftext || "").slice(0, 400),
        flair: p.link_flair_text || null,
      };
    });

    // Cache for 5 minutes so we don't hammer Reddit
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    return res.status(200).json({ town, count: posts.length, posts });
  } catch (e) {
    return res.status(200).json({ town, posts: [], error: String(e) });
  }
}
