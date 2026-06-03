import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeInstagramFeed } from "../../server/api/instagram.js";

test("instagram parser returns the latest 4 normalized posts", async () => {
  const payload = JSON.parse(await readFile(new URL("../fixtures/instagram-profile.json", import.meta.url), "utf8"));
  const feed = normalizeInstagramFeed(payload, "example", 4);

  assert.equal(feed.source, "instagram-public-profile");
  assert.equal(feed.profile.username, "example");
  assert.equal(feed.posts.length, 4);
  assert.equal(feed.posts[0].title, "PROGRAMM MAI 2026");
  assert.equal(feed.posts[0].permalink, "https://www.instagram.com/p/AAA111/");
  assert.equal(feed.posts[0].media_url, "https://example.test/one.jpg");
  assert.ok(feed.posts.every((post) => post.title && post.caption && post.permalink && post.media_url));
});
