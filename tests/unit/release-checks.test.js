import test from "node:test";
import assert from "node:assert/strict";
import { releaseCultureImageErrors } from "../../scripts/release-checks.js";

test("release check rejects remote culture person images", () => {
  const errors = releaseCultureImageErrors({
    themes: [
      {
        id: "kunst",
        leads: [{ image: "https://sukura.org/old-lead.jpg" }],
        artists: [{ image: "assets/images/culture/kunst/artist.jpg" }]
      }
    ]
  }, "fixture-culture.json");

  assert.equal(errors.length, 1);
  assert.match(errors[0], /fixture-culture\.json: themes\.0\.leads\.0\.image/);
  assert.match(errors[0], /stored locally/);
});

test("release check accepts local culture image folders matching the theme id", () => {
  assert.deepEqual(releaseCultureImageErrors({
    themes: [
      {
        id: "hiphop",
        leads: [{ image: "assets/images/culture/hiphop/lead.png" }],
        artists: [{ image: "assets/icons/site-placeholder.svg" }]
      }
    ]
  }, "fixture-culture.json"), []);
});
