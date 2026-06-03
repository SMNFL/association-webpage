import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  archiveEvent,
  deleteEvent,
  generateEventPageHtml,
  normalizeEvent,
  readEvents,
  safeJoin,
  saveEvents,
  slugify,
  uniqueEventSlug
} from "../../server/editor/content-store.js";

test("slug generation is stable and unique", () => {
  assert.equal(slugify("Wein & Musik 2024!"), "wein-und-musik-2024");
  assert.equal(uniqueEventSlug([{ id: "wein-und-musik-2024" }], "Wein & Musik 2024"), "wein-und-musik-2024-2");
});

test("safeJoin rejects paths outside the project root", () => {
  const root = path.join(os.tmpdir(), "sukura-root");
  assert.throws(() => safeJoin(root, "../outside.json"), /outside/);
});

test("archiveEvent removes ticket functionality and keeps gallery info", () => {
  const archived = archiveEvent({
    id: "test-event",
    title: "Test Event",
    ticketUrl: "https://tickets.example",
    ticketLink: "https://tickets.example/link",
    ticketEmbed: "https://tickets.example/embed",
    ticketEmbedHeight: 680,
    gallery: ["assets/images/eventsArchive/test/display/001.jpg"],
    sections: [
      { heading: "Ticketshop", paragraphs: ["JavaScript ist in Ihrem Browser deaktiviert."] },
      { heading: "Danke", paragraphs: ["Danke an alle Beteiligten."] }
    ]
  });

  assert.equal(archived.status, "archive");
  assert.equal(archived.ticketUrl, "");
  assert.equal(archived.ticketLink, "");
  assert.equal(archived.ticketEmbed, "");
  assert.equal(archived.ticketEmbedHeight, "");
  assert.deepEqual(archived.gallery, ["assets/images/eventsArchive/test/display/001.jpg"]);
  assert.deepEqual(archived.sections, [{ heading: "Danke", paragraphs: ["Danke an alle Beteiligten."] }]);
});

test("normalizeEvent rejects invalid status with structured field errors", () => {
  assert.throws(
    () => normalizeEvent({ title: "Bad Status", status: "draft" }),
    (error) => {
      assert.equal(error.status, 400);
      assert.equal(error.errors.status, "Status must be upcoming or archive.");
      return true;
    }
  );
});

test("normalizeEvent rejects unsafe image paths", () => {
  assert.throws(
    () => normalizeEvent({ title: "Unsafe Image", image: "../secret.png" }),
    (error) => {
      assert.equal(error.status, 400);
      assert.equal(error.errors.image, "Image path must be a safe relative path.");
      return true;
    }
  );
});

test("new event slugs do not collide with existing event ids", () => {
  const event = normalizeEvent({ title: "Existing", id: "existing" }, [{ id: "existing" }], { existingId: "" });
  assert.equal(event.id, "existing-2");
});

test("normalizeEvent allows approved Challonge embeds and provides a default image", () => {
  const event = normalizeEvent({
    title: "Tournament",
    embeds: [{ provider: "challonge", src: "https://challonge.com/de/tournament/module" }]
  });
  assert.equal(event.image, "assets/icons/site-placeholder.svg");
  assert.equal(event.embeds[0].src, "https://challonge.com/de/tournament/module");
});

test("normalizeEvent accepts approved ticket embeds and rejects unapproved iframe hosts", () => {
  const ticketEmbed = "https://tickets.clevertix.de/fourteen/w/example/?iframe=1";
  assert.equal(normalizeEvent({ title: "Ticket Shop", ticketEmbed }).ticketEmbed, ticketEmbed);
  assert.equal(normalizeEvent({ title: "Sized Ticket Shop", ticketEmbed, ticketEmbedHeight: 680 }).ticketEmbedHeight, 680);

  assert.throws(
    () => normalizeEvent({ title: "Unsafe Ticket Shop", ticketEmbed: "https://attacker.example/embed" }),
    (error) => {
      assert.equal(error.status, 400);
      assert.equal(error.errors.ticketEmbed, "Ticket embed URL must use an approved HTTPS provider.");
      return true;
    }
  );
});

test("normalizeEvent rejects invalid ticket embed heights with structured field errors", () => {
  for (const ticketEmbedHeight of [239, 1201, 640.5, "invalid"]) {
    assert.throws(
      () => normalizeEvent({ title: "Invalid Ticket Height", ticketEmbedHeight }),
      (error) => {
        assert.equal(error.status, 400);
        assert.equal(error.errors.ticketEmbedHeight, "Ticket embed height must be a whole number between 240 and 1200.");
        return true;
      }
    );
  }
});

test("event generation writes local JSON and wrapper page", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sukura-editor-"));
  await mkdir(path.join(root, "public", "data"), { recursive: true });
  await mkdir(path.join(root, "public", "pages", "events"), { recursive: true });

  const event = normalizeEvent({
    title: "Editor Test Night",
    date: "2026-09-19",
    description: ["Live test"],
    image: "assets/images/sukura-logo.png",
    ticketUrl: "https://tickets.example",
    gallery: ["assets/images/eventsArchive/editor-test-night/display/001.jpg"]
  });

  await saveEvents(root, [event]);

  const json = JSON.parse(await readFile(path.join(root, "public", "data", "events.content.json"), "utf8"));
  const page = await readFile(path.join(root, "public", "pages", "events", "editor-test-night.html"), "utf8");

  assert.equal(json[0].id, "editor-test-night");
  assert.match(page, /data-event="editor-test-night"/);
});

test("readEvents falls back to committed defaults until a local override exists", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sukura-editor-defaults-"));
  await mkdir(path.join(root, "public", "data"), { recursive: true });
  await writeFile(path.join(root, "public", "data", "events.default.json"), JSON.stringify([{ title: "Default Event" }]));

  assert.deepEqual(await readEvents(root), [{ title: "Default Event" }]);

  await writeFile(path.join(root, "public", "data", "events.content.json"), JSON.stringify([{ title: "Local Event" }]));
  assert.deepEqual(await readEvents(root), [{ title: "Local Event" }]);
});

test("deleteEvent removes generated content but preserves uploaded media and other event pages", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sukura-editor-delete-"));
  await mkdir(path.join(root, "public", "data"), { recursive: true });
  await mkdir(path.join(root, "public", "pages", "events"), { recursive: true });
  await mkdir(path.join(root, "public", "assets", "images", "events"), { recursive: true });
  await writeFile(path.join(root, "public", "assets", "images", "events", "delete-me.jpg"), "fixture");

  const deleted = normalizeEvent({
    title: "Delete Me",
    image: "assets/images/events/delete-me.jpg"
  });
  const kept = normalizeEvent({
    title: "Keep Me",
    image: "assets/icons/site-placeholder.svg"
  });
  await saveEvents(root, [deleted, kept]);

  const result = await deleteEvent(root, [deleted, kept], "delete-me");
  const json = JSON.parse(await readFile(path.join(root, "public", "data", "events.content.json"), "utf8"));

  assert.deepEqual(result.events.map((event) => event.id), ["keep-me"]);
  assert.deepEqual(json.map((event) => event.id), ["keep-me"]);
  await assert.rejects(readFile(path.join(root, "public", "pages", "events", "delete-me.html"), "utf8"), { code: "ENOENT" });
  assert.match(await readFile(path.join(root, "public", "pages", "events", "keep-me.html"), "utf8"), /data-event="keep-me"/);
  assert.equal(await readFile(path.join(root, "public", "assets", "images", "events", "delete-me.jpg"), "utf8"), "fixture");
});

test("generated event page html references the event id", () => {
  const html = generateEventPageHtml({ id: "sample-event", title: "Sample Event" });
  assert.match(html, /data-event="sample-event"/);
  assert.match(html, /href="\.\.\/\.\.\/index\.html#events"/);
});

test("generated archive event page links back to the archive section", () => {
  const html = generateEventPageHtml({ id: "archived-event", title: "Archived Event", status: "archive" });
  assert.match(html, /href="\.\.\/\.\.\/index\.html#archive"/);
});
