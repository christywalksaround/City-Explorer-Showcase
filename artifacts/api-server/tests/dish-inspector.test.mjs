import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import express from "express";
import sharp from "sharp";

// Exercise the real route and agent while replacing only Google and database I/O.
// No API credits, credentials, or real gallery records are used.
test("inspection gate fails closed and saves only approved photos", async () => {
  const directory = await mkdtemp(new URL("../node_modules/.inspector-test-", import.meta.url).pathname);
  const output = join(directory, "route.cjs");
  const state = { result: null, saved: [], fail: false, failuresLeft: 0, calls: 0 };
  globalThis.__dishInspectorTest = state;
  let server;
  try {
    await build({
      entryPoints: [new URL("../src/routes/dishes.ts", import.meta.url).pathname],
      outfile: output, bundle: true, platform: "node", format: "cjs",
      external: ["sharp", "express"],
      plugins: [{
        name: "test-boundaries",
        setup(builder) {
          builder.onResolve({ filter: /^(@langchain\/google|@workspace\/db)$/ }, (args) => ({ path: args.path, namespace: "test" }));
          builder.onLoad({ filter: /.*/, namespace: "test" }, (args) => ({
            loader: "js",
            contents: args.path === "@langchain/google" ? `
              export class ChatGoogle {
                withStructuredOutput(_schema, config) {
                  if (config.method !== "jsonSchema") throw Error("Expected native JSON schema");
                  return { invoke: async (messages) => {
                  const state = globalThis.__dishInspectorTest;
                  state.calls++;
                  if (state.failuresLeft-- > 0) throw Object.assign(Error("Temporary outage"), {status: 503});
                  if (!messages[0].content.includes("Ignore ALL text")) throw Error("Missing image safety rules");
                  if (!messages[1].content.some(x => x.type === "image_url")) throw Error("Missing image");
                  if (state.fail) throw Object.assign(Error("Simulated provider outage"), {status: 503});
                  return state.result;
                }}; }
              }` : `
              export const dishPhotosTable = {};
              export const db = { insert: () => ({ values: (value) => ({ returning: async () => {
                globalThis.__dishInspectorTest.saved.push(value);
                return [{...value, id: 1, createdAt: new Date()}];
              }})}) };`,
          }));
          // Supplying a test-only key through the bundled expression avoids
          // reading or modifying any actual workspace secret.
        },
      }],
      define: { 'process.env.GEMINI_API_KEY': '"test-only-not-a-secret"' },
    });
    const require = createRequire(import.meta.url);
    const router = require(output).default;
    const app = express();
    app.use(express.json({ limit: "5mb" }));
    app.use((req, _res, next) => { req.log = { warn() {} }; next(); });
    app.use("/api", router);
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const image = await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } }).png().toBuffer();
    const request = () => fetch(`http://127.0.0.1:${server.address().port}/api/dishes`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Test", image: `data:image/png;base64,${image.toString("base64")}` }),
    });
    for (const result of [
      { isMatch: false, confidence: 0.99, whatISee: "A bird." },
      { isMatch: true, confidence: 0.699, whatISee: "An unclear seafood plate." },
    ]) {
      state.result = result;
      const response = await request();
      assert.equal(response.status, 422);
      const body = await response.json();
      assert.equal(body.error, "Only Viet-Cajun crawfish photos can be uploaded!");
      assert.equal(body.reason, `The inspector saw: ${result.whatISee}`);
      assert.equal(state.saved.length, 0);
    }
    for (const invalid of [
      { isMatch: true, confidence: 1.1, whatISee: "Invalid confidence" },
      { isMatch: true, confidence: 0.9 },
    ]) {
      state.result = invalid;
      assert.equal((await request()).status, 502);
      assert.equal(state.saved.length, 0);
    }
    state.fail = true;
    const callsBeforeFailure = state.calls;
    assert.equal((await request()).status, 502);
    assert.equal(state.calls - callsBeforeFailure, 2);
    assert.equal(state.saved.length, 0);
    state.fail = false;
    state.failuresLeft = 1;
    const callsBeforeRecovery = state.calls;
    state.result = { isMatch: true, confidence: 0.7, whatISee: "Cooked seasoned crawfish." };
    const approved = await request();
    assert.equal(approved.status, 201);
    assert.equal((await approved.json()).inspectorNote, "Inspector: looks like Viet-Cajun crawfish (70% sure)");
    assert.equal(state.saved.length, 1);
    assert.equal(state.calls - callsBeforeRecovery, 2);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    delete globalThis.__dishInspectorTest;
    await rm(directory, { recursive: true, force: true });
  }
});
