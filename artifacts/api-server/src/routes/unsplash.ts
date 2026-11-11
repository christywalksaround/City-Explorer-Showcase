import { Router, type IRouter } from "express";
import { z } from "zod";
import { cityGuideSettings } from "../city";

const router: IRouter = Router();
const setupMessage = "Food inspiration is not configured yet. Add an UNSPLASH_ACCESS_KEY secret to enable it.";
const upstreamPhoto = z.object({
  id: z.string(),
  alt_description: z.string().nullable(),
  description: z.string().nullable(),
  urls: z.object({ regular: z.string().url(), raw: z.string().url() }),
  links: z.object({ download_location: z.string().url() }),
  user: z.object({ name: z.string(), links: z.object({ html: z.string().url() }) }),
});

// Authenticate only on the server. Never put the access key in a browser URL.
async function unsplashFetch(url: URL, key: string) {
  return fetch(url, {
    headers: { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" },
    signal: AbortSignal.timeout(12_000),
    redirect: "error",
  });
}

router.get("/unsplash/dish-inspiration", async (req, res) => {
  const key = process.env.UNSPLASH_ACCESS_KEY?.trim();
  if (!key) { res.status(503).json({ error: setupMessage }); return; }
  try {
    const url = new URL("https://api.unsplash.com/search/photos");
    url.searchParams.set("query", `${cityGuideSettings.city} ${cityGuideSettings.favoriteDish}`);
    url.searchParams.set("per_page", "6");
    url.searchParams.set("content_filter", "high");
    let response = await unsplashFetch(url, key);
    if (!response.ok) throw new Error("upstream");
    const searchResults = z.object({ results: z.array(upstreamPhoto) });
    let data = searchResults.parse(await response.json());
    // The exact local dish may not be indexed. Only broaden an empty search,
    // never hide API failures or mix general photos into successful exact results.
    if (data.results.length === 0) {
      url.searchParams.set("query", cityGuideSettings.inspirationFallbackQuery);
      response = await unsplashFetch(url, key);
      if (!response.ok) throw new Error("upstream");
      data = searchResults.parse(await response.json());
    }
    res.setHeader("Cache-Control", "no-store");
    res.json(data.results.slice(0, 6).map((photo) => {
      const profile = new URL(photo.user.links.html);
      profile.searchParams.set("utm_source", "houston_city_guide");
      profile.searchParams.set("utm_medium", "referral");
      return {
        id: photo.id,
        // Hotlink Unsplash's returned image URLs, retaining their tracking parameters.
        imageUrl: photo.urls.regular,
        rawUrl: photo.urls.raw,
        altText: photo.alt_description || photo.description || "Food inspiration photo from Unsplash",
        photographerName: photo.user.name,
        photographerProfileUrl: profile.toString(),
        downloadLocation: photo.links.download_location,
      };
    }));
  } catch {
    req.log.warn("Unsplash inspiration request failed");
    res.status(502).json({ error: "Food inspiration is temporarily unavailable. Please try Refresh Inspiration shortly." });
  }
});

router.post("/unsplash/download", async (req, res) => {
  const key = process.env.UNSPLASH_ACCESS_KEY?.trim();
  if (!key) { res.status(503).json({ error: setupMessage }); return; }
  let url: URL;
  try {
    url = new URL(z.string().max(2048).parse(req.body?.downloadLocation));
    // Prevent this server-side proxy from being used to call arbitrary hosts.
    if (url.origin !== "https://api.unsplash.com" || url.username || url.password ||
        !/^\/photos\/[A-Za-z0-9_-]+\/download$/.test(url.pathname)) throw new Error("invalid");
  } catch {
    res.status(400).json({ error: "Invalid Unsplash photo download location." }); return;
  }
  try {
    const response = await unsplashFetch(url, key);
    if (!response.ok) throw new Error("upstream");
    res.sendStatus(204);
  } catch {
    req.log.warn("Unsplash download tracking request failed");
    res.status(502).json({ error: "We couldn't open this Unsplash photo right now. Please try again." });
  }
});

export default router;
