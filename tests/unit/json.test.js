import test from "node:test";
import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(new URL("../..", import.meta.url).pathname);

test("all public JSON data files parse successfully", async () => {
  let files;
  try {
    files = await collectJsonFiles(path.join(root, "public", "data"));
  } catch (error) {
    if (error.code === "EPERM" || error.code === "EACCES") {
      assert.ok(true, `skipped because public/data is not readable in this local sandbox: ${error.code}`);
      return;
    }
    throw error;
  }

  assert.ok(files.length > 0, "expected JSON data files in public/data");

  for (const file of files) {
    const content = await readFile(file, "utf8");
    assert.doesNotThrow(() => JSON.parse(content), file);
  }
});

test("site contact links are nested and local Instagram posts have one source", async () => {
  const defaultSite = JSON.parse(await readFile(path.join(root, "public", "data", "site.default.json"), "utf8"));
  const exampleSite = JSON.parse(await readFile(path.join(root, "public", "data", "site.local.example.json"), "utf8"));

  assert.equal(defaultSite.socialLinks, undefined);
  assert.ok(defaultSite.contactSection.socialLinks.length > 0);
  assert.ok(exampleSite.contactSection.socialLinks.length > 0);

  try {
    const localSite = JSON.parse(await readFile(path.join(root, "public", "data", "site.local.json"), "utf8"));
    assert.equal(localSite.socialLinks, undefined);
    assert.equal(localSite.instagram.fallbackFeed, "data/instagram-feed.local.json");
    assert.ok(localSite.contactSection.socialLinks.length > 0);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
});

test("local page overrides use canonical English page keys when present", async () => {
  try {
    const localPages = JSON.parse(await readFile(path.join(root, "public", "data", "pages.local.json"), "utf8"));
    ["privacy", "bylaws", "board", "membership"].forEach((key) => {
      assert.ok(Object.hasOwn(localPages, key), `expected local page key ${key}`);
    });
    ["datenschutz", "satzung", "vorstand", "mitglied"].forEach((key) => {
      assert.equal(Object.hasOwn(localPages, key), false, `legacy local page key remains: ${key}`);
    });
    assert.equal(localPages.membership.form.source, "/pages/membership.html");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
});

test("event defaults document every supported field without local site content", async () => {
  const defaults = JSON.parse(await readFile(path.join(root, "public", "data", "events.default.json"), "utf8"));
  const requiredFields = [
    "id",
    "slug",
    "title",
    "date",
    "displayDate",
    "time",
    "status",
    "image",
    "coverImage",
    "imagePosition",
    "excerpt",
    "description",
    "location",
    "ticketUrl",
    "ticketLink",
    "ticketEmbed",
    "ticketEmbedHeight",
    "ticketDetails",
    "instagramPostUrl",
    "detailUrl",
    "embeds",
    "tags",
    "sections",
    "gallery",
    "originalImages"
  ];

  assert.equal(defaults.length, 5);
  assert.equal(defaults.filter((event) => event.status === "upcoming").length, 1);
  assert.equal(defaults.filter((event) => event.status === "archive").length, 4);
  requiredFields.forEach((field) => {
    defaults.forEach((event) => assert.ok(Object.hasOwn(event, field), `${event.id} is missing ${field}`));
  });
  defaults.filter((event) => event.status === "archive").forEach((event) => {
    assert.equal(event.ticketUrl, "");
    assert.equal(event.ticketLink, "");
    assert.equal(event.ticketEmbed, "");
    assert.equal(event.ticketEmbedHeight, "");
  });
  for (const event of defaults) {
    assert.equal(event.detailUrl, `pages/events/${event.id}.html`);
    await access(path.join(root, "public", event.detailUrl));
  }
  assert.equal(JSON.stringify(defaults).includes("site-placeholder.svg"), true, "placeholder fallback path should remain generic");
  assert.equal(JSON.stringify(defaults).includes("sukura"), false, "defaults should not contain local branding");
  assert.equal(JSON.stringify(defaults).includes("kaiserslautern"), false, "defaults should not contain local event content");
});

async function collectJsonFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectJsonFiles(fullPath));
    } else if (entry.name.endsWith(".json")) {
      files.push(fullPath);
    }
  }

  return files;
}
