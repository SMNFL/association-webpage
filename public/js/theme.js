const DEFAULT_THEME = {
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
  layout: { containerWidth: 1160, cornerStyle: "soft", density: "comfortable" },
  typography: { fontFamily: "sora", textSize: "standard" },
  effects: { ambient: true, backgroundGrid: true }
};

const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

export function normalizeTheme(input = {}) {
  const theme = {
    ...DEFAULT_THEME,
    ...(input || {}),
    colors: { ...DEFAULT_THEME.colors, ...(input?.colors || {}) },
    layout: { ...DEFAULT_THEME.layout, ...(input?.layout || {}) },
    typography: { ...DEFAULT_THEME.typography, ...(input?.typography || {}) },
    effects: { ...DEFAULT_THEME.effects, ...(input?.effects || {}) }
  };
  Object.entries(theme.colors).forEach(([key, value]) => {
    if (!COLOR_PATTERN.test(String(value))) theme.colors[key] = DEFAULT_THEME.colors[key];
  });
  if (!COLOR_PATTERN.test(String(theme.themeColor))) theme.themeColor = DEFAULT_THEME.themeColor;
  return theme;
}

export function applyTheme(input = {}) {
  const theme = normalizeTheme(input);
  const root = document.documentElement;
  const variables = themeCssVariables(theme);
  Object.entries(variables).forEach(([key, value]) => root.style.setProperty(key, value));
  root.dataset.cornerStyle = theme.layout.cornerStyle;
  root.dataset.density = theme.layout.density;
  root.dataset.fontFamily = theme.typography.fontFamily;
  root.dataset.textSize = theme.typography.textSize;
  root.dataset.ambient = String(theme.effects.ambient);
  root.dataset.backgroundGrid = String(theme.effects.backgroundGrid);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme.themeColor);
  return theme;
}

export function themeCssVariables(input = {}) {
  const theme = normalizeTheme(input);
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

export function defaultTheme() {
  return structuredClone(DEFAULT_THEME);
}

window.addEventListener("message", (event) => {
  if (event.origin !== window.location.origin || event.data?.type !== "sukura:preview-theme") return;
  applyTheme(event.data.theme);
});
