export async function fetchOptionalJson(path) {
  try {
    const response = await fetch(path, { cache: "no-cache" });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Could not load ${path}: ${response.status}`);
    return response.json();
  } catch (error) {
    if (error instanceof TypeError) return null;
    throw error;
  }
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

export async function loadMergedJson(defaultPath, localPath) {
  const base = await fetchOptionalJson(defaultPath);
  if (!base) throw new Error(`Missing required default data file: ${defaultPath}`);
  const local = await fetchOptionalJson(localPath);
  return mergeData(base, local);
}
