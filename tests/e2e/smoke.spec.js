import { expect, test } from "@playwright/test";

function cultureLayoutFixture({ leads = [], artists = [] } = {}) {
  return {
    backLabel: "Back",
    themes: [
      {
        id: "layout-test",
        title: "Layout Test",
        description: "Culture layout fixture.",
        leadsTitle: "Program leads",
        leads,
        artistsTitle: "Artists",
        artists
      }
    ]
  };
}

async function routeCultureLayoutFixture(page, fixture) {
  await page.route("**/data/culture.local.json", (route) => route.fulfill({ json: fixture }));
}

test("homepage loads and renders Instagram previews", async ({ page }) => {
  const consoleErrors = [];
  const instagramApiRequests = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("status of 404")) consoleErrors.push(message.text());
  });
  page.on("request", (request) => {
    if (/\/(?:api|\.netlify\/functions)\/instagram-feed/.test(request.url())) {
      instagramApiRequests.push(request.url());
    }
  });

  await page.goto("/index.html#instagram");
  await expect(page.locator(".instagram-preview-card")).toHaveCount(4);
  await expect(page.locator("[data-instagram-username]")).toHaveText("@example");
  await expect(page.locator("[data-instagram-source]")).toHaveText("12 posts");
  await expect(page.locator(".contact-card__email")).toHaveAttribute("href", "mailto:hello@example.org");
  await expect(page.locator(".contact-card__button")).toHaveAttribute("href", "pages/contact.html?back=contact");
  await expect(page.locator(".contact-card__links a")).toHaveText(["@example"]);
  expect(instagramApiRequests).toHaveLength(1);
  expect(instagramApiRequests[0]).toContain("/api/instagram-feed?username=example&limit=4");
  expect(consoleErrors).toEqual([]);
});

test("homepage uses the local Instagram JSON only when the live feed fails", async ({ page }) => {
  await page.route("**/*", (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/api/instagram-feed" || pathname === "/.netlify/functions/instagram-feed") return route.abort();
    if (pathname === "/data/instagram-feed.default.json") {
      return route.fulfill({
        json: {
          posts: [1, 2, 3, 4].map((index) => ({
            id: String(index),
            media_type: "IMAGE",
            media_url: "assets/icons/site-placeholder.svg",
            permalink: `https://www.instagram.com/p/EXAMPLE${index}/`,
            caption: `Fallback post ${index}`,
            title: `Fallback post ${index}`
          }))
        }
      });
    }
    return route.continue();
  });

  await page.goto("/index.html#instagram");
  await expect(page.locator(".instagram-preview-card")).toHaveCount(4);
  await expect(page.locator(".instagram-preview-card strong")).toHaveText([
    "Fallback post 1",
    "Fallback post 2",
    "Fallback post 3",
    "Fallback post 4"
  ]);
});

test("archive cards exist and link to local event pages", async ({ page }) => {
  await page.goto("/index.html#events");
  const cards = page.locator("[data-past-events] .event-card");
  await expect(cards.first()).toBeVisible();
  await expect(cards.first()).toHaveAttribute("href", /pages\/event\.html\?id=|pages\/events\//);
});

test("navigation collapses before links overlap and remains pinned", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/index.html#hero");
  const header = page.locator(".site-header");
  const toggle = page.locator("[data-menu-toggle]");
  const nav = page.locator("[data-nav]");
  const archiveLink = page.locator('.site-nav a[href="#archive"]');

  await expect(header).toHaveAttribute("data-collapsed", "false");
  await expect(toggle).toBeHidden();
  await expect(page.locator("#archive")).toHaveCount(1);
  expect(await page.evaluate(() => {
    const events = document.querySelector("#events");
    const archive = document.querySelector("#archive");
    const culture = document.querySelector("#culture");
    return events.parentElement === archive.parentElement
      && archive.parentElement === culture.parentElement
      && events.nextElementSibling === archive
      && archive.nextElementSibling === culture;
  })).toBe(true);

  await page.setViewportSize({ width: 480, height: 900 });
  await expect(header).toHaveAttribute("data-collapsed", "true");
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(nav).toHaveAttribute("data-open", "true");

  const dropdownPosition = await page.evaluate(() => {
    const headerRect = document.querySelector(".site-header").getBoundingClientRect();
    const navRect = document.querySelector(".site-nav").getBoundingClientRect();
    const signalRect = document.querySelector("[data-hero-signal]").getBoundingClientRect();
    return {
      headerBottom: headerRect.bottom,
      navTop: navRect.top,
      navBottom: navRect.bottom,
      signalTop: signalRect.top,
      menuHeight: Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--mobile-menu-height"))
    };
  });
  expect(dropdownPosition.navTop).toBeGreaterThanOrEqual(dropdownPosition.headerBottom);
  expect(dropdownPosition.menuHeight).toBeGreaterThan(0);
  expect(dropdownPosition.signalTop - dropdownPosition.navBottom).toBeGreaterThanOrEqual(16);

  await page.keyboard.press("Escape");
  await expect(nav).toHaveAttribute("data-open", "false");
  await toggle.click();
  await archiveLink.click();
  await expect(page).toHaveURL(/#archive$/);
  await expect(nav).toHaveAttribute("data-open", "false");

  await page.evaluate(() => window.scrollTo(0, 1200));
  const stickyLayout = await page.evaluate(() => {
    const headerRect = document.querySelector(".site-header").getBoundingClientRect();
    const headerBackdrop = getComputedStyle(document.querySelector(".site-header"), "::before");
    return {
      headerTop: headerRect.top,
      headerPosition: getComputedStyle(document.querySelector(".site-header")).position,
      headerBackdropWidth: Math.round(Number.parseFloat(headerBackdrop.width)),
      pageScrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth
    };
  });
  expect(Math.abs(stickyLayout.headerTop)).toBeLessThanOrEqual(1);
  expect(stickyLayout.headerPosition).toBe("fixed");
  expect(stickyLayout.headerBackdropWidth).toBe(stickyLayout.viewportWidth);
  expect(stickyLayout.pageScrollWidth).toBeLessThanOrEqual(stickyLayout.viewportWidth);

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(header).toHaveAttribute("data-collapsed", "false");
  await expect(toggle).toBeHidden();

  for (const [hash, label] of [["events", "Events"], ["archive", "Archive"], ["culture", "Culture"]]) {
    await page.goto(`/index.html#${hash}`);
    await expect(page.locator(`.site-nav a[href="#${hash}"]`)).toHaveAttribute("aria-current", "true");
    await expect(page.locator('.site-nav a[aria-current="true"]')).toHaveText(label);
  }

  await page.goto("/index.html#archive");
  const archiveMiddle = await page.evaluate(() => {
    const archive = document.querySelector("#archive");
    return archive.offsetTop + Math.round(archive.offsetHeight / 2);
  });
  await page.evaluate((scrollTop) => window.scrollTo(0, scrollTop), archiveMiddle);
  await expect(page.locator('.site-nav a[aria-current="true"]')).toHaveText("Archive");
});

test("event rendering falls back to generic defaults when local content is absent", async ({ page }) => {
  await page.route("**/data/events.content.json", (route) => route.fulfill({ status: 404, body: "" }));

  await page.goto("/index.html#events");
  await expect(page.getByRole("heading", { name: "Open Culture Night" })).toBeVisible();
  await expect(page.locator("[data-upcoming-events] .event-card")).toHaveCount(1);
  await expect(page.locator("[data-past-events] .event-card")).toHaveCount(4);

  await page.goto("/pages/event.html?id=archive-summer-sessions");
  await expect(page.getByRole("heading", { name: "Summer Sessions" })).toBeVisible();
  await expect(page.locator(".event-ticket")).toHaveCount(0);
  await expect(page.locator(".detail-back")).toHaveAttribute("href", "../index.html#archive");
});

test("event action label comes from default site JSON", async ({ page }) => {
  await page.route("**/data/events.content.json", (route) => route.fulfill({ status: 404, body: "" }));
  await page.route("**/data/site.local.json", (route) => route.fulfill({ status: 404, body: "" }));

  await page.goto("/index.html#events");
  await expect(page.locator("[data-upcoming-events] .event-card__actions .text-link").first()).toHaveText("Open event page");
});

test("event action label uses local site JSON override", async ({ page }) => {
  await page.route("**/data/events.content.json", (route) => route.fulfill({ status: 404, body: "" }));
  await page.route("**/data/site.local.json", (route) => route.fulfill({
    json: {
      eventsSection: {
        labels: {
          openEventPage: "Lokale Eventseite"
        }
      }
    }
  }));

  await page.goto("/index.html#events");
  await expect(page.locator("[data-upcoming-events] .event-card__actions .text-link").first()).toHaveText("Lokale Eventseite");
});

test("culture detail single leader card fills the available row", async ({ page }) => {
  await routeCultureLayoutFixture(page, cultureLayoutFixture({
    leads: [
      {
        name: "Single Lead",
        role: "Program lead",
        image: "assets/icons/site-placeholder.svg",
        imageAlt: "Placeholder lead portrait",
        paragraphs: ["Short leader profile.", "Additional context for the lead area."],
        links: [{ label: "Profile", url: "https://example.org/profile" }],
        embeds: [
          {
            provider: "youtube",
            title: "Lead video",
            src: "https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ"
          },
          {
            provider: "spotify",
            title: "Lead playlist",
            src: "https://open.spotify.com/embed/playlist/37i9dQZF1DX4dyzvuaRJ0n"
          }
        ]
      }
    ]
  }));

  await page.setViewportSize({ width: 1000, height: 800 });
  await page.goto("/pages/culture-detail.html?id=layout-test");
  await expect(page.locator("[data-theme-leads] .artist-card")).toHaveCount(1);
  await expect(page.locator("[data-theme-leads]")).toHaveAttribute("data-count", "1");
  await expect(page.locator("[data-theme-leads]")).toHaveAttribute("data-single", "true");

  const desktop = await page.evaluate(() => {
    const grid = document.querySelector("[data-theme-leads]");
    const card = grid.querySelector(".artist-card");
    const image = card.querySelector(".artist-card__image");
    const content = card.querySelector(".artist-card__content");
    const youtube = card.querySelector(".media-embed--youtube");
    const spotify = card.querySelector(".media-embed--spotify");
    const spotifyFrame = spotify.querySelector("iframe");
    const gridRect = grid.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const imageRect = image.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();
    const youtubeRect = youtube.getBoundingClientRect();
    const spotifyRect = spotify.getBoundingClientRect();
    const spotifyStyles = getComputedStyle(spotify);
    const spotifyFrameStyles = getComputedStyle(spotifyFrame);
    return {
      gridWidth: Math.round(gridRect.width),
      cardWidth: Math.round(cardRect.width),
      cardLeft: Math.round(cardRect.left),
      cardRight: Math.round(cardRect.right),
      imageRight: Math.round(imageRect.right),
      imageBottom: Math.round(imageRect.bottom),
      contentLeft: Math.round(contentRect.left),
      contentBottom: Math.round(contentRect.bottom),
      youtubeLeft: Math.round(youtubeRect.left),
      youtubeRight: Math.round(youtubeRect.right),
      youtubeTop: Math.round(youtubeRect.top),
      spotifyLeft: Math.round(spotifyRect.left),
      spotifyRight: Math.round(spotifyRect.right),
      spotifyTop: Math.round(spotifyRect.top),
      youtubeHeight: Math.round(youtubeRect.height),
      spotifyHeight: Math.round(spotifyRect.height),
      spotifyRadius: spotifyStyles.borderTopLeftRadius,
      spotifyFrameRadius: spotifyFrameStyles.borderTopLeftRadius
    };
  });
  expect(Math.abs(desktop.gridWidth - desktop.cardWidth)).toBeLessThanOrEqual(2);
  expect(desktop.contentLeft).toBeGreaterThanOrEqual(desktop.imageRight - 2);
  expect(desktop.youtubeLeft).toBeGreaterThanOrEqual(desktop.imageRight - 2);
  expect(desktop.youtubeTop).toBeGreaterThanOrEqual(desktop.contentBottom);
  expect(desktop.spotifyTop).toBeGreaterThanOrEqual(Math.max(desktop.imageBottom, desktop.youtubeTop + desktop.youtubeHeight));
  expect(desktop.spotifyLeft).toBeGreaterThan(desktop.cardLeft);
  expect(desktop.spotifyRight).toBeLessThan(desktop.cardRight);
  expect(desktop.spotifyHeight).toBeGreaterThanOrEqual(380);
  expect(desktop.youtubeHeight).toBeLessThan(desktop.spotifyHeight);
  expect(Number.parseFloat(desktop.spotifyRadius)).toBeGreaterThan(0);
  expect(Number.parseFloat(desktop.spotifyFrameRadius)).toBeGreaterThan(0);

  await page.setViewportSize({ width: 480, height: 800 });
  await page.waitForTimeout(100);
  const mobile = await page.evaluate(() => {
    const card = document.querySelector("[data-theme-leads] .artist-card");
    const image = card.querySelector(".artist-card__image");
    const content = card.querySelector(".artist-card__content");
    const copy = card.querySelector(".artist-card__copy");
    const media = card.querySelector(".artist-card__media");
    const embeds = Array.from(card.querySelectorAll(".media-embed"));
    const imageRect = image.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();
    const copyRect = copy.getBoundingClientRect();
    const mediaRect = media.getBoundingClientRect();
    const embedRects = embeds.map((embed) => embed.getBoundingClientRect());
    return {
      imageBottom: Math.round(imageRect.bottom),
      contentTop: Math.round(contentRect.top),
      copyLeft: Math.round(copyRect.left),
      mediaLeft: Math.round(mediaRect.left),
      copyBottom: Math.round(copyRect.bottom),
      mediaTop: Math.round(mediaRect.top),
      firstEmbedLeft: Math.round(embedRects[0].left),
      firstEmbedBottom: Math.round(embedRects[0].bottom),
      secondEmbedLeft: Math.round(embedRects[1].left),
      secondEmbedTop: Math.round(embedRects[1].top)
    };
  });
  expect(mobile.contentTop).toBeGreaterThanOrEqual(mobile.imageBottom);
  expect(Math.abs(mobile.copyLeft - mobile.mediaLeft)).toBeLessThanOrEqual(2);
  expect(mobile.mediaTop).toBeGreaterThanOrEqual(mobile.copyBottom);
  expect(Math.abs(mobile.firstEmbedLeft - mobile.secondEmbedLeft)).toBeLessThanOrEqual(2);
  expect(mobile.secondEmbedTop).toBeGreaterThanOrEqual(mobile.firstEmbedBottom);
});

test("culture detail multiple leader cards stay responsive", async ({ page }) => {
  await routeCultureLayoutFixture(page, cultureLayoutFixture({
    leads: [
      {
        name: "Lead One",
        role: "Program lead",
        paragraphs: ["First leader profile."]
      },
      {
        name: "Lead Two",
        role: "Program lead",
        paragraphs: ["Second leader profile."]
      }
    ]
  }));

  await page.setViewportSize({ width: 900, height: 800 });
  await page.goto("/pages/culture-detail.html?id=layout-test");
  await expect(page.locator("[data-theme-leads] .artist-card")).toHaveCount(2);
  await expect(page.locator("[data-theme-leads]")).toHaveAttribute("data-count", "2");
  await expect(page.locator("[data-theme-leads]")).not.toHaveAttribute("data-single", "true");

  const desktop = await page.evaluate(() => {
    const grid = document.querySelector("[data-theme-leads]");
    const gridRect = grid.getBoundingClientRect();
    const cards = Array.from(document.querySelectorAll("[data-theme-leads] .artist-card"));
    return cards.map((card) => {
      const rect = card.getBoundingClientRect();
      return {
        gridWidth: Math.round(gridRect.width),
        width: Math.round(rect.width),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        top: Math.round(rect.top)
      };
    });
  });
  expect(desktop[1].left).toBeGreaterThan(desktop[0].right);
  expect(Math.abs(desktop[0].top - desktop[1].top)).toBeLessThanOrEqual(2);
  expect(desktop[0].width).toBeLessThan(desktop[0].gridWidth * 0.75);

  await page.setViewportSize({ width: 480, height: 800 });
  await page.waitForTimeout(100);
  const mobile = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll("[data-theme-leads] .artist-card"));
    return cards.map((card) => {
      const rect = card.getBoundingClientRect();
      return {
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        left: Math.round(rect.left)
      };
    });
  });
  expect(Math.abs(mobile[0].left - mobile[1].left)).toBeLessThanOrEqual(2);
  expect(mobile[1].top).toBeGreaterThanOrEqual(mobile[0].bottom);
});

test("culture detail artist cards use shortest-column masonry with mobile fallback", async ({ page }) => {
  await routeCultureLayoutFixture(page, cultureLayoutFixture({
    artists: [
      {
        name: "Tall Artist",
        role: "Artist",
        paragraphs: [
          "Long profile text. ".repeat(120),
          "More long profile text. ".repeat(90)
        ]
      },
      {
        name: "Short Artist",
        role: "Artist",
        paragraphs: ["Short profile."]
      },
      {
        name: "Follower Artist",
        role: "Artist",
        paragraphs: ["This card should move below the shorter column."]
      }
    ]
  }));

  await page.setViewportSize({ width: 900, height: 900 });
  await page.goto("/pages/culture-detail.html?id=layout-test");
  await expect(page.locator("[data-masonry-grid]")).toHaveAttribute("data-masonry-ready", "true");
  await expect(page.locator("[data-theme-artists] .artist-card")).toHaveCount(3);

  const desktop = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll("[data-theme-artists] .artist-card"));
    return cards.map((card) => {
      const rect = card.getBoundingClientRect();
      return {
        position: getComputedStyle(card).position,
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom)
      };
    });
  });
  expect(desktop[0].position).toBe("absolute");
  expect(Math.abs(desktop[0].top - desktop[1].top)).toBeLessThanOrEqual(2);
  expect(Math.abs(desktop[2].left - desktop[1].left)).toBeLessThanOrEqual(2);
  expect(desktop[2].top).toBeGreaterThanOrEqual(desktop[1].bottom);
  expect(desktop[2].top).toBeLessThan(desktop[0].bottom);

  await page.setViewportSize({ width: 480, height: 900 });
  await expect(page.locator("[data-masonry-grid]")).not.toHaveAttribute("data-masonry-ready", "true");
  const mobile = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll("[data-theme-artists] .artist-card"));
    return cards.map((card) => {
      const rect = card.getBoundingClientRect();
      return {
        position: getComputedStyle(card).position,
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom)
      };
    });
  });
  expect(mobile.every((card) => card.position !== "absolute")).toBe(true);
  expect(Math.abs(mobile[0].left - mobile[1].left)).toBeLessThanOrEqual(2);
  expect(Math.abs(mobile[1].left - mobile[2].left)).toBeLessThanOrEqual(2);
  expect(mobile[1].top).toBeGreaterThanOrEqual(mobile[0].bottom);
  expect(mobile[2].top).toBeGreaterThanOrEqual(mobile[1].bottom);
});

test("Bylaws table of contents stays visible while scrolling", async ({ page }) => {
  await page.route("**/data/pages.local.json", (route) => route.fulfill({
    json: {
      bylaws: {
        title: "Rules",
        layout: "document",
        showToc: true,
        tocTitle: "Contents",
        sections: Array.from({ length: 12 }, (_, index) => ({
          id: `section-${index + 1}`,
          heading: `Section ${index + 1}`,
          paragraphs: ["Long example text.".repeat(80)]
        }))
      }
    }
  }));

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/pages/bylaws.html");
  const toc = page.locator(".statute-toc");
  await expect(toc).toBeVisible();
  await expect(toc).toHaveAttribute("data-toc-pin", "before");
  const initialDesktop = await page.evaluate(() => {
    const tocRect = document.querySelector(".statute-toc").getBoundingClientRect();
    const heroRect = document.querySelector(".statute-hero").getBoundingClientRect();
    return {
      tocTop: Math.round(tocRect.top),
      heroBottom: Math.round(heroRect.bottom)
    };
  });
  expect(initialDesktop.tocTop).toBeGreaterThanOrEqual(initialDesktop.heroBottom);

  await page.evaluate(() => {
    window.scrollTo(0, Math.max(0, (document.documentElement.scrollHeight - window.innerHeight) / 2));
    window.dispatchEvent(new Event("scroll"));
  });
  await expect(toc).toBeVisible();
  await expect(toc).toHaveAttribute("data-toc-pin", "fixed");
  const fixedDesktop = await page.evaluate(() => {
    const tocRect = document.querySelector(".statute-toc").getBoundingClientRect();
    return {
      spaceAbove: Math.round(tocRect.top - 72),
      spaceBelow: Math.round(window.innerHeight - tocRect.bottom)
    };
  });
  expect(fixedDesktop.spaceAbove).toBeGreaterThanOrEqual(20);
  expect(Math.abs(fixedDesktop.spaceAbove - fixedDesktop.spaceBelow)).toBeLessThanOrEqual(48);

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const bottomDesktop = await page.evaluate(() => {
    const tocRect = document.querySelector(".statute-toc").getBoundingClientRect();
    const sections = document.querySelectorAll(".statute-section");
    const lastRect = sections[sections.length - 1].getBoundingClientRect();
    return {
      tocBottom: Math.round(tocRect.bottom),
      lastBottom: Math.round(lastRect.bottom)
    };
  });
  expect(bottomDesktop.tocBottom).toBeLessThanOrEqual(bottomDesktop.lastBottom + 4);

  await page.setViewportSize({ width: 480, height: 800 });
  await page.goto("/pages/bylaws.html");
  await expect(toc).toBeVisible();
  await expect(toc).toHaveAttribute("data-toc-pin", "before");
  const mobileToggle = page.locator("[data-toc-toggle]");
  await expect(mobileToggle).toBeVisible();
  await expect(mobileToggle).toHaveText("");
  await expect(mobileToggle).toHaveAttribute("aria-expanded", "false");
  const initialMobile = await page.evaluate(() => {
    const tocRect = document.querySelector(".statute-toc").getBoundingClientRect();
    const heroRect = document.querySelector(".statute-hero").getBoundingClientRect();
    return {
      tocTop: Math.round(tocRect.top),
      heroBottom: Math.round(heroRect.bottom)
    };
  });
  expect(initialMobile.tocTop).toBeGreaterThanOrEqual(initialMobile.heroBottom);

  await page.evaluate(() => window.scrollTo(0, 1600));
  await expect(toc).toBeVisible();
  await expect(toc).toHaveAttribute("data-toc-pin", "fixed");
  const fixedMobile = await toc.evaluate((node) => Math.round(node.getBoundingClientRect().top));
  expect(Math.abs(fixedMobile - 80)).toBeLessThanOrEqual(4);

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const bottomMobile = await page.evaluate(() => {
    const tocRect = document.querySelector(".statute-toc").getBoundingClientRect();
    const sections = document.querySelectorAll(".statute-section");
    const lastRect = sections[sections.length - 1].getBoundingClientRect();
    return {
      tocBottom: Math.round(tocRect.bottom),
      lastBottom: Math.round(lastRect.bottom)
    };
  });
  expect(bottomMobile.tocBottom).toBeLessThanOrEqual(bottomMobile.lastBottom + 4);
});

test("Crowdfunding table of contents uses the bounded pinned document layout", async ({ page }) => {
  await page.route("**/data/pages.local.json", (route) => route.fulfill({
    json: {
      crowdfunding: {
        title: "Crowdfunding",
        layout: "document",
        showToc: true,
        tocTitle: "Contents",
        sections: Array.from({ length: 10 }, (_, index) => ({
          id: `crowdfunding-section-${index + 1}`,
          heading: `Crowdfunding section ${index + 1}`,
          paragraphs: [
            index === 1
              ? "First line<br>Second line"
              : "Long crowdfunding example text.".repeat(80)
          ]
        }))
      }
    }
  }));

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/pages/crowdfunding.html");
  const toc = page.locator(".statute-toc");
  await expect(toc).toBeVisible();
  await expect(toc).toHaveAttribute("data-toc-pin", "before");
  const initialDesktop = await page.evaluate(() => {
    const tocRect = document.querySelector(".statute-toc").getBoundingClientRect();
    const heroRect = document.querySelector(".statute-hero").getBoundingClientRect();
    return {
      tocTop: Math.round(tocRect.top),
      heroBottom: Math.round(heroRect.bottom)
    };
  });
  expect(initialDesktop.tocTop).toBeGreaterThanOrEqual(initialDesktop.heroBottom);

  await page.evaluate(() => {
    window.scrollTo(0, Math.max(0, (document.documentElement.scrollHeight - window.innerHeight) / 2));
    window.dispatchEvent(new Event("scroll"));
  });
  await expect(toc).toHaveAttribute("data-toc-pin", "fixed");
  const fixedDesktop = await page.evaluate(() => {
    const tocRect = document.querySelector(".statute-toc").getBoundingClientRect();
    return {
      spaceAbove: Math.round(tocRect.top - 72),
      spaceBelow: Math.round(window.innerHeight - tocRect.bottom)
    };
  });
  expect(fixedDesktop.spaceAbove).toBeGreaterThanOrEqual(20);
  expect(Math.abs(fixedDesktop.spaceAbove - fixedDesktop.spaceBelow)).toBeLessThanOrEqual(48);
  const brRendering = await page.locator("#crowdfunding-section-2 p").evaluate((node) => ({
    html: node.innerHTML,
    brCount: node.querySelectorAll("br").length
  }));
  expect(brRendering.html).not.toContain("&lt;br&gt;");
  expect(brRendering.brCount).toBe(1);

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const bottomDesktop = await page.evaluate(() => {
    const tocRect = document.querySelector(".statute-toc").getBoundingClientRect();
    const sections = document.querySelectorAll(".statute-section");
    const lastRect = sections[sections.length - 1].getBoundingClientRect();
    return {
      tocBottom: Math.round(tocRect.bottom),
      lastBottom: Math.round(lastRect.bottom)
    };
  });
  expect(bottomDesktop.tocBottom).toBeLessThanOrEqual(bottomDesktop.lastBottom + 4);

  await page.setViewportSize({ width: 480, height: 800 });
  await page.goto("/pages/crowdfunding.html");
  await expect(toc).toBeVisible();
  await expect(toc).toHaveAttribute("data-toc-pin", "before");
  const mobileToggle = page.locator("[data-toc-toggle]");
  await expect(mobileToggle).toBeVisible();
  await expect(mobileToggle).toHaveText("");
  await expect(mobileToggle).toHaveAttribute("aria-expanded", "false");
  const initialMobile = await page.evaluate(() => {
    const tocRect = document.querySelector(".statute-toc").getBoundingClientRect();
    const heroRect = document.querySelector(".statute-hero").getBoundingClientRect();
    return {
      tocTop: Math.round(tocRect.top),
      heroBottom: Math.round(heroRect.bottom),
      listDisplay: getComputedStyle(document.querySelector("[data-page-toc-list]")).display
    };
  });
  expect(initialMobile.tocTop).toBeGreaterThanOrEqual(initialMobile.heroBottom);
  expect(initialMobile.listDisplay).toBe("none");

  await page.evaluate(() => {
    window.scrollTo(0, Math.max(0, (document.documentElement.scrollHeight - window.innerHeight) / 2));
    window.dispatchEvent(new Event("scroll"));
  });
  await expect(toc).toHaveAttribute("data-toc-pin", "fixed");
  const fixedMobile = await page.evaluate(() => {
    const tocRect = document.querySelector(".statute-toc").getBoundingClientRect();
    const documentMargin = parseFloat(getComputedStyle(document.querySelector(".statute-document")).marginTop);
    return {
      top: Math.round(tocRect.top),
      height: Math.round(tocRect.height),
      documentMargin
    };
  });
  expect(Math.abs(fixedMobile.top - 80)).toBeLessThanOrEqual(4);
  expect(fixedMobile.height).toBeLessThanOrEqual(58);
  expect(fixedMobile.documentMargin).toBeLessThanOrEqual(40);

  await mobileToggle.evaluate((node) => node.click());
  await expect(mobileToggle).toHaveAttribute("aria-expanded", "true");
  await page.waitForTimeout(100);
  const openMobile = await page.evaluate(() => {
    const tocRect = document.querySelector(".statute-toc").getBoundingClientRect();
    const listRect = document.querySelector("[data-page-toc-list]").getBoundingClientRect();
    return {
      pin: document.querySelector(".statute-toc").dataset.tocPin,
      scrollY: Math.round(window.scrollY),
      tocHeight: Math.round(tocRect.height),
      listHeight: Math.round(listRect.height),
      listBottom: Math.round(listRect.bottom),
      listDisplay: getComputedStyle(document.querySelector("[data-page-toc-list]")).display,
      listWidth: Math.round(listRect.width),
      viewportHeight: window.innerHeight
    };
  });
  expect(openMobile.listDisplay).toBe("grid");
  expect(openMobile.pin).toBe("fixed");
  expect(openMobile.tocHeight).toBeLessThanOrEqual(58);
  expect(openMobile.listHeight).toBeLessThanOrEqual(Math.round(openMobile.viewportHeight * 0.7) + 2);
  expect(openMobile.listBottom).toBeLessThanOrEqual(openMobile.viewportHeight - 8);
  expect(openMobile.listWidth).toBeLessThanOrEqual(320);

  await page.locator('[data-page-toc-list] a[href="#crowdfunding-section-1"]').click();
  await expect(mobileToggle).toHaveAttribute("aria-expanded", "false");
});

test("Document table of contents uses an icon-only mobile disclosure on every document page", async ({ page }) => {
  await page.route("**/data/pages.local.json", (route) => route.fulfill({
    json: {
      legalNotice: {
        title: "Legal notice",
        layout: "document",
        showToc: true,
        tocTitle: "Contents",
        sections: [
          { id: "legal-one", heading: "Legal one", paragraphs: ["Legal text."] },
          { id: "legal-two", heading: "Legal two", paragraphs: ["More legal text."] }
        ]
      },
      privacy: {
        title: "Privacy",
        layout: "document",
        showToc: true,
        tocTitle: "Contents",
        sections: [
          { id: "privacy-one", heading: "Privacy one", paragraphs: ["Privacy text."] },
          { id: "privacy-two", heading: "Privacy two", paragraphs: ["More privacy text."] }
        ]
      }
    }
  }));

  await page.setViewportSize({ width: 480, height: 800 });
  for (const path of ["/pages/privacy.html", "/pages/legal-notice.html"]) {
    await page.goto(path);
    const toc = page.locator(".statute-toc");
    const toggle = page.locator("[data-toc-toggle]");
    const list = page.locator("[data-page-toc-list]");
    await expect(toc).toBeVisible();
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveText("");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(list).toHaveCSS("display", "none");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(list).toHaveCSS("display", "grid");
  }
});

test("local page overrides render German content through English canonical keys", async ({ page }) => {
  await page.route("**/data/pages.local.json", (route) => route.fulfill({
    json: {
      privacy: {
        title: "Datenschutzerklärung",
        description: "Lokale Datenschutzhinweise.",
        layout: "document",
        sections: [{
          id: "datenverarbeitung",
          heading: "Datenschutz",
          paragraphs: ["Lokaler deutscher Datenschutztext."]
        }]
      },
      membership: {
        form: {
          subject: "Mitglied werden",
          source: "/pages/membership.html",
          submitLabel: "Senden"
        }
      }
    }
  }));
  await page.route("https://js.hcaptcha.com/**", (route) => route.fulfill({ status: 200, body: "" }));

  await page.goto("/pages/privacy.html");
  await expect(page.getByRole("heading", { name: "Datenschutzerklärung" })).toBeVisible();
  await expect(page.getByText("Lokaler deutscher Datenschutztext.")).toBeVisible();

  await page.goto("/pages/membership.html");
  await expect(page.locator('[name="subject"]')).toHaveValue("Mitglied werden");
  await expect(page.locator('[data-membership-form] [type="submit"]')).toHaveText("Senden");
});

test("footer subpage links return to footer and explicit back targets still win", async ({ page }) => {
  await page.goto("/index.html#footer");
  for (const href of [
    "pages/legal-notice.html?back=footer",
    "pages/privacy.html?back=footer",
    "pages/bylaws.html?back=footer",
    "pages/board.html?back=footer"
  ]) {
    await expect(page.locator(`[data-footer-links] a[href="${href}"]`)).toHaveCount(1);
  }

  await page.goto("/pages/legal-notice.html");
  await expect(page.locator("[data-back-label]")).toHaveAttribute("href", "../index.html#footer");
  await page.goto("/pages/legal-notice.html?back=contact");
  await expect(page.locator("[data-back-label]")).toHaveAttribute("href", "../index.html#contact");
});

test("forms expose autofill-friendly fields and no captcha appears by default", async ({ page }) => {
  await page.route("https://js.hcaptcha.com/**", (route) => route.fulfill({ status: 200, body: "" }));

  await page.goto("/pages/contact.html");
  await expect(page.locator("[data-contact-captcha]")).toBeHidden();
  await expect(page.locator("[data-contact-form]")).toHaveAttribute("autocomplete", "on");
  await expect(page.locator("#name")).toHaveAttribute("name", "name");
  await expect(page.locator("#name")).toHaveAttribute("autocomplete", "name");
  await expect(page.locator("#email")).toHaveAttribute("name", "email");
  await expect(page.locator("#email")).toHaveAttribute("autocomplete", "email");
  await expect(page.locator("#tel")).toHaveAttribute("name", "phone");
  await expect(page.locator("#tel")).toHaveAttribute("autocomplete", "tel");
  await expect(page.locator("#subject")).toHaveAttribute("autocomplete", "on");
  await expect(page.locator("#message")).toHaveAttribute("autocomplete", "on");

  await page.goto("/pages/membership.html");
  await expect(page.locator(".captcha-box")).toBeHidden();
  await expect(page.locator("[data-membership-form]")).toHaveAttribute("autocomplete", "on");
  await expect(page.locator('[name="given-name"]')).toHaveAttribute("autocomplete", "given-name");
  await expect(page.locator('[name="family-name"]')).toHaveAttribute("autocomplete", "family-name");
  await expect(page.locator('[name="bday"]')).toHaveAttribute("type", "date");
  await expect(page.locator('[name="bday"]')).toHaveAttribute("autocomplete", "bday");
  await expect(page.locator('[name="address-line1"]')).toHaveAttribute("autocomplete", "address-line1");
  await expect(page.locator('[name="postal-code"]')).toHaveAttribute("autocomplete", "postal-code");
  await expect(page.locator('[name="address-level2"]')).toHaveAttribute("autocomplete", "address-level2");
  await expect(page.locator('[name="tel"]')).toHaveAttribute("autocomplete", "tel");
  await expect(page.locator('[name="email"]')).toHaveAttribute("autocomplete", "email");
  await expect(page.locator('[name="iban"]')).toHaveAttribute("autocomplete", "on");
  await expect(page.locator('[name="bic"]')).toHaveAttribute("autocomplete", "on");
});

test("forms render configured hCaptcha and mCaptcha widgets", async ({ page }) => {
  await page.route("https://js.hcaptcha.com/**", (route) => route.fulfill({ status: 200, body: "" }));
  await page.route("https://captcha.example/assets/mcaptcha.js", (route) => route.fulfill({ status: 200, body: "" }));
  await page.route("**/data/site.local.json", (route) => route.fulfill({
    json: {
      captcha: {
        provider: "hcaptcha",
        siteKey: "public-hcaptcha-key"
      }
    }
  }));
  await page.route("**/data/pages.local.json", (route) => route.fulfill({
    json: {
      membership: {
        form: {
          captcha: {
            provider: "mcaptcha",
            siteKey: "public-mcaptcha-key",
            widgetUrl: "https://captcha.example/widget/site",
            scriptUrl: "https://captcha.example/assets/mcaptcha.js"
          }
        }
      }
    }
  }));

  await page.goto("/pages/contact.html");
  await expect(page.locator("[data-contact-captcha]")).toBeVisible();
  await expect(page.locator("[data-contact-captcha] [data-hcaptcha]")).toHaveAttribute("data-sitekey", "public-hcaptcha-key");

  await page.goto("/pages/membership.html");
  await expect(page.locator(".captcha-box")).toBeVisible();
  await expect(page.locator("#mcaptcha__token-label")).toHaveAttribute("data-mcaptcha_url", "https://captcha.example/widget/site");
  await expect(page.locator('[name="mcaptcha__token"]')).toHaveAttribute("id", "mcaptcha__token");
  await expect(page.locator("#mcaptcha__widget-container")).toHaveCount(1);
});

test("contact form uses English defaults and submits inline", async ({ page }) => {
  await page.route("https://js.hcaptcha.com/**", (route) => route.fulfill({ status: 200, body: "" }));

  await page.goto("/pages/contact.html?subject=Booking&back=contact");
  await expect(page.getByRole("heading", { name: "Contact form" })).toBeVisible();
  await expect(page.locator('[data-contact-label="subject"]')).toHaveText("Subject *");
  await expect(page.locator('[name="subject"]')).toHaveValue("Booking");

  await page.locator("#name").fill("Test User");
  await page.locator("#email").fill("test@example.org");
  await page.locator("#message").fill("Please contact me.");
  await page.locator("#privacy").check();
  await page.locator("[data-contact-form]").locator('[type="submit"]').click();

  await expect(page.locator(".form-status")).toHaveAttribute("role", "status");
  await expect(page.locator(".form-status")).toHaveText("Message was sent.");
  await expect(page).toHaveURL(/\/pages\/contact\.html\?subject=Booking&back=contact$/);
});

test("contact and booking form use local German copy and status messages", async ({ page }) => {
  await page.route("https://js.hcaptcha.com/**", (route) => route.fulfill({ status: 200, body: "" }));
  await page.route("**/data/site.local.json", (route) => route.fulfill({
    json: {
      contactForm: {
        formTitle: "Kontaktformular",
        submitLabel: "Senden",
        successMessage: "Nachricht wurde gesendet.",
        labels: {
          subject: "Betreff *",
          message: "Nachricht *",
          privacy: "Ich habe die <a href=\"privacy.html\">Datenschutzerklärung</a> gelesen. *"
        },
        validation: {
          message: "Bitte schreibe eine kurze Nachricht."
        }
      }
    }
  }));

  await page.goto("/pages/contact.html?subject=Allgemeines%20Anliegen&back=contact");
  await expect(page.getByRole("heading", { name: "Kontaktformular" })).toBeVisible();
  await expect(page.locator('[data-contact-label="subject"]')).toHaveText("Betreff *");
  await expect(page.locator('[data-contact-label="message"]')).toHaveText("Nachricht *");
  await expect(page.locator('[data-contact-label="privacy"]')).toContainText("Datenschutzerklärung");
  await expect(page.locator('[name="subject"]')).toHaveValue("Allgemeines Anliegen");

  await page.locator("#name").fill("Test User");
  await page.locator("#email").fill("test@example.org");
  await page.locator("#message").fill("Bitte melden.");
  await page.locator("#privacy").check();
  await page.locator("[data-contact-form]").locator('[type="submit"]').click();

  await expect(page.locator(".form-status")).toHaveText("Nachricht wurde gesendet.");
});

test("membership form submits inline without navigating to JSON", async ({ page }) => {
  await page.route("https://js.hcaptcha.com/**", (route) => route.fulfill({ status: 200, body: "" }));
  await page.goto("/pages/membership.html");
  await expect(page.locator('[name="subject"]')).toHaveValue("Membership application");
  await expect(page.locator('[name="source"]')).toHaveValue("/pages/membership.html");
  await page.locator('[name="family-name"]').fill("Muster");
  await page.locator('[name="given-name"]').fill("Erika");
  await page.locator('[name="bday"]').fill("1990-01-31");
  await page.locator('[name="address-line1"]').fill("Musterstrasse 1");
  await page.locator('[name="address-level2"]').fill("Kaiserslautern");
  await page.locator('[name="postal-code"]').fill("67659");
  await page.locator('[name="tel"]').fill("+491234567");
  await page.locator('[name="email"]').fill("erika@example.org");
  await page.locator('[name="iban"]').fill("DE02120300000000202051");
  await page.locator('[name="bic"]').fill("BYLADEM1001");
  await page.locator('[name="motivation"]').fill("Ich moechte mitmachen.");
  await page.locator("[data-consents] input[required]").evaluateAll((inputs) => {
    inputs.forEach((input) => {
      input.checked = true;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  });
  await page.evaluate(() => {
    const input = document.createElement("textarea");
    input.name = "h-captcha-response";
    input.value = "test-captcha";
    document.querySelector("[data-membership-form]").append(input);
  });

  await page.locator("[data-membership-form]").locator('[type="submit"]').click();

  await expect(page.locator("[data-form-status]")).toHaveAttribute("role", "status");
  await expect(page.locator("[data-form-status]")).toHaveText("Your submission was sent if form processing is configured.");
  await expect(page).toHaveURL(/\/pages\/membership\.html$/);
  await expect(page.locator("body")).not.toContainText('"ok":true');
});

test("membership form uses local German success status", async ({ page }) => {
  await page.route("https://js.hcaptcha.com/**", (route) => route.fulfill({ status: 200, body: "" }));
  await page.route("**/data/pages.local.json", (route) => route.fulfill({
    json: {
      membership: {
        form: {
          subject: "Mitglied werden",
          source: "/pages/membership.html",
          thanksText: "Aufnahmeantrag wurde gesendet."
        }
      }
    }
  }));

  await page.goto("/pages/membership.html");
  await page.locator('[name="family-name"]').fill("Muster");
  await page.locator('[name="given-name"]').fill("Erika");
  await page.locator('[name="bday"]').fill("1990-01-31");
  await page.locator('[name="address-line1"]').fill("Musterstrasse 1");
  await page.locator('[name="address-level2"]').fill("Kaiserslautern");
  await page.locator('[name="postal-code"]').fill("67659");
  await page.locator('[name="tel"]').fill("+491234567");
  await page.locator('[name="email"]').fill("erika@example.org");
  await page.locator('[name="iban"]').fill("DE02120300000000202051");
  await page.locator('[name="bic"]').fill("BYLADEM1001");
  await page.locator('[name="motivation"]').fill("Ich moechte mitmachen.");
  await page.locator("[data-consents] input[required]").evaluateAll((inputs) => {
    inputs.forEach((input) => {
      input.checked = true;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  });
  await page.evaluate(() => {
    const input = document.createElement("textarea");
    input.name = "h-captcha-response";
    input.value = "test-captcha";
    document.querySelector("[data-membership-form]").append(input);
  });

  await page.locator("[data-membership-form]").locator('[type="submit"]').click();
  await expect(page.locator("[data-form-status]")).toHaveText("Aufnahmeantrag wurde gesendet.");
});

test("membership form subject can be overridden from local page config", async ({ page }) => {
  await page.route("**/data/pages.local.json", (route) => route.fulfill({
    json: {
      membership: {
        form: {
          subject: "Membership application",
          source: "/pages/membership.html"
        }
      }
    }
  }));
  await page.route("https://js.hcaptcha.com/**", (route) => route.fulfill({ status: 200, body: "" }));

  await page.goto("/pages/membership.html");
  await expect(page.locator('[name="subject"]')).toHaveValue("Membership application");
  await expect(page.locator('[name="source"]')).toHaveValue("/pages/membership.html");
});

test("event detail titles stay clear of images and active card actions wrap cleanly", async ({ page }) => {
  const events = [
    {
      id: "responsive-layout-event",
      slug: "responsive-layout-event",
      title: "Supercalifragilisticexpialidocious-Responsive-Layout-Event",
      date: "2030-09-19",
      status: "upcoming",
      image: "assets/icons/site-placeholder.svg",
      excerpt: "Synthetic layout fixture.",
      ticketUrl: "https://tickets.example.org/responsive-layout-event",
      ticketEmbed: "https://tickets.clevertix.de/fourteen/w/example/?iframe=1",
      detailUrl: "pages/event.html?id=responsive-layout-event"
    },
    {
      id: "responsive-archive-event",
      slug: "responsive-archive-event",
      title: "Archived-Supercalifragilisticexpialidocious-Layout-Event",
      date: "2020-06-15",
      status: "archive",
      image: "assets/icons/site-placeholder.svg",
      excerpt: "Synthetic archive layout fixture.",
      detailUrl: "pages/event.html?id=responsive-archive-event"
    }
  ];
  await page.route("**/data/events.content.json", (route) => route.fulfill({ json: events }));

  for (const event of events) {
    for (const width of [1440, 1000, 900, 480]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/pages/event.html?id=${event.id}`);
      await expect(page.getByRole("heading", { name: event.title })).toBeVisible();
      const layout = await page.evaluate(() => {
        const title = document.querySelector(".event-detail-hero h1").getBoundingClientRect();
        const image = document.querySelector(".event-detail-hero figure").getBoundingClientRect();
        return {
          intersects: title.left < image.right
            && title.right > image.left
            && title.top < image.bottom
            && title.bottom > image.top,
          overflow: document.documentElement.scrollWidth > window.innerWidth
        };
      });
      expect(layout.intersects).toBe(false);
      expect(layout.overflow).toBe(false);
    }
  }

  await page.goto("/pages/event.html?id=responsive-layout-event");
  await expect(page.locator(".event-ticket iframe")).toHaveCSS("height", "316px");

  await page.setViewportSize({ width: 480, height: 900 });
  await page.goto("/index.html#events");
  await expect(page.locator("[data-upcoming-events] .event-card__actions")).toBeVisible();
  await page.locator("[data-upcoming-events] .event-card__actions").evaluate((actions) => {
    actions.style.width = "160px";
  });
  const actionLayout = await page.evaluate(() => {
    const actions = document.querySelector("[data-upcoming-events] .event-card__actions");
    const links = [...actions.querySelectorAll("a")];
    return {
      display: getComputedStyle(actions).display,
      gap: Number.parseFloat(getComputedStyle(actions).columnGap),
      linkTops: links.map((link) => Math.round(link.getBoundingClientRect().top)),
      linkWhiteSpace: links.map((link) => getComputedStyle(link).whiteSpace),
      overflow: document.documentElement.scrollWidth > window.innerWidth
    };
  });
  expect(actionLayout.display).toBe("flex");
  expect(actionLayout.gap).toBeGreaterThan(0);
  expect(actionLayout.linkTops[1]).toBeGreaterThan(actionLayout.linkTops[0]);
  expect(actionLayout.linkWhiteSpace).toEqual(["nowrap", "nowrap"]);
  expect(actionLayout.overflow).toBe(false);
});

test("archive event pages can hide generic gallery and embed helper copy", async ({ page }) => {
  await page.route("**/data/site.local.json", (route) => route.fulfill({
    json: {
      eventsSection: {
        labels: {
          showGalleryDescription: false,
          showEmbedsHeading: false
        }
      }
    }
  }));
  await page.route("**/data/events.content.json", (route) => route.fulfill({
    json: [{
      id: "archive-helper-copy-test",
      title: "Archive Helper Copy Test",
      status: "archive",
      image: "assets/icons/site-placeholder.svg",
      gallery: [{ src: "assets/icons/site-placeholder.svg", alt: "Example gallery image" }],
      embeds: [{ provider: "youtube", title: "Example embed", src: "https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ" }]
    }]
  }));

  await page.goto("/pages/event.html?id=archive-helper-copy-test");
  await expect(page.getByRole("heading", { name: "Event images" })).toBeVisible();
  await expect(page.getByText("1 locally stored archive images.")).toHaveCount(0);
  await expect(page.locator(".event-embeds iframe")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Embedded content" })).toHaveCount(0);
});

test("contact subject is prefilled from query parameter", async ({ page }) => {
  await page.goto("/pages/contact.html?subject=Volunteer&back=contact");
  const subject = page.locator('[name="subject"], #subject, [name="betreff"], #betreff').first();
  await expect(subject).toHaveValue("Volunteer");
});

test("key subpages render", async ({ page }) => {
  for (const url of [
    "/pages/contact.html",
    "/pages/crowdfunding.html",
    "/pages/membership.html",
    "/pages/legal-notice.html",
    "/pages/privacy.html",
    "/pages/board.html"
  ]) {
    await page.goto(url);
    await expect(page.locator("body")).not.toBeEmpty();
  }
});
