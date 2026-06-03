import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");
const publicDir = path.join(rootDir, "public");
const app = express();
const port = Number(process.env.PORT || 8080);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get("/healthz", (req, res) => {
  res.json({ ok: true, mode: "e2e" });
});

app.get(["/api/instagram-feed", "/.netlify/functions/instagram-feed"], (req, res) => {
  res.json({
    source: "instagram-public-profile",
    profile: {
      username: "example",
      permalink: "https://www.instagram.com/example/",
      media_count: 12
    },
    posts: [1, 2, 3, 4].map((index) => ({
      id: String(index),
      media_type: "IMAGE",
      media_url: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500"><rect width="500" height="500" fill="#101828"/><text x="40" y="260" fill="#3df7df" font-size="42">Instagram ${index}</text></svg>`)}`,
      permalink: `https://www.instagram.com/p/TEST${index}/`,
      caption: `Instagram Test ${index}`,
      title: `Instagram Test ${index}`,
      timestamp: "2026-05-29T00:00:00.000Z"
    }))
  });
});

app.get([
  "/data/site.local.json",
  "/data/pages.local.json",
  "/data/culture.local.json",
  "/data/instagram-feed.local.json",
  "/data/events.content.json"
], (req, res) => {
  res.sendStatus(404);
});

app.post("/api/contact", (req, res) => {
  if (!req.body.email || !req.body.message && !req.body.nachricht && !req.body.motivation) {
    return res.status(400).json({ ok: false, errors: { message: "Required field is missing." } });
  }
  res.json({ ok: true, message: "Message was sent." });
});

app.get("/js/contact.js", (req, res, next) => {
  res.sendFile(path.join(publicDir, "js", "contact-live.js"), (error) => {
    if (error) next(error);
  });
});

app.use(express.static(publicDir, { extensions: ["html"] }));

app.listen(port, "127.0.0.1", () => {
  console.log(`E2E server listening on http://127.0.0.1:${port}`);
});
