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

## Other Hosts

If the site is hosted somewhere else, connect the form to one of these:

- A serverless function that sends an email to your configured contact address
- A form backend such as Formspree, Basin, or Getform
- A custom API endpoint connected to a secure member database

Do not store membership applications only in frontend JavaScript. The form includes personal and banking data, so processing must happen server-side.

## hCaptcha

The reusable repository ships with hCaptcha's public test site key so the visible widget appears in clean local/default setups. For the Node server on localhost or production, set both keys in `.env`:

```env
HCAPTCHA_SITE_KEY=YOUR_HCAPTCHA_SITE_KEY
HCAPTCHA_SECRET=YOUR_HCAPTCHA_SECRET
```

For static hosting, replace the visible site key in ignored `public/data/pages.local.json`:

```json
{
  "membership": {
    "form": {
      "hcaptchaSiteKey": "YOUR_HCAPTCHA_SITE_KEY"
    }
  }
}
```

The browser site key is public configuration; the secret must never be written to JSON or frontend JavaScript. The secret does not change the visible widget by itself.
