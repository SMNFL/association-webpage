const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const PRESETS = new Set(["sukura", "minimal-dark", "high-contrast", "custom"]);
const CORNER_STYLES = new Set(["compact", "rounded", "soft"]);
const DENSITIES = new Set(["compact", "comfortable", "spacious"]);
const FONT_FAMILIES = new Set(["sora", "system"]);
const TEXT_SIZES = new Set(["compact", "standard", "large"]);

export const DEFAULT_SITE_THEME = {
  preset: "sukura",
  themeColor: "#060811",
  colors: {
    background: "#050712",
    backgroundSoft: "#0a0d1d",
    surface: "#101427",
    surfaceStrong: "#181e36",
    text: "#f5f7fb",
    muted: "#aeb7c8",
    primary: "#3df7df",
    secondary: "#ff4fd8",
    highlight: "#d5ff5f"
  },
  layout: {
    containerWidth: 1160,
    cornerStyle: "soft",
    density: "comfortable"
  },
  typography: {
    fontFamily: "sora",
    textSize: "standard"
  },
  effects: {
    ambient: true,
    backgroundGrid: true
  }
};

export function normalizeSiteTheme(input = {}, options = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw themeValidationError({ theme: "Theme settings must be an object." });
  }
  const theme = mergeTheme(DEFAULT_SITE_THEME, input);
  const errors = {};

  validateEnum(theme.preset, PRESETS, "theme.preset", errors);
  validateColor(theme.themeColor, "theme.themeColor", errors);
  Object.entries(theme.colors).forEach(([key, value]) => validateColor(value, `theme.colors.${key}`, errors));
  validateNumber(theme.layout.containerWidth, 880, 1440, "theme.layout.containerWidth", errors);
  validateEnum(theme.layout.cornerStyle, CORNER_STYLES, "theme.layout.cornerStyle", errors);
  validateEnum(theme.layout.density, DENSITIES, "theme.layout.density", errors);
  validateEnum(theme.typography.fontFamily, FONT_FAMILIES, "theme.typography.fontFamily", errors);
  validateEnum(theme.typography.textSize, TEXT_SIZES, "theme.typography.textSize", errors);
  validateBoolean(theme.effects.ambient, "theme.effects.ambient", errors);
  validateBoolean(theme.effects.backgroundGrid, "theme.effects.backgroundGrid", errors);

  if (Object.keys(errors).length) throw themeValidationError(errors);
  if (options.partial) return pickThemeKeys(theme, input);
  return theme;
}

export function normalizeSiteContent(content = {}) {
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    throw Object.assign(new Error("Site content must be an object."), { status: 400 });
  }
  if (!Object.hasOwn(content, "theme")) return content;
  return { ...content, theme: normalizeSiteTheme(content.theme) };
}

export function themeCssVariables(input = {}) {
  const theme = normalizeSiteTheme(input);
  return {
    "--color-bg": theme.colors.background,
    "--color-bg-soft": theme.colors.backgroundSoft,
    "--color-surface": theme.colors.surface,
    "--color-surface-strong": theme.colors.surfaceStrong,
    "--color-text": theme.colors.text,
    "--color-muted": theme.colors.muted,
    "--color-cyan": theme.colors.primary,
    "--color-pink": theme.colors.secondary,
    "--color-lime": theme.colors.highlight,
    "--container": `${theme.layout.containerWidth}px`
  };
}

function mergeTheme(base, override) {
  return {
    ...base,
    ...override,
    colors: { ...base.colors, ...(override.colors || {}) },
    layout: { ...base.layout, ...(override.layout || {}) },
    typography: { ...base.typography, ...(override.typography || {}) },
    effects: { ...base.effects, ...(override.effects || {}) }
  };
}

function pickThemeKeys(theme, input) {
  return Object.fromEntries(Object.keys(input).map((key) => [key, theme[key]]));
}

function validateColor(value, field, errors) {
  if (!COLOR_PATTERN.test(String(value || ""))) errors[field] = "Use a six-digit hex color such as #050712.";
}

function validateEnum(value, allowed, field, errors) {
  if (!allowed.has(value)) errors[field] = `Choose one of: ${[...allowed].join(", ")}.`;
}

function validateNumber(value, min, max, field, errors) {
  if (!Number.isInteger(value) || value < min || value > max) errors[field] = `Use a whole number from ${min} to ${max}.`;
}

function validateBoolean(value, field, errors) {
  if (typeof value !== "boolean") errors[field] = "Choose enabled or disabled.";
}

function themeValidationError(errors) {
  return Object.assign(new Error("Theme validation failed."), { status: 400, errors });
}
