// Audit LECTURE SEULE des données de l'ancienne application « Suivi des Contrats Copros »
// avant le module Contrats & contrôles (REA-333, plan §4 « dates d'amorçage aberrantes » et
// étape 5 : nettoyage AVANT tout rappel automatique). Rien n'est écrit, jamais.
//
//   node --env-file=.env.local scripts/contrats-audit-echeances.mjs
//   node --env-file=.env.local scripts/contrats-audit-echeances.mjs --csv data/audit-echeances.csv
//
// Ce qu'il liste, par sujet et par copro (code, nom, gestionnaire) :
//   1. les cycles EN COURS (status IN_PROGRESS) dont l'échéance est absente, antérieure à
//      aujourd'hui moins 2 ans, ou postérieure à aujourd'hui plus 15 ans ;
//   2. les copros qui déclarent des ascenseurs (elevatorsCount > 0) sans aucune ligne Elevator ;
//   3. les appareils (Elevator) sans identifiant ou sans date de dernier CTQ.
//
// Tables lues : Copropriete, User, Elevator, InsuranceTracking, GasContractTracking,
// GasVmcCtq, ElevatorCtq (noms Prisma, gardés tels quels, décision 5).
// Les copros INACTIVE sont listées aussi (colonne « statut copro »), comptées à part.

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const iCsv = process.argv.indexOf("--csv");
const FICHIER_CSV = iCsv >= 0 ? process.argv[iCsv + 1] : null;
if (iCsv >= 0 && !FICHIER_CSV) {
  console.error("--csv attend un chemin de fichier");
  process.exit(1);
}

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  if (fs.existsSync(".env.local")) {
    for (const l of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      const g = l.match(/^([A-Z0-9_]+)=(.*)$/);
      if (g && !process.env[g[1]]) process.env[g[1]] = g[2].replace(/^["']|["']$/g, "");
    }
  }
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !cle) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants (.env.local)");
  process.exit(1);
}
const sb = createClient(url, cle);

// Jour civil de Paris, comme le reste de l'intranet.
const AUJOURDHUI = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const decaler = (iso, annees) => `${Number(iso.slice(0, 4)) + annees}${iso.slice(4)}`;
const PLANCHER = decaler(AUJOURDHUI, -2);
const PLAFOND = decaler(AUJOURDHUI, 15);

async function toutLire(table, colonnes) {
  const tout = [];
  for (let depuis = 0; ; depuis += 1000) {
    const { data, error } = await sb.from(table).select(colonnes).range(depuis, depuis + 999);
    if (error) {
      console.error(`ERREUR lecture ${table} : ${error.message}`);
      process.exit(1);
    }
    tout.push(...data);
    if (data.length < 1000) break;
  }
  return tout;
}

const [copros, users, ascenseurs, assurance, gaz, vmc, ctqAsc] = await Promise.all([
  toutLire("Copropriete", "id, referenceCrypto, referenceEstale, name, status, elevatorsCount, managerId"),
  toutLire("User", "id, name"),
  toutLire("Elevator", "id, coproprieteId, identifier, lastCtqDate"),
  toutLire("InsuranceTracking", "id, coproprieteId, nextDueDate, status"),
  toutLire("GasContractTracking", "id, coproprieteId, nextDueDate, status"),
  toutLire("GasVmcCtq", "id, coproprieteId, nextDueDate, status"),
  toutLire("ElevatorCtq", "id, elevatorId, nextDueDate, status"),
]);

const coproParId = new Map(copros.map((c) => [c.id, c]));
const nomUser = new Map(users.map((u) => [u.id, u.name]));
const ascenseurParId = new Map(ascenseurs.map((a) => [a.id, a]));

function ficheCopro(id) {
  const c = coproParId.get(id);
  if (!c) return { code: "?", nom: `copro ${id} introuvable`, gestionnaire: "", statut: "?" };
  return {
    code: c.referenceCrypto ?? c.referenceEstale ?? "(sans code)",
    nom: c.name,
    gestionnaire: nomUser.get(c.managerId) ?? "(sans gestionnaire)",
    statut: c.status,
  };
}

const jour = (d) => (d ? String(d).slice(0, 10) : null);

/** Qualifie une échéance : null si correcte, sinon le motif. */
function anomalieEcheance(d) {
  const j = jour(d);
  if (!j) return "absente";
  if (j < PLANCHER) return `trop ancienne (${j})`;
  if (j > PLAFOND) return `trop lointaine (${j})`;
  return null;
}

// --- 1. Cycles en cours à échéance douteuse ----------------------------------------------

const lignes = []; // {rubrique, sujet, code, nom, gestionnaire, statut, detail, id}

function auditerCycles(sujet, cycles, coproDuCycle, detailSup = () => "") {
  for (const c of cycles) {
    if (c.status !== "IN_PROGRESS") continue;
    const motif = anomalieEcheance(c.nextDueDate);
    if (!motif) continue;
    const f = ficheCopro(coproDuCycle(c));
    lignes.push({ rubrique: "echeance", sujet, ...f, detail: `échéance ${motif}${detailSup(c)}`, id: c.id });
  }
}
auditerCycles("assurance", assurance, (c) => c.coproprieteId);
auditerCycles("gaz", gaz, (c) => c.coproprieteId);
auditerCycles("ctq_vmc", vmc, (c) => c.coproprieteId);
auditerCycles(
  "ctq_ascenseur",
  ctqAsc,
  (c) => ascenseurParId.get(c.elevatorId)?.coproprieteId,
  (c) => {
    const a = ascenseurParId.get(c.elevatorId);
    return a ? ` ; appareil ${a.identifier ?? "(sans identifiant)"}` : ` ; appareil ${c.elevatorId} introuvable`;
  },
);

// --- 2. Copros déclarant des ascenseurs sans appareil -----------------------------------

const coprosAvecAppareil = new Set(ascenseurs.map((a) => a.coproprieteId));
for (const c of copros) {
  if ((c.elevatorsCount ?? 0) > 0 && !coprosAvecAppareil.has(c.id)) {
    lignes.push({ rubrique: "sans_appareil", sujet: "ctq_ascenseur", ...ficheCopro(c.id), detail: `${c.elevatorsCount} ascenseur(s) déclaré(s), aucun appareil créé`, id: c.id });
  }
}

// --- 3. Appareils incomplets -------------------------------------------------------------

for (const a of ascenseurs) {
  const manques = [];
  if (!a.identifier || !String(a.identifier).trim()) manques.push("sans identifiant");
  if (!a.lastCtqDate) manques.push("sans date de dernier CTQ");
  if (!manques.length) continue;
  lignes.push({ rubrique: "appareil", sujet: "ctq_ascenseur", ...ficheCopro(a.coproprieteId), detail: `appareil ${a.identifier ?? "?"} ${manques.join(" et ")}`, id: a.id });
}

// --- Sortie ------------------------------------------------------------------------------

const ordreRubrique = { echeance: 0, sans_appareil: 1, appareil: 2 };
const ordreSujet = { assurance: 0, gaz: 1, ctq_ascenseur: 2, ctq_vmc: 3 };
lignes.sort(
  (a, b) =>
    ordreRubrique[a.rubrique] - ordreRubrique[b.rubrique] ||
    ordreSujet[a.sujet] - ordreSujet[b.sujet] ||
    a.code.localeCompare(b.code) ||
    a.detail.localeCompare(b.detail),
);

const LIBELLE_RUBRIQUE = {
  echeance: "Cycles en cours à échéance absente, trop ancienne ou trop lointaine",
  sans_appareil: "Copros déclarant des ascenseurs sans aucun appareil",
  appareil: "Appareils sans identifiant ou sans date de dernier CTQ",
};
const LIBELLE_SUJET = { assurance: "Assurance", gaz: "Contrat gaz", ctq_ascenseur: "CTQ ascenseur", ctq_vmc: "CTQ VMC gaz" };

function tableau(rows) {
  const cols = [
    ["Sujet", (r) => LIBELLE_SUJET[r.sujet]],
    ["Code", (r) => r.code],
    ["Copropriété", (r) => r.nom.length > 32 ? r.nom.slice(0, 31) + "…" : r.nom],
    ["Gestionnaire", (r) => r.gestionnaire],
    ["Statut copro", (r) => r.statut],
    ["Détail", (r) => r.detail],
  ];
  const cellules = rows.map((r) => cols.map(([, f]) => String(f(r) ?? "")));
  const largeurs = cols.map(([t], i) => Math.max(t.length, ...cellules.map((c) => c[i].length)));
  const ligne = (c) => c.map((v, i) => v.padEnd(largeurs[i])).join("  ");
  console.log(ligne(cols.map(([t]) => t)));
  console.log(largeurs.map((l) => "-".repeat(l)).join("  "));
  for (const c of cellules) console.log(ligne(c));
}

console.log(`Audit des échéances de contrats, au ${AUJOURDHUI} (Paris). Fenêtre admise : ${PLANCHER} à ${PLAFOND}.`);
console.log(`Lu : ${copros.length} copros, ${ascenseurs.length} appareils, cycles en cours : assurance ${assurance.filter((c) => c.status === "IN_PROGRESS").length}, gaz ${gaz.filter((c) => c.status === "IN_PROGRESS").length}, CTQ ascenseur ${ctqAsc.filter((c) => c.status === "IN_PROGRESS").length}, CTQ VMC ${vmc.filter((c) => c.status === "IN_PROGRESS").length}.\n`);

for (const rubrique of Object.keys(LIBELLE_RUBRIQUE)) {
  const rows = lignes.filter((l) => l.rubrique === rubrique);
  console.log(`== ${LIBELLE_RUBRIQUE[rubrique]} : ${rows.length}`);
  if (rows.length) tableau(rows);
  console.log("");
}

// Résumé chiffré (copros ACTIVE seulement, puis le total).
const resume = {};
for (const l of lignes) {
  const k = `${l.rubrique}/${l.sujet}`;
  resume[k] ??= { total: 0, actives: 0 };
  resume[k].total++;
  if (l.statut === "ACTIVE") resume[k].actives++;
}
const motifs = { absente: 0, ancienne: 0, lointaine: 0 };
for (const l of lignes) {
  if (l.rubrique !== "echeance") continue;
  if (l.detail.includes("absente")) motifs.absente++;
  else if (l.detail.includes("ancienne")) motifs.ancienne++;
  else motifs.lointaine++;
}
console.log("== Résumé (copros ACTIVE / total)");
for (const [k, v] of Object.entries(resume)) console.log(`  ${k.padEnd(28)} ${String(v.actives).padStart(3)} / ${v.total}`);
console.log(`  échéances : ${motifs.absente} absentes, ${motifs.ancienne} trop anciennes, ${motifs.lointaine} trop lointaines`);
console.log(`  copros concernées : ${new Set(lignes.map((l) => l.code)).size}, gestionnaires : ${new Set(lignes.map((l) => l.gestionnaire)).size}`);

if (FICHIER_CSV) {
  const sep = ";";
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const entete = ["rubrique", "sujet", "code", "copropriete", "gestionnaire", "statut_copro", "detail", "id"];
  const corps = lignes.map((l) => [l.rubrique, l.sujet, l.code, l.nom, l.gestionnaire, l.statut, l.detail, l.id].map(esc).join(sep));
  // BOM pour qu'Excel (FR) ouvre le fichier en UTF-8 avec le point-virgule.
  fs.writeFileSync(FICHIER_CSV, "﻿" + [entete.join(sep), ...corps].join("\r\n") + "\r\n", "utf8");
  console.log(`\nCSV écrit : ${FICHIER_CSV} (${lignes.length} lignes)`);
}
