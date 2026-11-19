# Membership Form

The membership CTA links to:

```text
public/pages/membership.html
```

The page provides the membership application flow with fields for:

- Last name, first name
- Birth date
- Email address
- Phone number
- Address
- IBAN and BIC
- Membership type
- Motivation text
- Consent checkboxes

## Form Processing

The form is prepared for Netlify Forms:

```html
<form name="membership-application" method="POST" data-netlify="true" netlify-honeypot="bot-field">
```

On Netlify, submissions appear in the Netlify dashboard under Forms.

## Personal And Bank Data

With the Node server, applications are sent by email to `CONTACT_TO`. The email lists name, date of birth, address, phone, email, IBAN, BIC and the consent answers in plain text so the association can set up the SEPA mandate. Only the "Raw data" dump at the end redacts IBAN/BIC. Nothing is stored on the web server.

Because the mailbox becomes the place where this data lives:

- Use a dedicated mailbox with a strong password and two-factor authentication, reachable only by the people who handle memberships.
- Transfer the data into the membership administration, then delete the email. Recommended rule: delete within 30 days, and delete applications that were not accepted immediately.
- Describe this processing, the recipient and the retention period in the privacy policy (`pages.local.json` → `privacy`).
- SMTP delivery uses TLS (`SMTP_REQUIRE_TLS=true` on port 587, or implicit TLS on 465); the receiving provider's storage is outside this application.

## Other Hosts

If the site is hosted somewhere else, connect the form to one of these:

- A serverless function that sends an email to your configured contact address
- A form backend such as Formspree, Basin, or Getform
- A custom API endpoint connected to a secure member database

Do not store membership applications only in frontend JavaScript. The form includes personal and banking data, so processing must happen server-side.

## CAPTCHA

The membership form uses the same optional CAPTCHA provider as the contact form. With no provider config, no widget is shown. For Node/Docker deployments, set CAPTCHA only in `.env`; the server injects the public browser config into the membership JSON at request time.

For hCaptcha on the Node server, set:

```env
CAPTCHA_PROVIDER=hcaptcha
HCAPTCHA_SITE_KEY=YOUR_HCAPTCHA_SITE_KEY
HCAPTCHA_SECRET=YOUR_HCAPTCHA_SECRET
```

For self-hosted mCaptcha, set:

```env
CAPTCHA_PROVIDER=mcaptcha
MCAPTCHA_VERIFY_URL=https://captcha.example.org/api/v1/pow/siteverify
MCAPTCHA_SITE_KEY=YOUR_MCAPTCHA_SITE_KEY
MCAPTCHA_SECRET=YOUR_MCAPTCHA_SECRET
MCAPTCHA_WIDGET_URL=https://captcha.example.org/widget/site
```

For static-only hosting, replace the visible site key in ignored `public/data/pages.local.json` because there is no server env at runtime:

```json
{
  "membership": {
    "form": {
      "captcha": {
        "provider": "hcaptcha",
        "siteKey": "YOUR_HCAPTCHA_SITE_KEY"
      }
    }
  }
}
```

Browser site keys and widget URLs are public configuration; provider secrets must never be written to JSON or frontend JavaScript.
