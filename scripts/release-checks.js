import { cultureImageReferenceMessages } from "../server/editor/culture-images.js";

export function releaseCultureImageErrors(cultureContent = {}, source = "culture content") {
  return cultureImageReferenceMessages(cultureContent, source);
}
