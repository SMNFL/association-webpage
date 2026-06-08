import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const protectedPaths = [
  /^\.env(?:\.|$)/,
  /^\.editor-backups\//,
  /^node_modules\//,
  /^test-results\//,
  /^playwright-report\//,
  /^public\/data\/.*\.local\.json$/,
  /^public\/data\/events\.content\.json$/,
  /^public\/js\/events-data\.js$/,
  /^public\/pages\/events\/.*\.html$/,
  /^public\/assets\/docs\//,
  /^public\/assets\/images\//,
  /^public\/assets\/videos\//,
  /^public\/assets\/icons\/(?!site-placeholder\.svg$)/,
  /^public\/.*\.(?:map|bak|old)$/,
  /^public\/.*~$/
];

const allowedEnvironmentExample = ".env.example";
const allowedDefaultEventPages = new Set([
  "public/pages/events/open-culture-night.html",
  "public/pages/events/archive-summer-sessions.html",
  "public/pages/events/archive-workshop-day.html",
  "public/pages/events/archive-listening-room.html",
  "public/pages/events/archive-community-market.html"
]);
const tracked = gitLines("ls-files");
const candidates = gitLines("ls-files", "--others", "--exclude-standard");
const errors = [];

for (const file of [...tracked, ...candidates]) {
  if (file === allowedEnvironmentExample) continue;
  if (allowedDefaultEventPages.has(file)) continue;
  if (protectedPaths.some((pattern) => pattern.test(file))) {
    errors.push(`${tracked.includes(file) ? "tracked" : "unignored"} local-only file: ${file}`);
  }
}

const textFiles = [...new Set([...tracked, ...candidates])]
  .filter((file) => /\.(?:css|html|js|json|md|toml|txt|example)$/.test(file) || file === ".gitignore");

for (const file of textFiles) {
  const content = readFileSync(file, "utf8");
  if (/\/Users\/|C:\\Users\\/.test(content)) errors.push(`local absolute path in ${file}`);
}

const environmentExample = readFileSync(".env.example", "utf8");
for (const required of ["EDITOR_LOCAL_ONLY", "TRUST_PROXY", "CONTACT_ALLOW_WITHOUT_CAPTCHA"]) {
  if (!new RegExp(`^${required}=`, "m").test(environmentExample)) {
    errors.push(`missing ${required} in .env.example`);
  }
}

const staticHeaders = readFileSync("public/_headers", "utf8");
for (const requiredHeader of [
  "Content-Security-Policy:",
  "Strict-Transport-Security:",
  "X-Content-Type-Options:",
  "X-Frame-Options:",
  "Referrer-Policy:",
  "Permissions-Policy:"
]) {
  if (!staticHeaders.includes(requiredHeader)) {
    errors.push(`missing ${requiredHeader} in public/_headers`);
  }
}

const netlifyFunction = readFileSync("netlify/functions/instagram-feed.js", "utf8");
if (!/Strict-Transport-Security/.test(netlifyFunction) || !/X-Content-Type-Options/.test(netlifyFunction)) {
  errors.push("netlify Instagram function must include security headers");
}

if (errors.length) {
  console.error("Public release check failed:");
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log(`Public release check passed: ${tracked.length} tracked files and ${candidates.length} untracked publication candidates inspected.`);
console.log("Local overrides, generated event pages, secrets and deployment-specific media are excluded.");

function gitLines(...args) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.status !== 0) {
    console.error(result.stderr || `git ${args.join(" ")} failed`);
    process.exit(result.status || 1);
  }
  return result.stdout.split("\n").map((line) => line.trim()).filter(Boolean);
}
