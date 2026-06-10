import path from "node:path";
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile, copyFile } from "node:fs/promises";
import { safeAssetUrl, safeIframeUrl, safeUrl, sanitizeConfiguredContent } from "../security/content-safety.js";
import { normalizeSiteContent } from "./site-theme.js";
import { cultureImageReferenceErrors } from "./culture-images.js";

const EDITABLE_FILES = {
  site: "public/data/site.local.json",
  pages: "public/data/pages.local.json",
  culture: "public/data/culture.local.json",
  events: "public/data/events.content.json"
};
const DEFAULT_EVENTS_FILE = "public/data/events.default.json";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const EVENT_STATUSES = new Set(["upcoming", "archive"]);
const TICKET_FIELDS = ["ticketUrl", "ticketLink", "ticketEmbed", "ticketEmbedHeight", "ticketDetails"];
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const DEFAULT_EVENT_IMAGE = "assets/icons/site-placeholder.svg";

export function editableRegistry() {
  return Object.entries(EDITABLE_FILES).map(([key, relativePath]) => ({ key, relativePath }));
}

export function resolveEditablePath(rootDir, key) {
  const relativePath = EDITABLE_FILES[key];
  if (!relativePath) throw Object.assign(new Error(`Unknown editable content key: ${key}`), { status: 404 });
  return safeJoin(rootDir, relativePath);
}

export async function readJsonFile(filePath, fallback = {}) {
  try {
    const content = await readFile(filePath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    error.message = `Could not read JSON ${filePath}: ${error.message}`;
    throw error;
  }
}

export async function readContent(rootDir) {
  const entries = await Promise.all(
    Object.keys(EDITABLE_FILES).map(async (key) => [key, await readContentKey(rootDir, key)])
  );
  return Object.fromEntries(entries);
}

export async function readContentKey(rootDir, key) {
  const filePath = resolveEditablePath(rootDir, key);
  if (key === "events") return readEvents(rootDir);
  return readJsonFile(filePath, {});
}

export async function readEvents(rootDir) {
  const defaults = await readJsonFile(safeJoin(rootDir, DEFAULT_EVENTS_FILE), []);
  return readJsonFile(resolveEditablePath(rootDir, "events"), defaults);
}

export async function writeContentKey(rootDir, key, value) {
  if (key === "events") return saveEvents(rootDir, value);
  const filePath = resolveEditablePath(rootDir, key);
  assertJsonValue(value);
  const normalized = key === "site" ? normalizeSiteContent(value) : value;
  if (key === "culture") {
    const errors = cultureImageReferenceErrors(normalized);
    if (Object.keys(errors).length) throw validationError(errors, "Culture content validation failed.");
  }
  await writeJsonAtomic(rootDir, filePath, sanitizeConfiguredContent(normalized));
  return readContentKey(rootDir, key);
}

export function slugify(value = "event") {
  const slug = String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " und ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return slug || "event";
}

export function uniqueEventSlug(events, wantedSlug, existingId = "") {
  const base = slugify(wantedSlug);
  const taken = new Set(
    events
      .filter((event) => (event.id || event.slug) !== existingId)
      .flatMap((event) => [event.id, event.slug].filter(Boolean))
  );
  let slug = base;
  let suffix = 2;
  while (taken.has(slug)) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }
  return slug;
}

export function normalizeEvent(input = {}, existingEvents = [], options = {}) {
  if (!input || typeof input !== "object") {
    throw validationError({ event: "Event data must be an object." });
  }

  const errors = {};
  const title = cleanString(input.title);
  if (!title) errors.title = "Title is required.";

  const requestedStatus = cleanString(input.status || "upcoming");
  if (!EVENT_STATUSES.has(requestedStatus)) {
    errors.status = "Status must be upcoming or archive.";
  }

  const existingId = cleanString(options.existingId ?? input.id ?? input.slug);
  const id = uniqueEventSlug(existingEvents, cleanString(input.slug || input.id || title), existingId);
  const status = EVENT_STATUSES.has(requestedStatus) ? requestedStatus : "upcoming";
  const image = cleanString(input.image || input.coverImage || DEFAULT_EVENT_IMAGE);
  const coverImage = cleanString(input.coverImage || input.image);
  const gallery = Array.isArray(input.gallery) ? input.gallery.map(normalizeGalleryImage).filter(Boolean) : [];

  validateMediaPath(image, "image", errors);
  if (coverImage) validateMediaPath(coverImage, "coverImage", errors);
  gallery.forEach((imageItem, index) => {
    validateMediaPath(typeof imageItem === "string" ? imageItem : imageItem.src, `gallery.${index}`, errors);
  });
  validateOptionalUrl(input.ticketUrl || input.ticketLink, "ticketUrl", errors);
  if (cleanString(input.ticketEmbed) && !safeIframeUrl(input.ticketEmbed)) {
    errors.ticketEmbed = "Ticket embed URL must use an approved HTTPS provider.";
  }
  validateOptionalTicketEmbedHeight(input.ticketEmbedHeight, errors);
  validateOptionalUrl(input.instagramPostUrl, "instagramPostUrl", errors);
  validateDetailUrl(input.detailUrl, errors);
  (Array.isArray(input.embeds) ? input.embeds : []).forEach((embed, index) => {
    if (!safeIframeUrl(embed?.src)) errors[`embeds.${index}.src`] = "Embed URL must use an approved HTTPS provider.";
  });

  if (Object.keys(errors).length) throw validationError(errors);

  const normalized = {
    id,
    slug: id,
    title,
    date: cleanString(input.date),
    displayDate: cleanString(input.displayDate),
    time: cleanString(input.time),
    status,
    image,
    coverImage,
    imagePosition: cleanString(input.imagePosition || "center center"),
    excerpt: cleanString(input.excerpt),
    description: normalizeStringArray(input.description),
    location: cleanString(input.location),
    ticketUrl: cleanString(input.ticketUrl || input.ticketLink),
    ticketLink: cleanString(input.ticketLink),
    ticketEmbed: cleanString(input.ticketEmbed),
    ticketEmbedHeight: normalizeOptionalTicketEmbedHeight(input.ticketEmbedHeight),
    ticketDetails: cleanString(input.ticketDetails),
    instagramPostUrl: cleanString(input.instagramPostUrl),
    detailUrl: cleanString(input.detailUrl || `pages/events/${id}.html`),
    embeds: Array.isArray(input.embeds) ? input.embeds.map(normalizeEmbed).filter(Boolean) : [],
    tags: normalizeStringArray(input.tags),
    sections: Array.isArray(input.sections) ? input.sections.map(normalizeSection).filter(Boolean) : [],
    gallery,
    originalImages: Array.isArray(input.originalImages) ? input.originalImages : []
  };

  if (!normalized.coverImage) delete normalized.coverImage;
  if (status === "archive") return archiveEvent(normalized);
  return removeEmptyEventFields(normalized);
}

export function archiveEvent(event = {}) {
  return removeEmptyEventFields({
    ...event,
    status: "archive",
    sections: (event.sections || []).filter((section) => !isTicketSection(section)),
    ticketUrl: "",
    ticketLink: "",
    ticketEmbed: "",
    ticketEmbedHeight: "",
    ticketDetails: ""
  }, { keepTicketFields: true });
}

export async function saveEvents(rootDir, inputEvents) {
  if (!Array.isArray(inputEvents)) {
    throw Object.assign(new Error("Events content must be an array."), { status: 400 });
  }
  const events = [];
  for (const event of inputEvents) {
    events.push(normalizeEvent(event, events, { existingId: "" }));
  }

  const contentPath = resolveEditablePath(rootDir, "events");
  await writeJsonAtomic(rootDir, contentPath, events);
  await writeEventPages(rootDir, events);
  return events;
}

export async function deleteEvent(rootDir, inputEvents, eventId) {
  if (!Array.isArray(inputEvents)) {
    throw Object.assign(new Error("Events content must be an array."), { status: 400 });
  }
  const id = cleanString(eventId);
  const index = inputEvents.findIndex((event) => event.id === id || event.slug === id);
  if (index === -1) throw Object.assign(new Error("Event not found."), { status: 404 });
  const deleted = inputEvents[index];
  const events = await saveEvents(rootDir, inputEvents.filter((event, eventIndex) => eventIndex !== index));
  await removeGeneratedEventPage(rootDir, deleted.id || deleted.slug);
  return { deleted, events };
}

export function generateEventPageHtml(event) {
  const id = cleanString(event.id || event.slug);
  const title = cleanString(event.title || "Event");
  const isArchive = event.status === "archive";
  const description = cleanString(event.excerpt || event.description?.[0] || `Event page for ${title}`);
  return `<!doctype html>
<!-- This file is generated by the local website editor. -->
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)} | Event</title>
    <meta name="description" content="${escapeHtml(description)}">
    <link rel="stylesheet" href="../../styles/main.css">
    <script type="module" src="../../js/event-detail.js"></script>
  </head>
  <body data-event="${escapeHtml(id)}">
    <main class="section event-detail-page" data-event-page>
      <a class="text-link detail-back" href="../../index.html#${isArchive ? "archive" : "events"}">${isArchive ? "Back to archive" : "Back to events"}</a>
      <div data-event-detail></div>
    </main>
  </body>
</html>
`;
}

export async function listMedia(rootDir) {
  const mediaRoot = safeJoin(rootDir, "public/assets/images");
  const files = [];
  await collectMedia(mediaRoot, mediaRoot, files);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

export async function saveUploadedMedia(rootDir, payload = {}) {
  const filename = sanitizeFilename(payload.filename || "upload");
  const extension = path.extname(filename).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(extension)) {
    throw Object.assign(new Error("Only jpg, jpeg, png, webp and gif images are allowed."), { status: 400 });
  }
  const data = cleanString(payload.dataBase64).replace(/^data:[^,]+,/, "");
  if (!/^[a-zA-Z0-9+/]*={0,2}$/.test(data) || data.length % 4 !== 0) {
    throw Object.assign(new Error("Image upload must contain valid base64 data."), { status: 400 });
  }
  const buffer = Buffer.from(data, "base64");
  if (!buffer.length) throw Object.assign(new Error("Image upload is empty."), { status: 400 });
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw Object.assign(new Error("Image upload exceeds the 8 MB limit."), { status: 413 });
  }
  if (!matchesImageSignature(buffer, extension)) {
    throw Object.assign(new Error("Image content does not match the selected file type."), { status: 400 });
  }

  const folder = mediaFolder(payload);
  const targetDir = safeJoin(rootDir, `public/assets/images/${folder}`);
  await mkdir(targetDir, { recursive: true });

  const targetName = await uniqueFilename(targetDir, filename);
  const targetPath = safeJoin(targetDir, targetName);
  await writeFile(targetPath, buffer);
  return {
    path: path.relative(safeJoin(rootDir, "public"), targetPath).split(path.sep).join("/"),
    filename: targetName,
    bytes: buffer.length
  };
}

export function safeJoin(rootDir, relativePath) {
  const root = path.resolve(rootDir);
  const target = path.resolve(root, relativePath);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw Object.assign(new Error("Path is outside the project root."), { status: 400 });
  }
  return target;
}

async function writeEventPages(rootDir, events) {
  const pageDir = safeJoin(rootDir, "public/pages/events");
  await mkdir(pageDir, { recursive: true });
  for (const event of events) {
    const id = event.id || event.slug;
    if (!id) continue;
    await writeTextAtomic(rootDir, safeJoin(rootDir, `public/pages/events/${id}.html`), generateEventPageHtml(event));
  }
}

async function removeGeneratedEventPage(rootDir, eventId) {
  const id = cleanString(eventId);
  if (!/^[a-z0-9-]+$/.test(id)) {
    throw Object.assign(new Error("Event id must be a safe slug."), { status: 400 });
  }
  const filePath = safeJoin(rootDir, `public/pages/events/${id}.html`);
  try {
    await backupFile(rootDir, filePath);
    await unlink(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function writeJsonAtomic(rootDir, filePath, value) {
  assertJsonValue(value);
  await writeTextAtomic(rootDir, filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeTextAtomic(rootDir, filePath, content) {
  await backupFile(rootDir, filePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, content, "utf8");
  await rename(tempPath, filePath);
}

async function backupFile(rootDir, filePath) {
  try {
    await stat(filePath);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }

  const relative = path.relative(rootDir, filePath).split(path.sep).join("__");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = safeJoin(rootDir, `.editor-backups/${stamp}/${relative}`);
  await mkdir(path.dirname(backupPath), { recursive: true });
  await copyFile(filePath, backupPath);
}

function assertJsonValue(value) {
  JSON.parse(JSON.stringify(value));
}

function cleanString(value = "") {
  return String(value ?? "").trim();
}

function normalizeStringArray(value) {
  if (Array.isArray(value)) return value.map(cleanString).filter(Boolean);
  if (typeof value === "string") return value.split(/\r?\n|,/).map(cleanString).filter(Boolean);
  return [];
}

function normalizeSection(section) {
  if (!section || typeof section !== "object") return null;
  const heading = cleanString(section.heading);
  const paragraphs = normalizeStringArray(section.paragraphs);
  if (!heading && !paragraphs.length) return null;
  return {
    heading,
    paragraphs
  };
}

function isTicketSection(section = {}) {
  const content = [section.heading, ...(section.paragraphs || [])].join(" ").toLowerCase();
  return content.includes("ticketshop")
    || content.includes("ticket-shop")
    || content.includes("ticket shop");
}

function normalizeEmbed(embed) {
  if (!embed || typeof embed !== "object") return null;
  const src = safeIframeUrl(embed.src);
  if (!src) return null;
  return {
    provider: cleanString(embed.provider || "generic"),
    title: cleanString(embed.title || "Embedded media"),
    src
  };
}

function normalizeGalleryImage(image, index) {
  if (typeof image === "string") return cleanString(image);
  if (!image || typeof image !== "object") return null;
  const src = cleanString(image.src);
  if (!src) return null;
  return {
    src,
    alt: cleanString(image.alt || `Event Bild ${index + 1}`)
  };
}

function removeEmptyEventFields(event, options = {}) {
  const keepTicketFields = Boolean(options.keepTicketFields);
  return Object.fromEntries(
    Object.entries(event).filter(([key, value]) => {
      if (keepTicketFields && TICKET_FIELDS.includes(key)) return true;
      if (Array.isArray(value)) return value.length > 0;
      return value !== "";
    })
  );
}

function validateMediaPath(value, field, errors) {
  if (!value) return;
  if (value === DEFAULT_EVENT_IMAGE) return;
  if (/^https?:\/\//i.test(value)) {
    if (!safeAssetUrl(value)) errors[field] = "Image URL must use http or https.";
    return;
  }
  if (value.startsWith("/") || value.includes("..") || value.includes("\\") || value.includes("\0")) {
    errors[field] = "Image path must be a safe relative path.";
    return;
  }
  const extension = path.extname(value).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(extension)) {
    errors[field] = "Image path must end in jpg, jpeg, png, webp or gif.";
    return;
  }
  if (!value.startsWith("assets/images/") && !value.startsWith("assets/icons/")) {
    errors[field] = "Image path must start with assets/images/ or assets/icons/.";
  }
}

function validateOptionalUrl(value, field, errors) {
  if (!value) return;
  if (!safeUrl(value, { mailto: false })) errors[field] = "URL must use http, https, or a safe local path.";
}

function validateOptionalTicketEmbedHeight(value, errors) {
  const raw = cleanString(value);
  if (!raw) return;
  const height = Number(raw);
  if (!Number.isInteger(height) || height < 240 || height > 1200) {
    errors.ticketEmbedHeight = "Ticket embed height must be a whole number between 240 and 1200.";
  }
}

function normalizeOptionalTicketEmbedHeight(value) {
  const raw = cleanString(value);
  return raw ? Number(raw) : "";
}

function validateDetailUrl(value, errors) {
  if (!value) return;
  const safe = safeUrl(value);
  if (!safe || /^https?:\/\//i.test(safe)) errors.detailUrl = "Detail URL must be a safe local path.";
}

function matchesImageSignature(buffer, extension) {
  if (extension === ".jpg" || extension === ".jpeg") return buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  if (extension === ".png") return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (extension === ".gif") return ["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("ascii"));
  if (extension === ".webp") return buffer.subarray(0, 4).toString("ascii") === "RIFF"
    && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  return false;
}

function validationError(errors, message = "Event validation failed.") {
  return Object.assign(new Error(message), {
    status: 400,
    errors
  });
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function collectMedia(root, directory, files) {
  let entries = [];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await collectMedia(root, fullPath, files);
      continue;
    }
    const extension = path.extname(entry.name).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(extension)) continue;
    const fileStat = await stat(fullPath);
    files.push({
      path: `assets/images/${path.relative(root, fullPath).split(path.sep).join("/")}`,
      bytes: fileStat.size
    });
  }
}

function mediaFolder(payload) {
  const kind = cleanString(payload.kind);
  const slug = slugify(payload.eventSlug || payload.slug || "event");
  const date = cleanString(payload.date) || new Date().toISOString().slice(0, 10);
  if (kind === "eventArchive") return `eventsArchive/${date}-${slug}/display`;
  if (kind === "event") return "events";
  if (kind === "gallery") return "gallery";
  if (kind === "culture") {
    const themeId = cleanString(payload.cultureThemeId || payload.themeId || payload.eventSlug || payload.slug);
    if (!themeId) {
      throw Object.assign(new Error("Culture uploads require a culture theme id."), { status: 400 });
    }
    return `culture/${slugify(themeId)}`;
  }
  return "editor";
}

function sanitizeFilename(value) {
  const parsed = path.parse(value);
  const name = slugify(parsed.name || "upload");
  const extension = parsed.ext.toLowerCase();
  return `${name}${extension}`;
}

async function uniqueFilename(directory, filename) {
  const parsed = path.parse(filename);
  let candidate = filename;
  let index = 2;
  while (true) {
    try {
      await stat(path.join(directory, candidate));
      candidate = `${parsed.name}-${index}${parsed.ext}`;
      index += 1;
    } catch (error) {
      if (error.code === "ENOENT") return candidate;
      throw error;
    }
  }
}
