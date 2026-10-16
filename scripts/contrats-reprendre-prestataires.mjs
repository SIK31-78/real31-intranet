// Reprise du carnet de contacts de l'ancienne application « Suivi des Contrats Copros »
// (tables Prisma "Contact" et "BuildingContact") dans le référentiel d'entreprises du cabinet
// (intranet_cles_entreprise, généralisé par Contrats & contrôles) et la liaison
// intranet_copro_prestataire. Plan : docs/plan-integration-suivi-contrats-copros.md §5.2,
// décision 4 du 16/10/2026. Ticket REA-333.
//
//   node --env-file=.env.local scripts/contrats-reprendre-prestataires.mjs            # DRY-RUN : rapport, rien d'écrit
//   node --env-file=.env.local scripts/contrats-reprendre-prestataires.mjs --commit   # écrit réellement
//
// (sans --env-file, le script lit .env.local lui-même, comme les autres scripts du dossier)
//
// Pré-requis pour --commit : supabase/sql/intranet_contrats_controles.sql passé (colonnes
// `metiers` / `courtier_partenaire` et table intranet_copro_prestataire). Le dry-run tourne
// sans et le signale.
//
// Logique, pour chaque Contact :
//   type -> métier : ELEVATOR_COMPANY ascensoriste, VMC_COMPANY societe_vmc, INSURANCE_BROKER
//   courtier, GAS_SUPPLIER fournisseur_gaz, CTQ_BODY organisme_controle, OTHER aucun métier.
//   nom_normalise = normaliserNomEntreprise(name) (copie JS fidèle de
//   src/lib/domain/cles/normaliser.ts : un .mjs n'importe pas de TS).
//   - l'entreprise existe déjà sous ce nom normalisé : on ajoute le métier (sans doublon), on
//     pose courtier_partenaire = isPartner pour un courtier, on complète email / téléphone
//     s'ils sont vides, et on ajoute un contact {nom, email, telephone, principal: false} au
//     tableau `contacts` seulement s'il apporte une coordonnée que l'entreprise n'a pas encore ;
//   - sinon on la crée (source 'intranet', cree_par 'reprise-suivi-contrats', statut 'active',
//     relances true). Le NOM est gardé tel quel : chez l'ancienne appli il sert de clé avec
//     Copropriete.broker (138 copros), le renommer casserait ce lien.
// Puis pour chaque BuildingContact : code copro = Copropriete.referenceCrypto ?? referenceEstale,
//   entreprise résolue par le Contact, métier = contactType, principal = isPrimary ; ligne
//   intranet_copro_prestataire insérée si absente. Si la copro a déjà un principal pour ce
//   métier (autre entreprise), la ligne est posée non principale et signalée.
//
// Le rapprochement est STRICT (nom normalisé égal) : « CEPA » et « CEPA ASCENSEURS » restent
// deux entreprises. Les quasi-doublons repérés sont listés en fin de rapport, à fusionner à la
// main depuis /cles/entreprises si c'est bien la même maison. Idempotent : rejouer ne crée
// rien de plus.
//
// ÉCRITURE DIRECTE, VOLONTAIREMENT HORS DES SERVICES : reprise d'un existant, sans journal ni
// notification (le journal Contrats commence à la bascule).

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const COMMIT = process.argv.includes("--commit");
const AUTEUR = "reprise-suivi-contrats";

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

// --- Normalisation : COPIE de src/lib/domain/cles/normaliser.ts (à garder identique) ------

/** « ÉCO Sécurité-Incendie  » -> « eco securite incendie ». */
function normaliserTexte(s) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
function normaliserNomEntreprise(nom) {
  return normaliserTexte(nom);
}

// --- Correspondances -----------------------------------------------------------------------

const METIER_PAR_TYPE = {
  ELEVATOR_COMPANY: "ascensoriste",
  VMC_COMPANY: "societe_vmc",
  INSURANCE_BROKER: "courtier",
  GAS_SUPPLIER: "fournisseur_gaz",
  CTQ_BODY: "organisme_controle",
  OTHER: null,
};

function vide(v) {
  return v == null || String(v).trim() === "";
}
function propre(v) {
  return vide(v) ? null : String(v).trim();
}

// --- Lecture (paginée : PostgREST plafonne à 1 000 lignes par réponse) -------------------

async function toutLire(table, colonnes, ordre) {
  const tout = [];
  for (let depuis = 0; ; depuis += 1000) {
    let q = sb.from(table).select(colonnes).range(depuis, depuis + 999);
    if (ordre) q = q.order(ordre);
    const { data, error } = await q;
    if (error) return { error };
    tout.push(...data);
    if (data.length < 1000) break;
  }
  return { data: tout };
}

function fatal(msg) {
  console.error(`ERREUR : ${msg}`);
  process.exit(1);
}

const contacts = await toutLire("Contact", "id, type, name, role, email, phone, company, notes, isPartner", "name");
if (contacts.error) fatal(`lecture Contact : ${contacts.error.message}`);
const liens = await toutLire("BuildingContact", "id, coproprieteId, contactId, contactType, isPrimary");
if (liens.error) fatal(`lecture BuildingContact : ${liens.error.message}`);
const copros = await toutLire("Copropriete", "id, referenceCrypto, referenceEstale, name, status");
if (copros.error) fatal(`lecture Copropriete : ${copros.error.message}`);

// Le référentiel, avec ou sans les deux colonnes nouvelles (SQL pas encore passé).
let sqlPasse = true;
let entreprises = await toutLire(
  "intranet_cles_entreprise",
  "id, nom, nom_normalise, email, telephone, contacts, metiers, courtier_partenaire",
  "nom_normalise",
);
if (entreprises.error && /metiers|courtier_partenaire/.test(entreprises.error.message)) {
  sqlPasse = false;
  entreprises = await toutLire("intranet_cles_entreprise", "id, nom, nom_normalise, email, telephone, contacts", "nom_normalise");
  for (const e of entreprises.data ?? []) {
    e.metiers = [];
    e.courtier_partenaire = false;
  }
}
if (entreprises.error) fatal(`lecture intranet_cles_entreprise : ${entreprises.error.message}`);

let prestatairesExistants = await toutLire("intranet_copro_prestataire", "copro_code, entreprise_id, metier, principal");
if (prestatairesExistants.error) {
  if (/PGRST205|does not exist|Could not find the table/i.test(prestatairesExistants.error.message + prestatairesExistants.error.code)) {
    sqlPasse = false;
    prestatairesExistants = { data: [] };
  } else fatal(`lecture intranet_copro_prestataire : ${prestatairesExistants.error.message}`);
}

if (!sqlPasse) {
  const msg = "SQL à passer d'abord : supabase/sql/intranet_contrats_controles.sql (colonnes metiers / courtier_partenaire, table intranet_copro_prestataire)";
  if (COMMIT) fatal(msg);
  console.log(`NB : ${msg}. Le dry-run continue comme si elles existaient.\n`);
}

// --- Index -----------------------------------------------------------------------------

const parNomNormalise = new Map(entreprises.data.map((e) => [e.nom_normalise, e]));
const coproParId = new Map(copros.data.map((c) => [c.id, c]));
const contactParId = new Map(contacts.data.map((c) => [c.id, c]));
const lienCle = (copro, entrepriseId, metier) => `${copro}|${entrepriseId}|${metier}`;
const liensPresents = new Set(prestatairesExistants.data.map((p) => lienCle(p.copro_code, p.entreprise_id, p.metier)));
const principalPresent = new Set(
  prestatairesExistants.data.filter((p) => p.principal).map((p) => `${p.copro_code}|${p.metier}`),
);

// --- Passe 1 : les entreprises -----------------------------------------------------------

const rapport = {
  creees: [],
  enrichies: [],
  inchangees: [],
  liensCrees: [],
  liensDejaPresents: 0,
  liensRetrogrades: [],
  sansCorrespondance: [],
  quasiDoublons: [],
};

/** Contact.id -> { entreprise (ligne existante ou à créer), patch éventuel }. */
const resolution = new Map();
/** Entreprises à créer, par nom normalisé (deux contacts de même nom = une seule création). */
const aCreer = new Map();

for (const c of contacts.data) {
  const metier = METIER_PAR_TYPE[c.type] ?? null;
  if (!(c.type in METIER_PAR_TYPE)) rapport.sansCorrespondance.push(`Contact ${c.name} : type inconnu ${c.type}`);
  const nomNormalise = normaliserNomEntreprise(c.name);
  if (!nomNormalise) {
    rapport.sansCorrespondance.push(`Contact ${c.id} : nom vide`);
    continue;
  }
  const email = propre(c.email);
  const telephone = propre(c.phone);
  const existante = parNomNormalise.get(nomNormalise);

  if (existante) {
    const patch = {};
    const metiers = [...(existante.metiers ?? [])];
    if (metier && !metiers.includes(metier)) {
      metiers.push(metier);
      patch.metiers = metiers;
    }
    if (metier === "courtier" && Boolean(c.isPartner) !== Boolean(existante.courtier_partenaire)) {
      patch.courtier_partenaire = Boolean(c.isPartner);
    }
    let emailEntreprise = propre(existante.email);
    let telEntreprise = propre(existante.telephone);
    if (!emailEntreprise && email) {
      patch.email = email;
      emailEntreprise = email;
    }
    if (!telEntreprise && telephone) {
      patch.telephone = telephone;
      telEntreprise = telephone;
    }
    // Un contact n'est ajouté que s'il apporte une coordonnée que l'entreprise n'a pas déjà.
    const contactsActuels = Array.isArray(existante.contacts) ? existante.contacts : [];
    const connus = new Set(
      [emailEntreprise, telEntreprise, ...contactsActuels.flatMap((k) => [k.email, k.telephone])]
        .filter(Boolean)
        .map((v) => String(v).toLowerCase()),
    );
    const apporte = [email, telephone].filter((v) => v && !connus.has(v.toLowerCase()));
    if (apporte.length) {
      patch.contacts = [...contactsActuels, { nom: propre(c.role) ?? c.name, email, telephone, principal: false }];
    }
    // La mise à jour mémoire sert au contact suivant de même nom (et à l'idempotence du rapport).
    Object.assign(existante, patch);
    if (Object.keys(patch).length) {
      rapport.enrichies.push({ nom: existante.nom, patch: Object.keys(patch).join(", ") });
      existante._patch = { ...(existante._patch ?? {}), ...patch };
    } else {
      rapport.inchangees.push(existante.nom);
    }
    resolution.set(c.id, existante);
    continue;
  }

  let nouvelle = aCreer.get(nomNormalise);
  if (!nouvelle) {
    nouvelle = {
      id: null,
      nom: c.name.trim(),
      nom_normalise: nomNormalise,
      email,
      telephone,
      contacts: [],
      note: propre(c.notes),
      statut: "active",
      relances: true,
      estale_supplier_id: null,
      source: "intranet",
      cree_par: AUTEUR,
      metiers: metier ? [metier] : [],
      courtier_partenaire: metier === "courtier" && Boolean(c.isPartner),
    };
    aCreer.set(nomNormalise, nouvelle);
    rapport.creees.push(nouvelle);
    // Quasi-doublons : un nom contenu dans un autre (« cepa » / « cepa ascenseurs »).
    for (const e of entreprises.data) {
      const a = ` ${e.nom_normalise} `;
      const b = ` ${nomNormalise} `;
      if (a !== b && (a.includes(b) || b.includes(a))) {
        rapport.quasiDoublons.push(`${c.name} (à créer) ~ ${e.nom} (existante)`);
      }
    }
  } else {
    if (metier && !nouvelle.metiers.includes(metier)) nouvelle.metiers.push(metier);
    if (!nouvelle.email && email) nouvelle.email = email;
    if (!nouvelle.telephone && telephone) nouvelle.telephone = telephone;
  }
  resolution.set(c.id, nouvelle);
}

// --- Passe 2 : les liens copro <-> entreprise -------------------------------------------

const liensAInserer = [];
const principauxPoses = new Set(principalPresent);
for (const l of liens.data) {
  const copro = coproParId.get(l.coproprieteId);
  const code = propre(copro?.referenceCrypto) ?? propre(copro?.referenceEstale);
  const contact = contactParId.get(l.contactId);
  const entreprise = resolution.get(l.contactId);
  const metier = METIER_PAR_TYPE[l.contactType] ?? METIER_PAR_TYPE[contact?.type] ?? null;
  if (!copro) {
    rapport.sansCorrespondance.push(`BuildingContact ${l.id} : copro ${l.coproprieteId} introuvable`);
    continue;
  }
  if (!code) {
    rapport.sansCorrespondance.push(`BuildingContact ${l.id} : copro « ${copro.name} » sans code (ni Crypto ni ESTALE)`);
    continue;
  }
  if (!entreprise) {
    rapport.sansCorrespondance.push(`BuildingContact ${l.id} : contact ${l.contactId} introuvable`);
    continue;
  }
  if (!metier) {
    rapport.sansCorrespondance.push(`BuildingContact ${l.id} : ${code} <-> ${entreprise.nom}, type ${l.contactType} sans métier (lien non repris)`);
    continue;
  }
  const idOuNom = entreprise.id ?? `(à créer) ${entreprise.nom_normalise}`;
  const cleLien = lienCle(code, idOuNom, metier);
  if (liensPresents.has(cleLien)) {
    rapport.liensDejaPresents++;
    continue;
  }
  liensPresents.add(cleLien);
  let principal = Boolean(l.isPrimary);
  const clePrincipal = `${code}|${metier}`;
  if (principal && principauxPoses.has(clePrincipal)) {
    principal = false;
    rapport.liensRetrogrades.push(`${code} / ${metier} : ${entreprise.nom} (un principal existe déjà)`);
  }
  if (principal) principauxPoses.add(clePrincipal);
  liensAInserer.push({ copro_code: code, entreprise, metier, principal, coproStatut: copro.status });
  rapport.liensCrees.push(`${code} ${metier} ${entreprise.nom}${principal ? " (principal)" : ""}${copro.status !== "ACTIVE" ? ` [copro ${copro.status}]` : ""}`);
}

// --- Rapport -----------------------------------------------------------------------------

console.log(`Reprise des prestataires : ${COMMIT ? "ÉCRITURE" : "DRY-RUN (rien n'est écrit)"}`);
console.log(`Source : ${contacts.data.length} Contact, ${liens.data.length} BuildingContact, ${copros.data.length} Copropriete`);
console.log(`Cible  : ${entreprises.data.length} entreprises, ${prestatairesExistants.data.length} liens déjà présents\n`);

const parMetier = {};
for (const c of contacts.data) parMetier[METIER_PAR_TYPE[c.type] ?? "(aucun)"] = (parMetier[METIER_PAR_TYPE[c.type] ?? "(aucun)"] ?? 0) + 1;
console.log("Contacts par métier :", JSON.stringify(parMetier));

console.log(`\nEntreprises à CRÉER : ${rapport.creees.length}`);
for (const e of rapport.creees) console.log(`  + ${e.nom}  [${e.metiers.join(", ") || "sans métier"}]${e.courtier_partenaire ? " partenaire" : ""}${e.telephone ? "  tél " + e.telephone : ""}${e.email ? "  " + e.email : ""}`);
console.log(`\nEntreprises existantes ENRICHIES : ${rapport.enrichies.length}`);
for (const e of rapport.enrichies) console.log(`  ~ ${e.nom}  (${e.patch})`);
console.log(`\nEntreprises existantes déjà à jour : ${rapport.inchangees.length}${rapport.inchangees.length ? "  (" + rapport.inchangees.join(", ") + ")" : ""}`);
console.log(`\nLiens copro <-> prestataire à CRÉER : ${rapport.liensCrees.length}  (déjà présents : ${rapport.liensDejaPresents})`);
for (const l of rapport.liensCrees) console.log(`  + ${l}`);
if (rapport.liensRetrogrades.length) {
  console.log(`\nLiens posés NON principaux (un principal existait déjà) : ${rapport.liensRetrogrades.length}`);
  for (const l of rapport.liensRetrogrades) console.log(`  ! ${l}`);
}
console.log(`\nSans correspondance : ${rapport.sansCorrespondance.length}`);
for (const s of rapport.sansCorrespondance) console.log(`  ? ${s}`);
if (rapport.quasiDoublons.length) {
  console.log(`\nQuasi-doublons repérés, NON fusionnés (à voir dans /cles/entreprises) : ${rapport.quasiDoublons.length}`);
  for (const q of rapport.quasiDoublons) console.log(`  ≈ ${q}`);
}

const resume = {
  creees: rapport.creees.length,
  enrichies: rapport.enrichies.length,
  liens_crees: rapport.liensCrees.length,
  liens_deja_presents: rapport.liensDejaPresents,
  sans_correspondance: rapport.sansCorrespondance.length,
};
console.log(`\nRésumé : ${JSON.stringify(resume)}`);

if (!COMMIT) {
  console.log("\nDry-run terminé. Relancer avec --commit pour écrire (après le SQL intranet_contrats_controles.sql).");
  process.exit(0);
}

// --- Écriture ----------------------------------------------------------------------------

let erreurs = 0;
for (const e of rapport.creees) {
  const { id: _ignore, ...ligne } = e;
  const { data, error } = await sb.from("intranet_cles_entreprise").insert(ligne).select("id").single();
  if (error) {
    erreurs++;
    console.error(`  ERREUR création ${e.nom} : ${error.message}`);
    continue;
  }
  e.id = data.id;
}
for (const e of entreprises.data) {
  if (!e._patch) continue;
  const { error } = await sb
    .from("intranet_cles_entreprise")
    .update({ ...e._patch, updated_at: new Date().toISOString() })
    .eq("id", e.id);
  if (error) {
    erreurs++;
    console.error(`  ERREUR enrichissement ${e.nom} : ${error.message}`);
  }
}
let liensEcrits = 0;
for (const l of liensAInserer) {
  if (!l.entreprise.id) {
    erreurs++;
    console.error(`  ERREUR lien ${l.copro_code} / ${l.metier} : entreprise ${l.entreprise.nom} non créée`);
    continue;
  }
  const { error } = await sb.from("intranet_copro_prestataire").insert({
    copro_code: l.copro_code,
    entreprise_id: l.entreprise.id,
    metier: l.metier,
    principal: l.principal,
  });
  if (error) {
    erreurs++;
    console.error(`  ERREUR lien ${l.copro_code} / ${l.metier} / ${l.entreprise.nom} : ${error.message}`);
    continue;
  }
  liensEcrits++;
}
console.log(`\nÉcrit : ${rapport.creees.filter((e) => e.id).length} entreprises créées, ${entreprises.data.filter((e) => e._patch).length} enrichies, ${liensEcrits} liens. Erreurs : ${erreurs}.`);
process.exit(erreurs ? 1 : 0);
