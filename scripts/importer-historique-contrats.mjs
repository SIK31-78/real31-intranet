// Reprend la liste SharePoint MYTHEC « Historique audit de creation contrat » en SQL.
//
// Produit un fichier d'INSERT a passer a la main dans Supabase, comme les autres seeds
// reels du projet (data/seeds/, hors depot). Le script, lui, est versionne : la reprise
// doit etre rejouable et relisible.
//
// Usage :
//   node scripts/importer-historique-contrats.mjs "docs/Historique audit de création contrat.csv"
// Sortie : data/seeds/intranet_historique_contrats_seed.sql
//
// Prealable : supabase/sql/intranet_historique_contrats.sql (creation de la table).

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const SOURCE = process.argv[2] ?? "docs/Historique audit de création contrat.csv";
const SORTIE = process.argv[3] ?? "data/seeds/intranet_historique_contrats_seed.sql";

/** CSV minimal : champs entre guillemets, virgules et retours a la ligne internes admis. */
function parseCsv(texte) {
  const lignes = [];
  let champ = "";
  let ligne = [];
  let dansGuillemets = false;
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (dansGuillemets) {
      if (c === '"' && texte[i + 1] === '"') { champ += '"'; i++; }
      else if (c === '"') dansGuillemets = false;
      else champ += c;
    } else if (c === '"') dansGuillemets = true;
    else if (c === ",") { ligne.push(champ); champ = ""; }
    else if (c === "\n") { ligne.push(champ); lignes.push(ligne); ligne = []; champ = ""; }
    else if (c !== "\r") champ += c;
  }
  if (champ || ligne.length) { ligne.push(champ); lignes.push(ligne); }
  return lignes;
}

/** "1 250" / "15 266,50" -> 1250 / 15266.5. Vide ou illisible -> null. */
function montant(v) {
  const n = Number(String(v ?? "").replace(/[\s  ]/g, "").replace(",", "."));
  return Number.isFinite(n) && String(v ?? "").trim() !== "" ? n : null;
}

/** "21/05/2025" -> "2025-05-21". Vide ou illisible -> null. */
function jour(v) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(v ?? "").trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** "17/04/2025 14:36" -> "2025-04-17 14:36:00". Vide -> null. */
function horodatage(v) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/.exec(String(v ?? "").trim());
  return m ? `${m[3]}-${m[2]}-${m[1]} ${m[4]}:${m[5]}:00` : null;
}

const sql = (v) => (v === null || v === undefined || v === "" ? "null" : `'${String(v).replace(/'/g, "''")}'`);
const num = (v) => (v === null ? "null" : String(v));

const brut = readFileSync(SOURCE, "utf8").replace(/^﻿/, "");
const [entetes, ...corps] = parseCsv(brut);
const col = (nom) => {
  const i = entetes.indexOf(nom);
  if (i < 0) throw new Error(`Colonne absente du CSV : "${nom}"`);
  return i;
};

const iTitre = col("Titre");
const iDateAg = col("Date AG");
const iHono = col("Honoraires de gestion courante");
const iTimbres = col("Forfait de frais postaux");
const iAdresse = col("Adresse copropriété");
const iStatut = col("Statut");
const iChemin = col("Chemin du contrat");
const iCree = col("Créé");
const iCopro = col("Copropriété");
const iPar = col("Créé par");
const iErreur = col("Message d'erreur");

const vus = new Set();
const valeurs = [];
let ignorees = 0;

for (const l of corps) {
  if (l.length <= iCopro || !l[iCopro]?.trim()) { ignorees++; continue; }
  const titre = l[iTitre]?.trim() || null;
  const cree = horodatage(l[iCree]);
  if (!cree) { ignorees++; continue; } // cree_le est NOT NULL

  // L'unicite porte sur (copropriete, horodatage) et PAS sur le titre : le legacy compose
  // le titre du code copro et du JOUR, donc deux generations du meme jour le partagent -
  // or ce sont de vraies lignes (un echec, puis la reprise qui reussit).
  const cle = `${l[iCopro].trim()}|${cree}`;
  if (vus.has(cle)) { ignorees++; continue; }
  vus.add(cle);

  // Le legacy ecrit « Terminé » / « Erreur » ; la table normalise sans accent.
  const statut = l[iStatut]?.trim().toLowerCase().startsWith("err") ? "erreur" : "termine";

  valeurs.push(
    `  (${sql(l[iCopro].trim())}, ${sql(titre)}, ${sql(jour(l[iDateAg]))}, ` +
      `${num(montant(l[iHono]))}, ${num(montant(l[iTimbres]))}, ${sql(l[iAdresse]?.trim())}, ` +
      `${sql(statut)}, ${sql(l[iChemin]?.trim())}, ${sql(l[iErreur]?.trim())}, ` +
      `${sql(cree)}, ${sql(l[iPar]?.trim())})`,
  );
}

const contenu = `-- Reprise de l'historique des contrats de syndic (liste SharePoint MYTHEC).
-- GENERE par scripts/importer-historique-contrats.mjs, ne pas editer a la main.
-- Prealable : supabase/sql/intranet_historique_contrats.sql
--
-- ${valeurs.length} generations reprises, ${ignorees} lignes ignorees (sans copropriete,
-- sans horodatage, ou meme copropriete a la meme minute).
-- Idempotent : on ne reinsere pas une ligne deja presente.

insert into public.intranet_historique_contrats
  (copropriete_id, titre, date_ag, honoraires_gestion_ttc, forfait_postaux_ttc, adresse,
   statut, chemin_document, message_erreur, cree_le, cree_par)
values
${valeurs.join(",\n")}
on conflict do nothing;
`;

mkdirSync(dirname(SORTIE), { recursive: true });
writeFileSync(SORTIE, contenu, "utf8");
console.log(`${valeurs.length} generations -> ${SORTIE} (${ignorees} lignes ignorees)`);
