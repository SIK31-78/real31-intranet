// SONDE : le droit Mail.Send app-only s'applique-t-il a syndic2@real31.fr ?
// La sonde du 2026-08-18 n'a prouve que la LECTURE. L'Application Access Policy borne
// les BOITES accessibles, pas les permissions une par une : la lecture marchant sur
// syndic2, l'envoi devrait suivre - "devrait" n'est pas "prouve", d'ou ce test.
//
// ENVOIE UN VRAI MAIL (c'est le seul moyen de tester Mail.Send). Destinataire interne
// impose en dur, objet explicite. Lancement :
//   node scripts/sonde-mail-send-syndic2.mjs
import { readFileSync } from "node:fs";

const BOITE = "syndic2@real31.fr";
const DESTINATAIRE = "sekou.koma@real31.fr";

for (const ligne of readFileSync(".env.local", "utf8").split("\n")) {
  const t = ligne.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  const cle = t.slice(0, i);
  if (!process.env[cle]) process.env[cle] = t.slice(i + 1);
}

const tenant = (process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER || "").match(
  /login\.microsoftonline\.com\/([^/]+)/,
)?.[1];
const id = process.env.AUTH_MICROSOFT_ENTRA_ID_ID;
const secret = process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET;
if (!tenant || !id || !secret) {
  console.error("Identifiants Entra absents dans .env.local");
  process.exit(1);
}

const rt = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    client_id: id,
    client_secret: secret,
    grant_type: "client_credentials",
    scope: "https://graph.microsoft.com/.default",
  }),
});
const jt = await rt.json();
if (!rt.ok) {
  console.error("Jeton refuse :", jt.error_description ?? jt);
  process.exit(1);
}
// Les roles applicatifs reellement portes par le jeton (permissions consenties).
const roles = JSON.parse(Buffer.from(jt.access_token.split(".")[1], "base64").toString()).roles ?? [];
console.log("Permissions du jeton :", roles.join(", ") || "(aucune)");
console.log("Mail.Send accorde au niveau tenant :", roles.includes("Mail.Send") ? "OUI" : "NON");

const r = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(BOITE)}/sendMail`, {
  method: "POST",
  headers: { Authorization: `Bearer ${jt.access_token}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    message: {
      subject: "Test technique intranet - ignorer",
      body: {
        contentType: "Text",
        content:
          "Sonde automatique : verification du droit Mail.Send app-only sur syndic2 " +
          "pour le module Mes e-mails. Aucune action requise.",
      },
      toRecipients: [{ emailAddress: { address: DESTINATAIRE } }],
    },
    saveToSentItems: true,
  }),
});

if (r.status === 202) {
  console.log(`\nVERDICT : ENVOI ACCEPTE (202). Mail.Send fonctionne sur ${BOITE}.`);
  console.log(`Un mail de test est parti vers ${DESTINATAIRE}.`);
} else {
  const err = await r.text();
  console.log(`\nVERDICT : REFUS (${r.status}).`);
  console.log(err.slice(0, 600));
}
