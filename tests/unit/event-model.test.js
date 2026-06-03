import test from "node:test";
import assert from "node:assert/strict";
import {
  eventExcerpt,
  eventUrl,
  hasTickets,
  isArchive,
  normalizeGallery,
  splitEventsForDisplay,
  ticketEmbedHeight
} from "../../public/js/event-model.js";

test("event helpers separate active and archived ticket behavior", () => {
  const active = { id: "active", status: "upcoming", ticketUrl: "https://tickets.example" };
  const archive = { id: "archive", status: "archive", ticketUrl: "https://tickets.example" };

  assert.equal(isArchive(archive), true);
  assert.equal(hasTickets(active), true);
  assert.equal(hasTickets(archive), false);
});

test("ticket embed height uses a compact bounded fallback", () => {
  assert.equal(ticketEmbedHeight({}), 316);
  assert.equal(ticketEmbedHeight({ ticketEmbedHeight: 640 }), 640);
  assert.equal(ticketEmbedHeight({ ticketEmbedHeight: 239 }), 316);
  assert.equal(ticketEmbedHeight({ ticketEmbedHeight: 1201 }), 316);
  assert.equal(ticketEmbedHeight({ ticketEmbedHeight: 640.5 }), 316);
  assert.equal(ticketEmbedHeight({ ticketEmbedHeight: "invalid" }), 316);
});

test("event helpers normalize URLs, excerpts and galleries", () => {
  const event = {
    id: "sample",
    title: "Sample",
    description: ["First paragraph"],
    gallery: ["assets/images/events/sample.jpg"]
  };

  assert.equal(eventUrl(event), "pages/events/sample.html");
  assert.equal(eventExcerpt(event), "First paragraph");
  assert.deepEqual(normalizeGallery(event), [
    { src: "assets/images/events/sample.jpg", alt: "Sample Bild 1" }
  ]);
});

test("event helpers split display events by active and archive state", () => {
  const split = splitEventsForDisplay([
    { id: "past", status: "archive", date: "2024-01-01" },
    { id: "future", status: "upcoming", date: "2026-09-19" }
  ]);

  assert.deepEqual(split.upcoming.map((event) => event.id), ["future"]);
  assert.deepEqual(split.archive.map((event) => event.id), ["past"]);
});
