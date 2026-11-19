import test from "node:test";
import assert from "node:assert/strict";
import {
  INSTAGRAM_PUBLIC_ERROR,
  createInstagramFeedService,
  createInstagramHandler,
  resolveInstagramUsername
} from "../../server/api/instagram.js";

const PAYLOAD = {
  user: { username: "configured", all_media_count: 9 },
  posts: [1, 2, 3, 4].map((index) => ({
    id: String(index),
    code: `CODE${index}`,
    display_url: `https://example.test/${index}.jpg`,
    caption: `Post ${index}`
  }))
};

function createClock(start = 1_000_000) {
  let current = start;
  return {
    now: () => current,
    advance: (ms) => { current += ms; }
  };
}

function createResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    set(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test("feed service always fetches the configured username, never a caller-supplied one", async () => {
  const requested = [];
  const service = createInstagramFeedService({
    username: "configured",
    inlineImages: false,
    loadPayload: async (username) => { requested.push(username); return PAYLOAD; }
  });

  await service.getFeed(4);

  assert.deepEqual(requested, ["configured"]);
});

test("feed service shares one in-flight fetch between concurrent callers", async () => {
  let calls = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const service = createInstagramFeedService({
    username: "configured",
    inlineImages: false,
    loadPayload: async () => { calls += 1; await gate; return PAYLOAD; }
  });

  const pending = [service.getFeed(4), service.getFeed(2), service.getFeed(4)];
  release();
  const [four, two] = await Promise.all(pending);

  assert.equal(calls, 1);
  assert.equal(four.posts.length, 4);
  assert.equal(two.posts.length, 2);
});

test("feed service caches successes until the success TTL expires", async () => {
  const clock = createClock();
  let calls = 0;
  const service = createInstagramFeedService({
    username: "configured",
    inlineImages: false,
    now: clock.now,
    successTtlMs: 1000,
    loadPayload: async () => { calls += 1; return PAYLOAD; }
  });

  await service.getFeed(4);
  clock.advance(999);
  await service.getFeed(4);
  assert.equal(calls, 1);

  clock.advance(2);
  await service.getFeed(4);
  assert.equal(calls, 2);
});

test("feed service caches failures so repeated requests do not spawn new fetches", async () => {
  const clock = createClock();
  let calls = 0;
  const service = createInstagramFeedService({
    username: "configured",
    inlineImages: false,
    now: clock.now,
    failureTtlMs: 5000,
    loadPayload: async () => { calls += 1; throw new Error("Command failed: python secret/path.py"); }
  });

  await assert.rejects(service.getFeed(4));
  await assert.rejects(service.getFeed(4));
  await assert.rejects(service.getFeed(4));
  assert.equal(calls, 1);

  clock.advance(5001);
  await assert.rejects(service.getFeed(4));
  assert.equal(calls, 2);
});

test("feed service reports each failed refresh once, not every cached rejection", async () => {
  const reported = [];
  const service = createInstagramFeedService({
    username: "configured",
    inlineImages: false,
    onRefreshError: (error) => reported.push(error.message),
    loadPayload: async () => { throw new Error("upstream down"); }
  });

  await assert.rejects(service.getFeed(4));
  await assert.rejects(service.getFeed(4));

  assert.deepEqual(reported, ["upstream down"]);
});

test("handler ignores the username query parameter", async () => {
  const requested = [];
  const service = createInstagramFeedService({
    username: "configured",
    inlineImages: false,
    loadPayload: async (username) => { requested.push(username); return PAYLOAD; }
  });
  const handler = createInstagramHandler(service);
  const res = createResponse();

  await handler({ query: { username: "someone_else", limit: "2" } }, res);

  assert.deepEqual(requested, ["configured"]);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.posts.length, 2);
  assert.equal(res.body.profile.username, "configured");
});

test("handler returns a generic error without leaking internal details", async () => {
  const logged = [];
  const service = createInstagramFeedService({
    username: "configured",
    inlineImages: false,
    loadPayload: async () => {
      throw new Error("Command failed: /opt/instagram-venv/bin/python scripts/instagram-fetch.py\nTraceback ...");
    }
  });
  const handler = createInstagramHandler(service, { onError: (error) => logged.push(error.message) });
  const res = createResponse();

  await handler({ query: {} }, res);

  assert.equal(res.statusCode, 502);
  assert.equal(res.body.error, INSTAGRAM_PUBLIC_ERROR);
  assert.doesNotMatch(JSON.stringify(res.body), /Traceback|python|instagram-fetch/i);
  assert.equal(res.headers["Cache-Control"], "no-store");
  assert.equal(logged.length, 1);
});

test("username resolution prefers env, then local config, then default config", () => {
  assert.equal(resolveInstagramUsername({ env: { INSTAGRAM_USERNAME: "@from_env" }, configs: [{ instagram: { username: "local" } }] }), "from_env");
  assert.equal(resolveInstagramUsername({ env: {}, configs: [{ instagram: { username: "local" } }, { instagram: { username: "default" } }] }), "local");
  assert.equal(resolveInstagramUsername({ env: {}, configs: [{}, { instagram: { username: "default" } }] }), "default");
  assert.equal(resolveInstagramUsername({ env: { INSTAGRAM_USERNAME: "bad name!" }, configs: [] }), "example");
  assert.equal(resolveInstagramUsername({ env: { INSTAGRAM_USERNAME: "bad name!" }, configs: [{ instagram: { username: "local" } }] }), "local");
});
