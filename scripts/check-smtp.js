import "dotenv/config";
import { createTransportFromEnv } from "../server/mailer.js";

const transport = createTransportFromEnv();

try {
  await transport.verify();
  console.log("SMTP login OK.");
} catch (error) {
  if (error.code === "EAUTH" || error.responseCode === 535) {
    console.error("SMTP login failed.");
    console.error("The server rejected SMTP_USER/SMTP_PASS for the selected auth method.");
    console.error("Try SMTP_AUTH_METHOD=LOGIN if the provider rejects AUTH PLAIN.");
    console.error(`Provider response: ${error.response || error.message}`);
    process.exit(1);
  }
  console.error(`SMTP check failed: ${error.message}`);
  process.exit(1);
} finally {
  transport.close();
}
