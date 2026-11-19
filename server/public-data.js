import path from "node:path";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";

/** Reads public/data/<name>; a missing file yields `fallback`, other errors are thrown. */
export async function readPublicJson(publicDir, name, fallback = {}) {
  try {
    return JSON.parse(await readFile(path.join(publicDir, "data", name), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

/** Startup variant: never throws, logs unreadable (but existing) files. */
export function readPublicJsonSync(publicDir, name) {
  try {
    return JSON.parse(readFileSync(path.join(publicDir, "data", name), "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error(JSON.stringify({ level: "error", event: "public_json_unreadable", file: name, message: error.message }));
    }
    return {};
  }
}

/** Deployment overrides (`*.local.json`) deep-merged over tracked defaults (`*.default.json`). */
export async function loadMergedPublicJson(publicDir, defaultName, localName) {
  const base = await readPublicJson(publicDir, defaultName, {});
  const local = await readPublicJson(publicDir, localName, {});
  return mergeData(base, local);
}

export function mergeData(base, override) {
  if (override === null || override === undefined) return base;
  if (Array.isArray(base) || Array.isArray(override)) return override;
  if (typeof base !== "object" || typeof override !== "object") return override;

  const merged = { ...base };
  Object.entries(override).forEach(([key, value]) => {
    merged[key] = key in merged ? mergeData(merged[key], value) : value;
  });
  return merged;
}
