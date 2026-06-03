import test from "node:test";
import assert from "node:assert/strict";
import { addGalleryReference, elementType, galleryHasPath, removeGalleryReference } from "../../ui-web-edit-tool/editor-model.js";

test("main gallery helpers add and remove references without touching media paths", () => {
  const path = "assets/images/gallery/example.jpg";
  const added = addGalleryReference([], path, "Example image");
  assert.deepEqual(added, [{ src: path, alt: "Example image" }]);
  assert.equal(galleryHasPath(added, path), true);
  assert.deepEqual(removeGalleryReference(added, path), []);
});

test("editable element classification reports useful editor type badges", () => {
  assert.equal(elementType({ fields: [{ key: "title" }] }), "Heading");
  assert.equal(elementType({ fields: [{ key: "href" }] }), "Link");
  assert.equal(elementType({ path: ["images", "gallery", 0], fields: [{ key: "alt" }] }), "Gallery");
});
