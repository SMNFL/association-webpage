import test from "node:test";
import assert from "node:assert/strict";
import { contactToMail, handleContactRequest, normalizeContactPayload, validateContactPayload } from "../../server/api/contact.js";

test("contact validation rejects missing required fields and consent", () => {
  const result = validateContactPayload({});

  assert.equal(result.valid, false);
  assert.equal(result.errors.name, "Required field is missing.");
  assert.equal(result.errors.email, "Required field is missing.");
  assert.equal(result.errors.message, "Required field is missing.");
  assert.equal(result.errors.privacy, "Please accept the privacy policy.");
});

test("contact validation accepts editable subject defaults", () => {
  assert.equal(normalizeContactPayload({ betreff: "Booking" }).subject, "Booking");
  assert.equal(normalizeContactPayload({ betreff: "Kontakt" }).subject, "Contact");
  assert.equal(normalizeContactPayload({ betreff: "Helfer werden" }).subject, "Volunteer");
  assert.equal(normalizeContactPayload({ subject: "Mitglied werden" }).subject, "Membership application");
  assert.equal(normalizeContactPayload({ betreff: "Custom Thema" }).subject, "Custom Thema");
});

test("contact validation accepts German contact and membership consent aliases", () => {
  const base = {
    name: "Test User",
    email: "test@example.org",
    message: "Hallo"
  };
  assert.equal(validateContactPayload({ ...base, datenschutz_akzeptiert: "on" }).valid, true);
  assert.equal(validateContactPayload({ ...base, data_processing: "on" }).valid, true);
});

test("contact validation accepts browser-native membership field names", () => {
  const result = validateContactPayload({
    "given-name": "Test",
    "family-name": "User",
    email: "test@example.org",
    tel: "+491234",
    motivation: "Ich moechte mitmachen.",
    privacy: "on"
  });

  assert.equal(result.valid, true);
  assert.equal(result.contact.name, "Test User");
  assert.equal(result.contact.phone, "+491234");
  assert.equal(result.contact.message, "Ich moechte mitmachen.");
});

test("contact mail redacts sensitive raw fields", () => {
  const contact = normalizeContactPayload({
    name: "Test User",
    email: "test@example.org",
    subject: "Kontakt",
    message: "Hallo",
    privacy: "on",
    iban: "DE123",
    "h-captcha-response": "secret-token"
  });
  const mail = contactToMail(contact, { to: "host@example.org", from: "site@example.org" });

  assert.equal(mail.to, "host@example.org");
  assert.equal(mail.replyTo, "test@example.org");
  assert.match(mail.subject, /Contact/);
  assert.match(mail.text, /\[redacted\]/);
  assert.doesNotMatch(mail.text, /DE123/);
  assert.doesNotMatch(mail.text, /secret-token/);
});

test("membership mail includes application details", () => {
  const contact = normalizeContactPayload({
    subject: "Membership application",
    "given-name": "Erika",
    "family-name": "Muster",
    bday: "1990-01-31",
    "address-line1": "Musterstrasse 1",
    "address-level2": "Kaiserslautern",
    "postal-code": "67659",
    tel: "+491234567",
    email: "erika@example.org",
    iban: "DE02120300000000202051",
    bic: "BYLADEM1001",
    "membership-type": "Active member",
    motivation: "I want to support the association.",
    data_processing: "on",
    sepa_direct_debit: "on",
    privacy: "on"
  });
  const mail = contactToMail(contact, { to: "host@example.org", from: "site@example.org" });

  assert.equal(contact.name, "Erika Muster");
  assert.equal(contact.message, "I want to support the association.");
  assert.match(mail.subject, /Membership application/);
  assert.match(mail.text, /Membership application:/);
  assert.match(mail.text, /First name: Erika/);
  assert.match(mail.text, /Last name: Muster/);
  assert.match(mail.text, /Date of birth: 1990-01-31/);
  assert.match(mail.text, /Street \/ house number: Musterstrasse 1/);
  assert.match(mail.text, /Postal code: 67659/);
  assert.match(mail.text, /City: Kaiserslautern/);
  assert.match(mail.text, /Phone: \+491234567/);
  assert.match(mail.text, /IBAN: DE02120300000000202051/);
  assert.match(mail.text, /BIC: BYLADEM1001/);
  assert.match(mail.text, /Membership type: Active member/);
  assert.match(mail.text, /Data processing consent: Yes/);
  assert.match(mail.text, /SEPA direct debit consent: Yes/);
  assert.match(mail.html, /<h2>Membership application<\/h2>/);
  assert.match(mail.html, /DE02120300000000202051/);
});

test("contact handler uses mocked SMTP transport", async () => {
  const sent = [];
  const req = {
    body: {
      name: "Test User",
      email: "test@example.org",
      subject: "Booking",
      message: "Bitte melden.",
      privacy: "on"
    },
    ip: "127.0.0.1"
  };
  const res = createJsonResponse();

  await handleContactRequest(req, res, {
    transport: {
      sendMail: async (mail) => {
        sent.push(mail);
        return { messageId: "mock" };
      }
    },
    mailOptions: {
      to: "host@example.org",
      from: "site@example.org"
    }
  });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true, message: "Message was sent." });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].replyTo, "test@example.org");
});

test("contact validation rejects oversized messages and excessive unknown fields", () => {
  const tooLong = validateContactPayload({
    name: "Test",
    email: "test@example.org",
    message: "x".repeat(5001),
    privacy: "on"
  });
  assert.equal(tooLong.valid, false);
  assert.match(tooLong.errors.message, /5000/);

  const tooMany = validateContactPayload(Object.fromEntries(
    Array.from({ length: 41 }, (_, index) => [`field${index}`, "value"])
  ));
  assert.equal(tooMany.errors.form, "Too many form fields.");
});

function createJsonResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}
