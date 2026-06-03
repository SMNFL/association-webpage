const REQUIRED_FIELDS = ["name", "email", "message"];
const MAX_RAW_FIELDS = 40;
const MAX_LENGTHS = {
  name: 160,
  email: 254,
  phone: 80,
  subject: 180,
  message: 5000,
  source: 200
};
const MEMBERSHIP_FIELD_LABELS = {
  "given-name": "First name",
  "family-name": "Last name",
  bday: "Date of birth",
  "address-line1": "Street / house number",
  "address-level2": "City",
  "postal-code": "Postal code",
  tel: "Phone",
  email: "Email",
  iban: "IBAN",
  bic: "BIC",
  "membership-type": "Membership type",
  motivation: "Motivation",
  data_processing: "Data processing consent",
  sepa_direct_debit: "SEPA direct debit consent",
  datenverarbeitung: "Data processing consent",
  sepa_lastschriftmandat: "SEPA direct debit consent"
};
const SUBJECT_DEFAULTS = new Map([
  ["booking", "Booking"],
  ["kontakt", "Contact"],
  ["helfer werden", "Volunteer"],
  ["allgemeines anliegen", "General request"],
  ["mitglied werden", "Membership application"]
]);

export function normalizeContactPayload(payload = {}) {
  const normalized = {
    name: stringValue(
      payload.name
      || payload.fullName
      || [payload["given-name"], payload["family-name"]].filter(Boolean).join(" ")
      || [payload.firstName || payload.firstname || payload.vorname, payload.lastName || payload.lastname || payload.nachname].filter(Boolean).join(" ")
    ),
    email: stringValue(payload.email || payload.mail),
    phone: stringValue(payload.phone || payload.tel || payload.telefon || payload.telephone),
    subject: stringValue(payload.subject || payload.betreff),
    message: stringValue(payload.message || payload.nachricht || payload.text || payload.motivation),
    privacy: booleanValue(
      payload.privacy
      || payload.datenschutz
      || payload.datenschutz_akzeptiert
      || payload.datenverarbeitung
      || payload.data_processing
      || payload.consent
      || payload.acceptPrivacy
    ),
    hcaptchaToken: stringValue(payload["h-captcha-response"] || payload.hcaptchaToken),
    source: stringValue(payload.source || payload.form || payload._form),
    membership: normalizeMembershipDetails(payload),
    raw: normalizeRawPayload(payload)
  };

  normalized.subject = normalizeSubject(normalized.subject);
  return normalized;
}

export function validateContactPayload(payload = {}) {
  const contact = normalizeContactPayload(payload);
  const errors = {};

  for (const field of REQUIRED_FIELDS) {
    if (!contact[field]) errors[field] = "Required field is missing.";
  }

  for (const [field, maxLength] of Object.entries(MAX_LENGTHS)) {
    if (contact[field]?.length > maxLength) errors[field] = `Maximum ${maxLength} characters allowed.`;
  }

  if (Object.keys(payload).length > MAX_RAW_FIELDS) {
    errors.form = "Too many form fields.";
  }

  if (contact.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) {
    errors.email = "Please enter a valid email address.";
  }

  if (!contact.privacy) {
    errors.privacy = "Please accept the privacy policy.";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    contact
  };
}

export function contactToMail(contact, options = {}) {
  const to = options.to || process.env.CONTACT_TO;
  const from = options.from || process.env.SMTP_FROM || process.env.SMTP_USER;
  const subject = `[Website] ${contact.subject || "Contact"}`;
  const membershipLines = renderMembershipText(contact.membership);
  const textLines = [
    `Subject: ${contact.subject || "Contact"}`,
    `Name: ${contact.name}`,
    `Email: ${contact.email}`
  ];
  if (contact.phone) textLines.push(`Phone: ${contact.phone}`);
  if (contact.source) textLines.push(`Source: ${contact.source}`);
  textLines.push(
    "",
    "Message:",
    contact.message
  );
  if (membershipLines.length) {
    textLines.push("", ...membershipLines);
  }
  textLines.push(
    "",
    "Raw data:",
    JSON.stringify(redactSensitiveFields(contact.raw), null, 2)
  );

  return {
    to,
    from,
    replyTo: contact.email,
    subject,
    text: textLines.join("\n"),
    html: htmlMail(contact)
  };
}

export async function handleContactRequest(req, res, dependencies = {}) {
  const { valid, errors, contact } = validateContactPayload(req.body || {});
  if (!valid) {
    return res.status(400).json({ ok: false, errors });
  }

  if (process.env.HCAPTCHA_SECRET && dependencies.verifyCaptcha) {
    const captchaOk = await dependencies.verifyCaptcha(contact.hcaptchaToken, req.ip);
    if (!captchaOk) {
      return res.status(400).json({ ok: false, errors: { captcha: "Captcha could not be verified." } });
    }
  }

  const mail = contactToMail(contact, dependencies.mailOptions);
  if (!mail.to || !mail.from) {
    return res.status(500).json({ ok: false, errors: { server: "Mail server is not fully configured." } });
  }

  await dependencies.transport.sendMail(mail);
  return res.status(200).json({ ok: true, message: "Message was sent." });
}

function normalizeSubject(value = "") {
  const subject = stringValue(value);
  if (!subject) return "Contact";
  return SUBJECT_DEFAULTS.get(subject.toLowerCase()) || subject;
}

function stringValue(value = "") {
  return String(value || "").trim();
}

function booleanValue(value) {
  if (value === true) return true;
  const normalized = String(value || "").trim().toLowerCase();
  return ["1", "true", "on", "yes", "ja", "accepted"].includes(normalized);
}

function normalizeMembershipDetails(payload = {}) {
  if (!isMembershipPayload(payload)) return [];
  const details = Object.entries(MEMBERSHIP_FIELD_LABELS)
    .map(([field, label]) => {
      const value = field in payload
        ? formatMembershipValue(field, payload[field])
        : "";
      return value ? { field, label, value } : null;
    })
    .filter(Boolean);

  return details.length ? details : [];
}

function isMembershipPayload(payload = {}) {
  const source = stringValue(payload.source || payload.form || payload._form).toLowerCase();
  return source.includes("mitglied")
    || source.includes("membership")
    || Object.hasOwn(payload, "membership-type")
    || Object.hasOwn(payload, "bday")
    || Object.hasOwn(payload, "address-line1")
    || Object.hasOwn(payload, "given-name")
    || Object.hasOwn(payload, "family-name")
    || Object.hasOwn(payload, "motivation")
    || Object.hasOwn(payload, "sepa_direct_debit")
    || Object.hasOwn(payload, "sepa_lastschriftmandat");
}

function formatMembershipValue(field, value) {
  if (field === "data_processing" || field === "sepa_direct_debit" || field === "datenverarbeitung" || field === "sepa_lastschriftmandat") {
    return booleanValue(value) ? "Yes" : "";
  }
  return stringValue(value);
}

function renderMembershipText(details = []) {
  if (!details.length) return [];
  return [
    "Membership application:",
    ...details.map(({ label, value }) => `${label}: ${value}`)
  ];
}

function redactSensitiveFields(value = {}) {
  const clone = { ...value };
  for (const key of Object.keys(clone)) {
    if (/iban|bic|konto|captcha|token|password|passwort/i.test(key)) {
      clone[key] = "[redacted]";
    }
  }
  return clone;
}

function normalizeRawPayload(value = {}) {
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, MAX_RAW_FIELDS)
      .map(([key, item]) => [String(key).slice(0, 120), String(item ?? "").slice(0, 5000)])
  );
}

function htmlMail(contact) {
  const membershipRows = renderMembershipHtml(contact.membership);
  return `
    <h1>New website request</h1>
    <p><strong>Subject:</strong> ${escapeHtml(contact.subject || "Contact")}</p>
    <p><strong>Name:</strong> ${escapeHtml(contact.name)}</p>
    <p><strong>Email:</strong> ${escapeHtml(contact.email)}</p>
    ${contact.phone ? `<p><strong>Phone:</strong> ${escapeHtml(contact.phone)}</p>` : ""}
    ${contact.source ? `<p><strong>Source:</strong> ${escapeHtml(contact.source)}</p>` : ""}
    <h2>Message</h2>
    <p>${escapeHtml(contact.message).replaceAll("\n", "<br>")}</p>
    ${membershipRows}
  `;
}

function renderMembershipHtml(details = []) {
  if (!details.length) return "";
  return `
    <h2>Membership application</h2>
    <table cellpadding="6" cellspacing="0" border="1">
      <tbody>
        ${details.map(({ label, value }) => `
          <tr>
            <th align="left">${escapeHtml(label)}</th>
            <td>${escapeHtml(value).replaceAll("\n", "<br>")}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
