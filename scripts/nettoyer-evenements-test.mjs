// Nettoyage MANUEL des evenements Outlook de TEST projetes par l'intranet (dates CS/AG).
//
// Contexte : la projection Outlook cree des evenements "S024 : AG a confirmer" /
// "... confirmee" dans l'agenda du gestionnaire, avec la salle en attendee "resource".
// Pendant les tests, ces evenements (et les salles reservees) s'accumulent. Ce script
// aide a faire le menage SANS RIEN supprimer automatiquement.
//
// >>> IMPORTANT : supprimer un evenement qui porte une salle en attendee "resource"
//     ENVOIE une annulation a la room mailbox -> la salle est LIBEREE. C'est le moyen
//     propre de rendre une salle restee bloquee sur un evenement de test.
//
// Deux modes :
//   1) LISTE (dry-run, defaut) : affiche id / sujet / date / salles des evenements de
//      test de la boite. NE SUPPRIME RIEN.
//   2) SUPPRESSION CIBLEE : ne supprime QUE les ids passes explicitement en 2e argument
//      (liste separee par des virgules). Aucun autre evenement n'est touche.
//
// Usage (token app-only via .env.local, memes identifiants que le mail Graph) :
//   node --env-file=.env.local scripts/nettoyer-evenements-test.mjs <boite>
//   node --env-file=.env.local scripts/nettoyer-evenements-test.mjs <boite> <id1,id2,...>
//
// Exemple :
//   node --env-file=.env.local scripts/nettoyer-evenements-test.mjs remi@real31.fr
//   node --env-file=.env.local scripts/nettoyer-evenements-test.mjs remi@real31.fr AAkALg...=,AAkALg...=
//
// >>> SALLE RESTEE BLOQUEE alors que l'evenement a disparu du calendrier du gestionnaire
//     (DELETE historique sans annulation) : lancer le script contre la BOITE DE LA SALLE
//     (ex. real31lgc@real31.fr) -> lister -> supprimer les ids voulus : retirer la copie
//     du calendrier de la salle LIBERE le creneau. Si Graph renvoie 403 sur la salle,
//     c'est que la room mailbox n'est pas dans le groupe de l'Application Access Policy
//     (demande DSI en cours) -> nettoyage manuel via Outlook en attendant.
//
// Le script NE DEVINE JAMAIS quoi supprimer : il ne supprime que ce qu'on lui donne.

const GRAPH = "https://graph.microsoft.com/v1.0";

// Sujet d'un evenement projete par l'intranet : "<ref> : AG|CS <a confirmer|confirmee|confirme>".
// (cf. titreProjectionOutlook). On tolere les accents presents / absents.
const MOTIF_SUJET = /^\S+\s*:\s*(AG|CS)\s+(à|a)\s*confirmer|:\s*(AG|CS)\s+confirm(é|e)e?\b/i;
// Version plus simple et robuste : commence par une reference puis " : AG " ou " : CS ".
const MOTIF_REF = /^\S+\s*:\s*(AG|CS)\b/i;

function estSujetProjection(sujet) {
  const s = (sujet ?? "").trim();
  return MOTIF_REF.test(s) || MOTIF_SUJET.test(s);
}

function tenant() {
  const m = (process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER || "").match(
    /login\.microsoftonline\.com\/([^/]+)/,
  );
  return m?.[1] ?? null;
}

async function jetonGraph() {
  const t = tenant();
  const id = process.env.AUTH_MICROSOFT_ENTRA_ID_ID;
  const secret = process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET;
  if (!t || !id || !secret) {
    throw new Error(
      "Identifiants Entra absents (AUTH_MICROSOFT_ENTRA_ID_ID/SECRET/ISSUER dans .env.local).",
    );
  }
  const r = await fetch(`https://login.microsoftonline.com/${t}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: id,
      client_secret: secret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  if (!r.ok) throw new Error(`Token Graph ${r.status} : ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  if (!j.access_token) throw new Error("Token Graph : access_token absent.");
  return j.access_token;
}

// Liste les evenements de la boite (pagination suivie) et garde ceux qui correspondent
// au motif des projections intranet.
async function listerEvenementsProjetes(tk, boite) {
  const select = "id,subject,start,end,location,attendees";
  let url =
    `${GRAPH}/users/${encodeURIComponent(boite)}/events` +
    `?$select=${encodeURIComponent(select)}&$top=100&$orderby=${encodeURIComponent("start/dateTime")}`;
  const trouves = [];
  let garde = 0;
  while (url && garde < 20) {
    garde += 1;
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${tk}`, Prefer: 'outlook.timezone="Europe/Paris"' },
    });
    if (!r.ok) throw new Error(`Graph liste evenements ${r.status} : ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    for (const e of j.value ?? []) {
      if (estSujetProjection(e.subject)) trouves.push(e);
    }
    url = j["@odata.nextLink"] ?? null;
  }
  return trouves;
}

// Salles / ressources d'un evenement : attendees de type "resource" + le lieu affiche.
function sallesDe(e) {
  const resources = (e.attendees ?? [])
    .filter((a) => a.type === "resource")
    .map((a) => a.emailAddress?.address)
    .filter(Boolean);
  const lieu = e.location?.displayName?.trim();
  return { resources, lieu: lieu || "(aucun)" };
}

async function supprimerEvenement(tk, boite, id) {
  const base = `${GRAPH}/users/${encodeURIComponent(boite)}/events/${encodeURIComponent(id)}`;
  const h = { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" };
  // PIEGE Graph : DELETE ne previent PAS les participants (la salle resterait reservee).
  // POST /cancel envoie l'annulation puis supprime. Fallback DELETE si cancel inapplicable
  // (evenement sans participant, copie d'attendee comme une room mailbox, deja annule).
  const rc = await fetch(`${base}/cancel`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({ comment: "Nettoyage des evenements de test intranet REAL31." }),
  });
  if (rc.ok) return "annule (annulation envoyee aux salles -> salle liberee)";
  if (rc.status === 404) return "deja absent";
  const r = await fetch(base, { method: "DELETE", headers: h });
  if (r.status === 404) return "deja absent";
  if (!r.ok) throw new Error(`Graph suppression ${r.status} : ${(await r.text()).slice(0, 200)}`);
  return "supprime (copie retiree du calendrier)";
}

async function main() {
  const [boite, idsArg] = process.argv.slice(2);
  if (!boite) {
    console.error(
      "Usage : node --env-file=.env.local scripts/nettoyer-evenements-test.mjs <boite> [id1,id2,...]",
    );
    console.error("Sans liste d'ids -> LISTE seulement (dry-run, aucune suppression).");
    process.exit(1);
  }

  const tk = await jetonGraph();
  const evenements = await listerEvenementsProjetes(tk, boite);

  console.log(`\nBoite : ${boite}`);
  console.log(`Evenements de test (projections CS/AG) trouves : ${evenements.length}\n`);
  for (const e of evenements) {
    const { resources, lieu } = sallesDe(e);
    const debut = e.start?.dateTime?.slice(0, 16)?.replace("T", " ") ?? "?";
    console.log(`- ${e.subject}`);
    console.log(`    id     : ${e.id}`);
    console.log(`    debut  : ${debut}`);
    console.log(`    lieu   : ${lieu}`);
    console.log(`    salles : ${resources.length ? resources.join(", ") : "(aucune)"}`);
  }

  const ids = (idsArg ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (ids.length === 0) {
    console.log(
      "\n[DRY-RUN] Aucune suppression. Pour supprimer, relance avec la liste des ids voulus :",
    );
    console.log(
      `  node --env-file=.env.local scripts/nettoyer-evenements-test.mjs ${boite} <id1,id2,...>`,
    );
    console.log(
      "Rappel : supprimer un evenement portant une salle ENVOIE l'annulation a la room -> libere la salle.",
    );
    return;
  }

  console.log(`\nSuppression CIBLEE de ${ids.length} evenement(s) demande(s) :`);
  for (const id of ids) {
    try {
      const etat = await supprimerEvenement(tk, boite, id);
      console.log(`  ${id} -> ${etat}`);
    } catch (e) {
      console.log(`  ${id} -> ECHEC : ${e.message}`);
    }
  }
}

main().catch((e) => {
  console.error("Erreur :", e.message);
  process.exit(1);
});
