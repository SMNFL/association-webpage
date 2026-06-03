import "dotenv/config";
import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { hashPassword } from "../server/security/editor-auth.js";

const terminal = createInterface({ input, output });
try {
  const password = await terminal.question("New editor admin password (minimum 12 characters): ");
  const confirmation = await terminal.question("Repeat password: ");
  if (password !== confirmation) throw new Error("Passwords do not match.");
  const passwordHash = hashPassword(password);
  const sessionSecret = randomBytes(48).toString("base64url");
  const current = await readFile(".env", "utf8").catch(() => "");
  const next = setEnvValue(setEnvValue(current, "EDITOR_PASSWORD_HASH", passwordHash), "EDITOR_SESSION_SECRET", sessionSecret);
  await writeFile(".env", `${next.trim()}\n`, { mode: 0o600 });
  console.log("Editor security values were written to .env. The plain password was not stored.");
} finally {
  terminal.close();
}

function setEnvValue(content, key, value) {
  const line = `${key}=${value}`;
  const matcher = new RegExp(`^${key}=.*$`, "m");
  return matcher.test(content) ? content.replace(matcher, line) : `${content.trim()}\n${line}\n`;
}
