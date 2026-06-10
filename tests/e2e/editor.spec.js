import { expect, test } from "@playwright/test";
import express from "express";
import { cp, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createEditorRouter } from "../../server/editor/router.js";
import { saveEvents } from "../../server/editor/content-store.js";
import { hashPassword } from "../../server/security/editor-auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

test("editor creates an event, archives it, and public page keeps gallery without tickets", async ({ page }) => {
  const root = await createFixtureRoot();
  const server = await startFixtureServer(root);

  try {
    const base = `http://127.0.0.1:${server.port}`;
    page.on("dialog", (dialog) => dialog.accept(dialog.type() === "prompt" ? "Fixture gallery image" : undefined));

    await page.goto(`${base}/editor`);
    await expect(page).toHaveURL(`${base}/editor/login`);
    await page.locator('[name="password"]').fill("wrong-password");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.locator("[data-login-error]")).toContainText("Invalid administrator credentials");
    await page.locator('[name="password"]').fill("editor-test-password");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(`${base}/editor/`);
    await expect(page.locator("[data-field-list] .field-item").filter({ hasText: "Events" })).toContainText("Href: #events");

    await page.locator('[data-section="settings"]').click();
    await expect(page.locator("[data-settings-editor]")).toBeVisible();
    const settingsLayout = await page.locator("[data-settings-editor]").evaluate((form) => ({
      clientWidth: form.clientWidth,
      scrollWidth: form.scrollWidth,
      overflowX: getComputedStyle(form).overflowX,
      overflowY: getComputedStyle(form).overflowY
    }));
    expect(settingsLayout.scrollWidth).toBeLessThanOrEqual(settingsLayout.clientWidth);
    expect(settingsLayout.overflowX).toBe("hidden");
    expect(settingsLayout.overflowY).toBe("auto");
    await page.locator('[data-settings-editor] [name="density"]').selectOption("spacious");
    await expect(page.locator("[data-save-state]")).toContainText("Unsaved settings");
    await expect(page.locator("[data-preview]").contentFrame().locator("html")).toHaveAttribute("data-density", "spacious");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.locator("[data-save-state]")).toContainText("Settings saved");
    await page.locator('[data-settings-editor] [name="density"]').selectOption("compact");
    await expect(page.locator("[data-preview]").contentFrame().locator("html")).toHaveAttribute("data-density", "compact");
    await page.getByRole("button", { name: "Discard changes" }).click();
    await expect(page.locator("[data-preview]").contentFrame().locator("html")).toHaveAttribute("data-density", "spacious");

    await page.locator('[data-section="pages"]').click();
    await page.locator("[data-page-filter]").selectOption("page:legalNotice");
    await expect(page.locator("[data-preview-target]")).toHaveValue("/pages/legal-notice.html");
    await expect(page.locator("[data-field-list]")).toContainText("Legal Notice");
    await expect(page.locator("[data-page-sections]")).toContainText("SUKURA e.V.");

    await page.locator('[data-section="media"]').click();
    await expect(page.locator("[data-media-folder-filter]")).toContainText("Homepage gallery");
    await page.locator("[data-media-folder-filter]").selectOption("gallery");
    await expect(page.locator(".media-group:not([hidden])")).toHaveCount(1);
    await page.locator("[data-media-folder-filter]").selectOption("all");
    await expect(page.locator("[data-media-event-filter]")).toBeVisible();
    const galleryMedia = page.locator("[data-media-path]").filter({ hasText: "assets/images/gallery/fixture-gallery.jpg" });
    await galleryMedia.getByRole("button", { name: "Add to main gallery" }).click();
    await expect(page.locator("[data-save-state]")).toContainText("Added to main gallery");
    await expect(galleryMedia.getByRole("button", { name: "Remove from main gallery" })).toBeEnabled();
    await galleryMedia.getByRole("button", { name: "Remove from main gallery" }).click();
    await expect(page.locator("[data-save-state]")).toContainText("Removed from main gallery");
    await expect(page.locator("[data-media-path]").filter({ hasText: "assets/images/gallery/fixture-gallery.jpg" })).toBeVisible();

    await page.locator('[data-section="pages"]').click();
    await page.locator("[data-page-filter]").selectOption("culture:layout-test");
    await page.locator('[data-section="media"]').click();
    await page.locator('[data-media-upload] [name="kind"]').selectOption("culture");
    await page.locator('[data-media-upload] [name="file"]').setInputFiles({
      name: "Lead Portrait.png",
      mimeType: "image/png",
      buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lw9q6wAAAABJRU5ErkJggg==", "base64")
    });
    await page.getByRole("button", { name: "Upload image" }).click();
    await expect(page.locator("[data-save-state]")).toContainText("assets/images/culture/layout-test/lead-portrait.png");
    await expect(page.locator("[data-media-folder-filter]")).toContainText("Culture: Layout Test");
    await page.locator("[data-media-folder-filter]").selectOption("culture-layout-test");
    await expect(page.locator("[data-media-path]").filter({ hasText: "assets/images/culture/layout-test/lead-portrait.png" })).toBeVisible();

    const cultureSaveStatus = await page.evaluate(async () => {
      const session = await fetch("/api/editor/auth/session").then((response) => response.json());
      const response = await fetch("/api/editor/content/culture", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": session.csrfToken
        },
        body: JSON.stringify({
          content: {
            backLabel: "Back",
            themes: [
              {
                id: "layout-test",
                title: "Layout Test",
                description: "Culture fixture",
                leadsTitle: "Ressortleitung",
                leads: [
                  {
                    name: "Fixture Lead",
                    role: "Lead",
                    image: "assets/images/culture/layout-test/lead-portrait.png",
                    imageAlt: "Fixture lead portrait",
                    paragraphs: ["Local culture image fixture."]
                  }
                ],
                artistsTitle: "Artists",
                artists: []
              }
            ]
          }
        })
      });
      return response.status;
    });
    expect(cultureSaveStatus).toBe(200);

    await page.goto(`${base}/pages/culture-detail.html?id=layout-test`);
    await expect(page.getByRole("heading", { name: "Layout Test" })).toBeVisible();
    await expect(page.locator("[data-theme-leads] .artist-card__image")).toHaveAttribute("src", "../assets/images/culture/layout-test/lead-portrait.png");
    await page.goto(`${base}/editor/`);

    await page.locator('[data-section="events"]').click();
    await page.getByRole("button", { name: "New event" }).click();
    const eventLayout = await page.locator("[data-event-editor]").evaluate((form) => ({
      clientWidth: form.clientWidth,
      scrollWidth: form.scrollWidth,
      overflowX: getComputedStyle(form).overflowX,
      overflowY: getComputedStyle(form).overflowY
    }));
    expect(eventLayout.scrollWidth).toBeLessThanOrEqual(eventLayout.clientWidth);
    expect(eventLayout.overflowX).toBe("hidden");
    expect(eventLayout.overflowY).toBe("auto");

    await page.locator('[name="title"]').fill("Editor Test Night");
    await page.locator('[data-event-editor] [name="date"]').fill("2026-09-19");
    await page.locator('[name="displayDate"]').fill("19. September 2026");
    await page.locator('[name="location"]').fill("SUKURA99");
    await page.locator('[name="excerpt"]').fill("A test event created by the editor.");
    await page.locator('[name="description"]').fill("A test event created by the editor.\nSecond paragraph.");
    await page.locator('[name="image"]').fill("assets/images/sukura-logo.png");
    await page.locator('[name="ticketUrl"]').fill("https://tickets.example/editor-test-night");
    await page.locator('[name="ticketEmbed"]').fill("https://tickets.clevertix.de/fourteen/w/example/?iframe=1");
    await page.locator('[name="ticketEmbedHeight"]').fill("640");
    await page.locator('[name="gallery"]').fill("assets/images/eventsArchive/2026-09-19-editor-test-night/display/001.jpg");
    await page.getByRole("button", { name: "Save event" }).click();
    await expect(page.locator("[data-save-state]")).toContainText("Event saved");
    await expect(page.locator("[data-preview-target]")).toContainText("Active: Editor Test Night");

    await page.goto(`${base}/pages/events/editor-test-night.html`);
    await expect(page.locator(".event-ticket iframe")).toHaveAttribute("src", "https://tickets.clevertix.de/fourteen/w/example/?iframe=1");
    await expect(page.locator(".event-ticket iframe")).toHaveCSS("height", "640px");
    await expect(page.getByRole("link", { name: "Open tickets" })).toHaveAttribute("href", "https://tickets.example/editor-test-night");
    await expect(page.locator('link[data-pretix-widget-css], script[data-pretix-widget-js], pretix-widget')).toHaveCount(0);
    await expect(page.locator(".detail-back")).toHaveAttribute("href", "../../index.html#events");
    await page.goto(`${base}/editor/`);
    await page.locator('[data-section="events"]').click();

    await page.getByRole("button", { name: "New event" }).click();
    await page.locator('[name="title"]').fill("Accidental Event");
    await page.getByRole("button", { name: "Save event" }).click();
    await expect(page.locator("[data-save-state]")).toContainText("Event saved");
    await page.getByRole("button", { name: "Delete event" }).click();
    await expect(page.locator("[data-save-state]")).toContainText("Event deleted");
    await expect(page.locator("[data-event-list]")).not.toContainText("Accidental Event");

    await page.locator('[data-section="media"]').click();
    await page.locator("[data-media-event-filter]").selectOption("editor-test-night");
    const eventGalleryMedia = page.locator("[data-media-path]").filter({ hasText: "assets/images/gallery/fixture-gallery.jpg" });
    await eventGalleryMedia.getByRole("button", { name: "Add to event gallery" }).click();
    await expect(page.locator("[data-save-state]")).toContainText("Added to event gallery");
    await expect(eventGalleryMedia.getByRole("button", { name: "Remove from event gallery" })).toBeEnabled();
    await eventGalleryMedia.getByRole("button", { name: "Remove from event gallery" }).click();
    await expect(page.locator("[data-save-state]")).toContainText("Removed from event gallery");

    await page.locator('[data-section="events"]').click();
    await page.getByRole("button", { name: "Archive event" }).click();
    await expect(page.locator("[data-save-state]")).toContainText("Event archived");
    await expect(page.getByRole("button", { name: "Delete event" })).toBeVisible();

    const csrfStatus = await page.evaluate(async () => (
      fetch("/api/editor/events/editor-test-night/archive", { method: "POST" }).then((response) => response.status)
    ));
    expect(csrfStatus).toBe(403);

    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(`${base}/editor/login`);

    await page.goto(`${base}/pages/events/editor-test-night.html`);
    await expect(page.getByRole("heading", { name: "Editor Test Night" })).toBeVisible();
    await expect(page.locator("#event-ticket-title")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Event images" })).toBeVisible();
    await expect(page.locator(".detail-back")).toHaveAttribute("href", "../../index.html#archive");
  } finally {
    await server.close();
  }
});

async function createFixtureRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), "sukura-editor-e2e-"));
  await mkdir(path.join(root, "public", "data"), { recursive: true });
  await mkdir(path.join(root, "public", "js"), { recursive: true });
  await mkdir(path.join(root, "public", "styles"), { recursive: true });
  await mkdir(path.join(root, "public", "pages", "events"), { recursive: true });
  await mkdir(path.join(root, "public", "assets", "images"), { recursive: true });
  await mkdir(path.join(root, "public", "assets", "images", "gallery"), { recursive: true });

  await cp(path.join(repoRoot, "public", "js", "event-detail.js"), path.join(root, "public", "js", "event-detail.js"));
  await cp(path.join(repoRoot, "public", "js", "culture-detail.js"), path.join(root, "public", "js", "culture-detail.js"));
  await cp(path.join(repoRoot, "public", "js", "event-model.js"), path.join(root, "public", "js", "event-model.js"));
  await cp(path.join(repoRoot, "public", "js", "data.js"), path.join(root, "public", "js", "data.js"));
  await cp(path.join(repoRoot, "public", "js", "security.js"), path.join(root, "public", "js", "security.js"));
  await cp(path.join(repoRoot, "public", "js", "theme.js"), path.join(root, "public", "js", "theme.js"));
  await cp(path.join(repoRoot, "public", "js", "animations.js"), path.join(root, "public", "js", "animations.js"));
  await cp(path.join(repoRoot, "public", "styles", "main.css"), path.join(root, "public", "styles", "main.css"));
  await cp(path.join(repoRoot, "public", "pages", "culture-detail.html"), path.join(root, "public", "pages", "culture-detail.html"));
  await writeFile(path.join(root, "public", "index.html"), '<!doctype html><html><head><meta name="theme-color" content="#060811"></head><body><main>Fixture</main><script type="module">import { applyTheme } from "./js/theme.js"; applyTheme({});</script></body></html>');
  await writeFile(path.join(root, "public", "assets", "images", "sukura-logo.png"), "");
  await writeFile(path.join(root, "public", "assets", "images", "gallery", "fixture-gallery.jpg"), "");

  const site = {
    name: "SUKURA e.V.",
    description: "Fixture",
    eventsSection: {
      labels: {
        tickets: "Tickets",
        ticketTitle: "Ticket shop",
        openTickets: "Open tickets",
        viewTickets: "View tickets",
        eventSectionHeading: "Event",
        galleryLabel: "Gallery",
        galleryTitle: "Event images",
        galleryDescription: "{count} locally stored archive images.",
        backEvents: "Back to events",
        backArchive: "Back to archive"
      }
    }
  };
  await writeFile(path.join(root, "public", "data", "site.default.json"), JSON.stringify(site, null, 2));
  await writeFile(path.join(root, "public", "data", "events.default.json"), "[]\n");
  await writeFile(path.join(root, "public", "data", "culture.default.json"), JSON.stringify({ backLabel: "Back", themes: [] }, null, 2));
  await writeFile(path.join(root, "public", "data", "site.local.json"), JSON.stringify({
    nav: [{ label: "Events", href: "#events" }],
    images: { gallery: [] }
  }));
  await writeFile(path.join(root, "public", "data", "pages.local.json"), JSON.stringify({
    legalNotice: {
      title: "Legal Notice",
      sections: [{ id: "contact", heading: "SUKURA e.V.", paragraphs: ["Fixture address"] }]
    }
  }));
  await writeFile(path.join(root, "public", "data", "culture.local.json"), JSON.stringify({
    backLabel: "Back",
    themes: [
      {
        id: "layout-test",
        title: "Layout Test",
        description: "Culture fixture",
        leadsTitle: "Ressortleitung",
        leads: [],
        artistsTitle: "Artists",
        artists: []
      }
    ]
  }, null, 2));
  await saveEvents(root, []);
  return root;
}

async function startFixtureServer(root) {
  const app = express();
  app.use(express.json({ limit: "24mb" }));
  app.use(createEditorRouter(root, {
    passwordHash: hashPassword("editor-test-password"),
    sessionSecret: "e2e-session-secret"
  }));
  app.use(express.static(path.join(root, "public"), { extensions: ["html"] }));

  return new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => {
      resolve({
        port: listener.address().port,
        close: () => new Promise((done) => listener.close(done))
      });
    });
  });
}
