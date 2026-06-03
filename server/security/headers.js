const FRAME_SOURCES = [
  "'self'",
  "https://www.youtube.com",
  "https://www.youtube-nocookie.com",
  "https://www.google.com",
  "https://www.paypal.com",
  "https://tickets.clevertix.de",
  "https://www.instagram.com",
  "https://open.spotify.com",
  "https://w.soundcloud.com",
  "https://bandcamp.com",
  "https://challonge.com",
  "https://*.hcaptcha.com"
];

const ENCRYPTED_MEDIA_SOURCES = [
  "self",
  '"https://www.youtube.com"',
  '"https://www.youtube-nocookie.com"',
  '"https://open.spotify.com"',
  '"https://w.soundcloud.com"',
  '"https://bandcamp.com"'
];

const helmetHeaders = helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  strictTransportSecurity: false,
  xFrameOptions: false
});

export function securityHeaders(req, res, next) {
  return helmetHeaders(req, res, () => applyRouteHeaders(req, res, next));
}

function applyRouteHeaders(req, res, next) {
  const editorRoute = req.path.startsWith("/editor") || req.path.startsWith("/api/editor");
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
    `frame-ancestors ${editorRoute ? "'none'" : "'self'"}`,
    "script-src 'self' https://js.hcaptcha.com https://www.instagram.com https://tickets.clevertix.de https://*.hcaptcha.com",
    "style-src 'self' 'unsafe-inline' https://tickets.clevertix.de",
    "img-src 'self' data: https:",
    `frame-src ${FRAME_SOURCES.join(" ")}`,
    "connect-src 'self' https://hcaptcha.com https://*.hcaptcha.com",
    "font-src 'self' data:"
  ];
  res.set("Content-Security-Policy", directives.join("; "));
  res.set("Cross-Origin-Opener-Policy", "same-origin");
  res.set("Cross-Origin-Resource-Policy", "same-origin");
  res.set("Permissions-Policy", `camera=(), microphone=(), geolocation=(), payment=(), encrypted-media=(${ENCRYPTED_MEDIA_SOURCES.join(" ")})`);
  res.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.set("X-Content-Type-Options", "nosniff");
  res.set("X-Frame-Options", editorRoute ? "DENY" : "SAMEORIGIN");
  if (process.env.NODE_ENV === "production") {
    res.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  return next();
}
import helmet from "helmet";
