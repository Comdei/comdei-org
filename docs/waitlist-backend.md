# Waitlist backend setup (one-time, for Lucas)

Waitlist form ("Deixe um contato") posts to a Formspree form that emails
lucas@comdei.org. No Google Sheet — just email, for now. Do this once;
`index.html` already has the client-side code wired to it.

## 1. Create the Formspree form

1. Go to https://formspree.io and sign up / log in with lucas@comdei.org.
2. Create a new form, set its notification email to lucas@comdei.org.
3. Confirm the verification email Formspree sends.
4. Copy the form endpoint, e.g. `https://formspree.io/f/xxxxabcd`.

Any equivalent form-backend service (Formspark, Basin, etc.) works the
same way — just needs a URL that accepts a JSON POST and emails you.

## 2. Wire it into the site

In `index.html`, find:

```javascript
var WAITLIST_ENDPOINT = "PLACEHOLDER";
```

Replace `"PLACEHOLDER"` with the real form URL from step 1 (e.g.
`https://formspree.io/f/xxxxabcd`), commit, and deploy the site.

**Never put a `mailto:` URL here** — that would open the visitor's email
client on submit instead of sending it silently. `WAITLIST_ENDPOINT` must
be an HTTPS form endpoint.

Until this is set to a real URL, the form still works and shows the same
thank-you message, but entries are only saved in the visitor's browser
(`localStorage`) — not sent anywhere.

## Notes

- The fetch sends normal (non-`no-cors`) JSON with `Accept:
  application/json`, so Formspree responds directly — check the browser
  console/network tab if a submission looks off.
- Check the Formspree dashboard occasionally, or set up email forwarding
  rules on lucas@comdei.org, to make sure notifications are landing.
- Free Formspree plans cap submissions per month — watch for that if the
  waitlist takes off.
