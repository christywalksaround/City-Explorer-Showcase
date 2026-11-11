import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import express from "express";

// Stub only the external network and key expression; never read actual secrets.
test("Unsplash search, attribution, tracking, and missing-key behavior", async () => {
  const dir = await mkdtemp(new URL("../node_modules/.unsplash-test-", import.meta.url).pathname);
  const nativeFetch = globalThis.fetch;
  globalThis.__unsplashTestKey = "test-only";
  const calls = [];
  let fail = false;
  let emptyExact = false;
  let server;
  try {
    const outfile = join(dir, "route.cjs");
    await build({
      entryPoints: [new URL("../src/routes/unsplash.ts", import.meta.url).pathname],
      outfile, bundle: true, platform: "node", format: "cjs", external: ["express"],
      define: { "process.env.UNSPLASH_ACCESS_KEY": "globalThis.__unsplashTestKey" },
    });
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.log = { warn() {} }; next(); });
    app.use("/api", createRequire(import.meta.url)(outfile).default);
    server = app.listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}/api/unsplash`;
    globalThis.fetch = async (url, options) => {
      calls.push({ url: new URL(url), options });
      if (fail) return new Response("", { status: 429 });
      if (emptyExact && url.searchParams.get("query") !== "crawfish") return Response.json({ results: [] });
      return Response.json({ results: Array.from({ length: 8 }, (_, i) => ({
        id: `photo${i}`, alt_description: "Crawfish on a plate", description: null,
        urls: { regular: "https://images.unsplash.com/photo-test?w=1080", raw: "https://images.unsplash.com/photo-test" },
        links: { download_location: `https://api.unsplash.com/photos/photo${i}/download?ixid=keep` },
        user: { name: "Test Photographer", links: { html: "https://unsplash.com/@photographer" } },
      })) });
    };
    const response = await nativeFetch(`${base}/dish-inspiration`);
    assert.equal(response.status, 200);
    const photos = await response.json();
    assert.equal(photos.length, 6);
    assert.equal(calls[0].url.searchParams.get("query"), "Houston Viet-Cajun crawfish");
    assert.equal(calls[0].url.searchParams.get("per_page"), "6");
    assert.equal(calls[0].options.headers.Authorization, "Client-ID test-only");
    assert.match(photos[0].photographerProfileUrl, /utm_source=houston_city_guide/);
    assert.equal(photos[0].imageUrl, "https://images.unsplash.com/photo-test?w=1080");
    const track = (downloadLocation) => nativeFetch(`${base}/download`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ downloadLocation }),
    });
    assert.equal((await track(photos[0].downloadLocation)).status, 204);
    assert.equal(calls.at(-1).url.searchParams.get("ixid"), "keep");
    const count = calls.length;
    assert.equal((await track("https://example.com/photos/a/download")).status, 400);
    assert.equal(calls.length, count);
    emptyExact = true;
    const broadened = await nativeFetch(`${base}/dish-inspiration`);
    assert.equal(broadened.status, 200);
    assert.equal((await broadened.json()).length, 6);
    assert.equal(calls.at(-2).url.searchParams.get("query"), "Houston Viet-Cajun crawfish");
    assert.equal(calls.at(-1).url.searchParams.get("query"), "crawfish");
    fail = true;
    assert.equal((await nativeFetch(`${base}/dish-inspiration`)).status, 502);
    globalThis.__unsplashTestKey = undefined;
    const missing = await nativeFetch(`${base}/dish-inspiration`);
    assert.equal(missing.status, 503);
    assert.match((await missing.json()).error, /UNSPLASH_ACCESS_KEY/);
  } finally {
    globalThis.fetch = nativeFetch;
    delete globalThis.__unsplashTestKey;
    if (server) await new Promise(resolve => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});
