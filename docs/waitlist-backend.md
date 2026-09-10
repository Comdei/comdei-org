# Waitlist backend setup (one-time, for Lucas)

Waitlist form ("Deixe um contato") posts to a Google Apps Script Web App
that appends a row to a Google Sheet and emails lucas@comdei.org. Do this
once; index.html already has the client-side code wired to it.

## 1. Create the Sheet

1. Create a new Google Sheet (e.g. "Comdei — Lista de espera").
2. Add a header row: `Data | Nome | Email | WhatsApp | Recado`.

## 2. Add the Apps Script

1. In the Sheet: **Extensões → Apps Script**.
2. Delete any starter code and paste:

```javascript
function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = JSON.parse(e.postData.contents);

  sheet.appendRow([
    new Date(),
    data.name || "",
    data.email || "",
    data.whatsapp || "",
    data.message || ""
  ]);

  MailApp.sendEmail({
    to: "lucas@comdei.org",
    subject: "Nova entrada — Lista Comdei",
    body:
      "Nome: " + (data.name || "-") + "\n" +
      "Email: " + (data.email || "-") + "\n" +
      "WhatsApp: " + (data.whatsapp || "-") + "\n" +
      "Recado: " + (data.message || "-")
  });

  return ContentService.createTextOutput(
    JSON.stringify({ ok: true })
  ).setMimeType(ContentService.MimeType.JSON);
}
```

3. Save the project (name it e.g. "Comdei Waitlist").

## 3. Deploy as Web App

1. **Implantar → Nova implantação**.
2. Type: **App da Web**.
3. "Executar como": **Eu** (your Google account).
4. "Quem pode acessar": **Qualquer pessoa** (must be public/anonymous —
   the form has no login).
5. Deploy. Google will ask you to authorize the script (it sends email and
   writes to the Sheet) — approve it.
6. Copy the Web App URL it gives you (ends in `/exec`).

## 4. Wire it into the site

In `index.html`, find:

```javascript
var WAITLIST_ENDPOINT = "PLACEHOLDER";
```

Replace `"PLACEHOLDER"` with the `/exec` URL from step 3, commit, and
deploy the site. Until this is set, the form still works and shows the
same thank-you message, but entries are only saved in the visitor's
browser (`localStorage`) — not sent anywhere.

## Notes

- Re-deploying the script with **Nova implantação** issues a new URL; use
  **Gerenciar implantações → Editar → Nova versão** on the existing
  deployment instead if you edit the script later, so the URL stays the
  same and you don't have to update `index.html` again.
- The fetch is sent with `mode: "no-cors"` since Apps Script doesn't
  answer CORS preflight requests. That means the page can't tell if the
  request actually succeeded — check the Sheet occasionally, or watch
  Apps Script's execution log (**Execuções**, left sidebar) for errors.
