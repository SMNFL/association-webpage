import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SITE_THEME, normalizeSiteContent, normalizeSiteTheme, themeCssVariables } from "../../server/editor/site-theme.js";

test("site theme normalization fills approved defaults and exposes css variables", () => {
  const theme = normalizeSiteTheme({
    colors: { background: "#123456" },
    layout: { containerWidth: 1240 }
  });
  assert.equal(theme.colors.background, "#123456");
  assert.equal(theme.colors.primary, DEFAULT_SITE_THEME.colors.primary);
  assert.equal(theme.layout.containerWidth, 1240);
  assert.equal(themeCssVariables(theme)["--container"], "1240px");
});

test("site theme validation rejects malformed colors and unsafe layout values", () => {
  assert.throws(
    () => normalizeSiteTheme({ colors: { primary: "red" }, layout: { containerWidth: 9999 } }),
    (error) => {
      assert.equal(error.status, 400);
      assert.match(error.errors["theme.colors.primary"], /six-digit hex/);
      assert.match(error.errors["theme.layout.containerWidth"], /880 to 1440/);
      return true;
    }
  );
});

test("site content normalization leaves old files compatible and validates new themes", () => {
  assert.deepEqual(normalizeSiteContent({ name: "Legacy site" }), { name: "Legacy site" });
  assert.equal(normalizeSiteContent({ theme: { preset: "minimal-dark" } }).theme.preset, "minimal-dark");
});
