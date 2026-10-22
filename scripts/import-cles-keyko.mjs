// Reprise de Keyko Manager (agence d'Asnieres, ex La Villa 92) dans intranet_bien et les
// tables intranet_cles_* (REA-53, ADR-049). Keyko n'a ni export ni API : le dump est extrait
// en lecture seule depuis la session du navigateur (keyko-extraire.js, a cote du dump).
//
//   node scripts/import-cles-keyko.mjs --dump "<chemin>/keyko-asn-AAAA-MM-JJ.json"            # dry-run : rapport, rien d'ecrit
//   node scripts/import-cles-keyko.mjs --dump "<chemin>/keyko-asn-AAAA-MM-JJ.json" --ecrire   # ecrit reellement
//   ... --photos "<chemin>/photos-reduites"                 # + verse les photos dans le bucket « cles »
//   ... --ecrire --photos-seulement --photos "<chemin>"     # apres coup : rattache les photos aux trousseaux deja importes
//   ... --ecrire --forcer-dump-ancien                       # import de TEST sur un dump perime (a purger ensuite)
//   ... --ecrire --retirer-photos                           # avant une purge : retire du bucket les photos des trousseaux ASN
//
// Les photos se preparent a cote du dump : keyko-photos.mjs les telecharge (« <reference>--<id
// Keyko>.jpg »), keyko-photos-reduire.py les ramene a 1600 px (727 Mo -> 40 Mo au 23/09, dont
// 2 HEIC d'iPhone nommes .jpg). La correspondance se fait par l'id Keyko, stable meme quand
// deux trousseaux ont la meme reference.
//
// Le dump contient des donnees personnelles (proprietaires, emprunteurs) : il reste HORS du
// depot (Mythec-refactor/Gestion des cles/Keyko ASN/), comme les photos.
//
// L'IMPORT EST UNE PHOTO A DATE (Sekou 21/10/2026) : les prets ouverts sont repris tels qu'au
// jour de l'extraction. --ecrire refuse donc un dump de plus de 2 jours : on reextrait le jour
// de la mise en service, ASN a continue a saisir entre-temps.
//
// ECRITURE DIRECTE, HORS DES SERVICES, comme import-cles-powerapps.mjs : on reprend un existant
// tel qu'il etait, sans notifier. Le journal est immuable (trigger) : dry-run d'abord, puis
// --ecrire une fois. Refuse de tourner si ASN a deja des trousseaux ou des biens.
//
// Regles de reprise (decisions Sekou du 21/10/2026, ticket REA-53) :
//  - Biens : les 260. Ceux sans aucune cle sont repris INACTIFS (ASN confirmera s'ils servent).
//    Activite par l'armoire de leurs trousseaux : « Transaction » -> transaction, « Gestion 1-5 »
//    et « Location » -> location ; un bien vu dans les deux sort en location, signale au rapport.
//  - Proprietaire : celui des cles du bien (snapshot) ; le proprietaire « AUTO » de Keyko est
//    l'agence elle-meme, jamais repris.
//  - Trousseaux : numero = reference Keyko ; un numero en double prend le suffixe « -B » et la
//    note « doublon Keyko a arbitrer ». Emplacement = nom de l'armoire. Composition = les cles
//    regroupees par type, avec leur valeur unitaire (champ valeurUnitaire de la composition).
//  - Statut Keyko (disponible / indisponible / non-rendu) NON repris : l'etat se derive des
//    prets ; les ecarts sont au rapport.
//  - Prets : seuls les emprunts EN COURS au jour du dump. Societe -> pret « entreprise »
//    (rapprochee du referentiel par nom normalise, sinon creee) ; particulier -> pret
//    « coproprietaire » avec le contact en snapshot. Les emprunts clos restent dans le dump.
//  - Photos : versees en trousseaux/<id du trousseau>.jpg (meme chemin que l'ecran) ; une photo
//    qui echoue n'arrete pas l'import, elle est listee et se rattrape par --photos-seulement.

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const AGENCE = "ASN";
const CREE_PAR = "Reprise Keyko";
const ECRIRE = process.argv.includes("--ecrire");
const iDump = process.argv.indexOf("--dump");
const CHEMIN_DUMP = iDump >= 0 ? process.argv[iDump + 1] : null;
const AGE_MAX_JOURS = 2;
const iPhotos = process.argv.indexOf("--photos");
const DOSSIER_PHOTOS = iPhotos >= 0 ? process.argv[iPhotos + 1] : null;
const PHOTOS_SEULEMENT = process.argv.includes("--photos-seulement");
// Import de TEST sur un vieux dump (Sekou 21/10/2026) : la donnee sera purgee avant le vrai
// import (supabase/sql/purge_asn_keyko.sql, apres --retirer-photos).
const FORCER_DUMP_ANCIEN = process.argv.includes("--forcer-dump-ancien");
const RETIRER_PHOTOS = process.argv.includes("--retirer-photos");
/** Meme plafond que l'ecran (TAILLE_MAX_PHOTO, services/cles/referentiel.ts). */
const TAILLE_MAX_PHOTO = 8 * 1024 * 1024;

if (!CHEMIN_DUMP || !fs.existsSync(CHEMIN_DUMP)) {
  console.error('Usage : node scripts/import-cles-keyko.mjs --dump "<chemin du dump Keyko>" [--photos "<dossier>"] [--ecrire [--photos-seulement]]');
  process.exit(1);
}
if (DOSSIER_PHOTOS && !fs.existsSync(DOSSIER_PHOTOS)) {
  console.error(`Dossier de photos introuvable : ${DOSSIER_PHOTOS}`);
  process.exit(1);
}
if (PHOTOS_SEULEMENT && !DOSSIER_PHOTOS) {
  console.error("--photos-seulement demande --photos <dossier>");
  process.exit(1);
}

for (const l of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const g = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (g) process.env[g[1]] = g[2].replace(/^["']|["']$/g, "");
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !cle) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants dans .env.local");
  process.exit(1);
}
const sb = createClient(url, cle);
const dump = JSON.parse(fs.readFileSync(CHEMIN_DUMP, "utf8"));

// ---------------------------------------------------------------------------
// Outils
// ---------------------------------------------------------------------------
/** Meme regle que domain/cles/normaliser.ts (unicite des entreprises). */
const norm = (s) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/**
 * Keyko met en capitales sans toucher aux lettres accentuees : « ASNIèRES », « RéNOVATIONS ».
 * Un texte sans aucune minuscule simple est un texte en capitales : on y remonte les accents.
 * « Camilia » ou « rue Olympe De Gouges » ne sont pas touches.
 */
const casse = (s) => (/[a-z]/.test(s) || !/[à-ÿ]/.test(s) ? s : s.toUpperCase());
const propre = (s) => (typeof s === "string" && s.trim() ? casse(s.trim()) : null);
/** Une « societe » Keyko qui n'en est pas une : le proprietaire ou le locataire lui-meme. */
const PSEUDO_SOCIETES = new Set(["proprietaire", "locataire", "particulier"]);
const jour = (s) => (s ? String(s).slice(0, 10) : null);
const ageJours = Math.floor((Date.now() - new Date(dump.extrait_le).getTime()) / 86_400_000);

const rapport = { avertissements: [] };
const avertir = (m) => rapport.avertissements.push(m);

const TYPE_CLE = {
  classique: ["cle", ""],
  haute_securite: ["cle", "haute sécurité"],
  cle_gorges: ["cle", "à gorges"],
  cle_bal: ["cle", "boîte aux lettres"],
  bille: ["cle", "à billes"],
  cle_ptt: ["cle", "PTT"],
  badge: ["badge", ""],
  telecommande: ["telecommande", ""],
  autre: ["autre", ""],
};
const OUVERTURE = { appartement: "appartement", immeuble: "immeuble", boite_lettres: "boîte aux lettres", "sous-sol": "sous-sol", garage: "garage" };
const ACCES_OUVERTURE = { garage: "parking", "sous-sol": "caves" };
const TYPES_BIEN = new Set(["immeuble", "appartement", "maison", "parking", "local", "autre"]);

// ---------------------------------------------------------------------------
// 1. Lecture : trousseaux, cles, biens
// ---------------------------------------------------------------------------
const biensKeyko = new Map(dump.biens.map((b) => [b.id, b]));
const trousseauxKeyko = dump.trousseaux.map((x) => x.detail ?? x);
const idKeykoVersRef = new Map(trousseauxKeyko.map((t) => [t.id, t.reference]));

/** Par bien Keyko : armoires de ses trousseaux et proprietaires de ses cles. */
const usageBien = new Map();
for (const t of trousseauxKeyko) {
  for (const c of t.cles ?? []) {
    if (!c.bien_id) continue;
    const u = usageBien.get(c.bien_id) ?? { armoires: new Set(), proprietaires: new Map() };
    u.armoires.add(t.inventaire?.nom ?? "");
    const p = c.proprietaire;
    if (p && p.reference !== "AUTO" && (propre(p.nom) || propre(p.societe))) {
      const k = p.id;
      const e = u.proprietaires.get(k) ?? { p, n: 0 };
      e.n++;
      u.proprietaires.set(k, e);
    }
    usageBien.set(c.bien_id, u);
  }
}

// Biens
const biens = [];
const refsBien = new Map();
for (const b of dump.biens) {
  const u = usageBien.get(b.id);
  const armoires = u ? [...u.armoires] : [];
  const enTransaction = armoires.includes("Transaction");
  const ailleurs = armoires.some((a) => a !== "Transaction");
  if (enTransaction && ailleurs) avertir(`bien en transaction ET en gestion : ${b.reference} (armoires ${armoires.join(", ")}) -> location`);
  const activite = enTransaction && !ailleurs ? "transaction" : "location";
  let reference = propre(b.reference) ?? `KEYKO-${b.id}`;
  const notes = [];
  if (refsBien.has(reference.toUpperCase())) {
    reference = `${reference}-B`;
    notes.push("Doublon de référence dans Keyko, à arbitrer.");
    avertir(`référence de bien en double : ${b.reference} -> ${reference}`);
  }
  refsBien.set(reference.toUpperCase(), true);
  if (propre(b.commentaire)) notes.push(b.commentaire.trim());
  const prop = u ? [...u.proprietaires.values()].sort((x, y) => y.n - x.n)[0]?.p : null;
  if (u && u.proprietaires.size > 1) avertir(`plusieurs propriétaires sur les clés du bien ${reference} : le plus fréquent est retenu`);
  const proprietaire = prop
    ? Object.fromEntries(
        Object.entries({ nom: propre(prop.societe) ?? propre(prop.nom), prenom: propre(prop.societe) ? null : propre(prop.prenom), telephone: propre(prop.telephone) ?? propre(prop.mobile), email: propre(prop.mail) }).filter(([, v]) => v),
      )
    : null;
  const type = TYPES_BIEN.has(b.type_bien) ? b.type_bien : "autre";
  biens.push({
    keykoId: b.id,
    ligne: {
      agence_code: AGENCE,
      activite,
      reference,
      type,
      libelle: propre(b.nom) ?? "",
      numero_voie: propre(b.numero_voie),
      type_voie: propre(b.type_voie),
      nom_voie: propre(b.nom_voie),
      complement: null,
      code_postal: propre(b.code_postal),
      ville: propre(b.ville),
      digicode: propre(b.digicode),
      proprietaire_nom: proprietaire?.nom ?? null,
      proprietaire,
      note: notes.join("\n") || null,
      actif: Boolean(u),
      source: "import_keyko",
      source_ref: String(b.id),
      cree_par: CREE_PAR,
    },
  });
}

// Trousseaux
const trousseaux = [];
const numeros = new Map();
const ecartsStatut = [];
for (const t of trousseauxKeyko) {
  const cles = t.cles ?? [];
  const bienIds = [...new Set(cles.map((c) => c.bien_id).filter(Boolean))];
  if (bienIds.length !== 1) avertir(`trousseau ${t.reference} : ${bienIds.length} biens distincts (attendu 1)${bienIds.length ? ", le premier est retenu" : ", REPRIS SANS ACCÈS"}`);
  let numero = (propre(t.reference) ?? `KEYKO-${t.id}`).toUpperCase();
  const notes = [];
  if (numeros.has(numero)) {
    numero = `${numero}-B`;
    notes.push("Doublon Keyko à arbitrer.");
    avertir(`numéro de trousseau en double : ${t.reference} -> ${numero}`);
  }
  numeros.set(numero, true);

  const compo = new Map();
  for (const c of cles) {
    const [type, libType] = TYPE_CLE[c.type_cle] ?? ["autre", c.type_cle ?? ""];
    const libelle = [libType, OUVERTURE[c.type_ouverture]].filter(Boolean).join(" · ");
    // Keyko valorise cle par cle : deux cles du meme type a des prix differents restent deux lignes.
    const valeur = Number(c.valeur);
    const valeurUnitaire = Number.isFinite(valeur) && valeur > 0 ? Math.round(valeur * 100) / 100 : undefined;
    const k = `${type}|${libelle}|${valeurUnitaire ?? ""}`;
    compo.set(k, { type, libelle, quantite: (compo.get(k)?.quantite ?? 0) + 1, ...(valeurUnitaire !== undefined ? { valeurUnitaire } : {}) });
  }
  if (propre(t.commentaire)) notes.push(t.commentaire.trim());

  const typesAcces = ["total", ...new Set(cles.map((c) => ACCES_OUVERTURE[c.type_ouverture]).filter(Boolean))];
  const enCours = Boolean(t.emprunt_en_cours);
  if ((t.statut !== "disponible") !== enCours) ecartsStatut.push(`${numero} : Keyko « ${t.statut} », ${enCours ? "emprunt en cours" : "aucun emprunt en cours"}`);

  trousseaux.push({
    keykoId: t.id,
    numero,
    bienKeykoId: bienIds[0] ?? null,
    jumeauDeRef: t.trousseau_mere ? idKeykoVersRef.get(t.trousseau_mere) ?? null : null,
    photo: propre(t.img_url),
    typesAcces,
    ligne: {
      agence_code: AGENCE,
      numero,
      libelle: propre(biensKeyko.get(bienIds[0])?.nom) ?? propre(biensKeyko.get(bienIds[0])?.reference) ?? "",
      emplacement: propre(t.inventaire?.nom),
      composition: [...compo.values()],
      sensible: false,
      note: notes.join("\n") || null,
      source: "import_keyko",
      cree_par: CREE_PAR,
    },
  });
}
for (const t of trousseauxKeyko) {
  if (!t.trousseau_mere) continue;
  const ref = idKeykoVersRef.get(t.trousseau_mere);
  if (!ref || !numeros.has(ref.toUpperCase())) avertir(`trousseau ${t.reference} : trousseau mère Keyko ${t.trousseau_mere} absent du dump, lien de double non repris`);
}

// ---------------------------------------------------------------------------
// 2. Prets ouverts au jour du dump
// ---------------------------------------------------------------------------
const { data: entreprisesBase, error: eEnt } = await sb.from("intranet_cles_entreprise").select("id, nom, nom_normalise");
if (eEnt) {
  console.error("Lecture des entreprises :", eEnt.message);
  process.exit(1);
}
const entrepriseParNom = new Map((entreprisesBase ?? []).map((e) => [e.nom_normalise, e]));
const { data: users } = await sb.from("User").select("id, name, email");
const userParEmail = new Map((users ?? []).filter((u) => u.email).map((u) => [u.email.toLowerCase(), u]));
// Les agents d'ASN ont dans Keyko leur adresse La Villa 92, pas celle de l'intranet : repli sur le nom.
const userParNom = new Map((users ?? []).filter((u) => u.name).map((u) => [norm(u.name), u]));

const numeroParKeykoId = new Map(trousseaux.map((t) => [t.keykoId, t.numero]));
const compoParNumero = new Map(trousseaux.map((t) => [t.numero, t.ligne.composition]));
const entreprisesACreer = new Map();
const prets = [];
for (const e of dump.emprunts.filter((x) => !x.fini)) {
  const numero = numeroParKeykoId.get(e.trousseau_id);
  if (!numero) {
    avertir(`emprunt ${e.reference} : trousseau Keyko ${e.trousseau_id} absent du dump, non repris`);
    continue;
  }
  const emp = e.emprunteur ?? {};
  const contact = Object.fromEntries(
    Object.entries({ nom: [propre(emp.prenom), propre(emp.nom)].filter(Boolean).join(" ") || null, telephone: propre(emp.mobile) ?? propre(emp.telephone), email: propre(emp.mail) }).filter(([, v]) => v),
  );
  const societeBrute = propre(emp.societe);
  const societe = societeBrute && !PSEUDO_SOCIETES.has(norm(societeBrute)) ? societeBrute : null;
  if (societeBrute && !societe) avertir(`emprunt ${e.reference} : société « ${societeBrute} » = un particulier, prêt repris comme tel`);
  let entreprise = null;
  if (societe) {
    const k = norm(societe);
    entreprise = entrepriseParNom.get(k) ?? null;
    if (!entreprise && !entreprisesACreer.has(k)) {
      entreprisesACreer.set(k, { nom: societe, nom_normalise: k, telephone: contact.telephone ?? null, email: contact.email ?? null, adresse: null, contacts: contact.nom ? [{ ...contact, principal: true }] : [], note: "Emprunteur repris de Keyko (Asnières).", statut: "active", relances: true, source: "import_keyko", cree_par: CREE_PAR });
    }
  }
  const agentNom = [propre(e.utilisateur?.prenom), propre(e.utilisateur?.nom)].filter(Boolean).join(" ") || CREE_PAR;
  const agent =
    (e.utilisateur?.mail ? userParEmail.get(e.utilisateur.mail.toLowerCase()) : null) ??
    userParNom.get(norm(agentNom)) ??
    userParNom.get(norm([propre(e.utilisateur?.nom), propre(e.utilisateur?.prenom)].filter(Boolean).join(" "))) ??
    null;
  if (e.utilisateur && !agent) avertir(`emprunt ${e.reference} : agent Keyko ${agentNom} inconnu de l'intranet, sortie au nom seul`);
  const sortiLe = e.created_at ?? new Date(e.date_debut).toISOString();
  prets.push({
    numero,
    reference: e.reference,
    societe,
    entrepriseNorm: societe ? norm(societe) : null,
    entrepriseExistante: entreprise,
    ligne: {
      type: societe ? "entreprise" : "coproprietaire",
      contact: Object.keys(contact).length ? contact : null,
      composition: compoParNumero.get(numero) ?? [],
      motif: propre(e.commentaire),
      sorti_le: sortiLe,
      sorti_par_id: agent?.id ?? null,
      sorti_par_nom: agent?.name ?? agentNom,
      retour_prevu_le: jour(e.date_fin) ?? jour(sortiLe),
      rendu_le: null,
    },
    joursDehors: Math.floor((new Date(dump.extrait_le).getTime() - new Date(sortiLe).getTime()) / 86_400_000),
  });
}

// ---------------------------------------------------------------------------
// Rapport
// ---------------------------------------------------------------------------
// Photos : le fichier de chaque trousseau, retrouve par l'id Keyko en fin de nom.
const photoParKeykoId = new Map();
if (DOSSIER_PHOTOS) {
  for (const f of fs.readdirSync(DOSSIER_PHOTOS)) {
    const m = f.match(/--(\d+)\.(jpe?g)$/i);
    if (m) photoParKeykoId.set(Number(m[1]), path.join(DOSSIER_PHOTOS, f));
  }
}
const photosAVerser = trousseaux.filter((t) => photoParKeykoId.has(t.keykoId)).map((t) => ({ numero: t.numero, fichier: photoParKeykoId.get(t.keykoId), taille: fs.statSync(photoParKeykoId.get(t.keykoId)).size }));
const photosManquantes = trousseaux.filter((t) => t.photo && !photoParKeykoId.has(t.keykoId)).map((t) => t.numero);
const photosTropLourdes = photosAVerser.filter((p) => p.taille > TAILLE_MAX_PHOTO);

const actifs = biens.filter((b) => b.ligne.actif);
const parActivite = (act) => actifs.filter((b) => b.ligne.activite === act).length;
const nbCles = trousseauxKeyko.reduce((n, t) => n + (t.cles?.length ?? 0), 0);
const valeurTotale = trousseauxKeyko.reduce((s, t) => s + (t.cles ?? []).reduce((v, c) => v + (Number(c.valeur) || 0), 0), 0);
console.log(`\n=== Reprise Keyko Manager (${AGENCE}) → intranet_bien + intranet_cles_* (${ECRIRE ? "ÉCRITURE" : "dry-run"}) ===`);
console.log(`Dump extrait le ${dump.extrait_le} (il y a ${ageJours} j) : ${dump.biens.length} biens, ${trousseauxKeyko.length} trousseaux, ${nbCles} clés (${valeurTotale.toLocaleString("fr-FR")} € déclarés), ${dump.emprunts.length} emprunts.`);
console.log(`Biens : ${biens.length} dont ${actifs.length} actifs (location ${parActivite("location")}, transaction ${parActivite("transaction")}) et ${biens.length - actifs.length} sans clé, repris inactifs.`);
console.log(`Trousseaux : ${trousseaux.length} · accès ${trousseaux.filter((t) => t.bienKeykoId).length} · doubles liés ${trousseaux.filter((t) => t.jumeauDeRef).length} · photos référencées ${trousseaux.filter((t) => t.photo).length}`);
if (DOSSIER_PHOTOS) {
  const mo = (n) => `${(n / 1024 / 1024).toFixed(1)} Mo`;
  console.log(`Photos : ${photosAVerser.length} à verser (${mo(photosAVerser.reduce((s, p) => s + p.taille, 0))}), ${photosManquantes.length} référencées dans Keyko mais absentes du dossier${photosManquantes.length ? ` (${photosManquantes.join(", ")})` : ""}, ${photosTropLourdes.length} au-dessus de 8 Mo${photosTropLourdes.length ? ` (${photosTropLourdes.map((p) => p.numero).join(", ")} : relancer keyko-photos-reduire.py)` : ""}`);
} else {
  console.log("Photos : aucun dossier fourni (--photos), elles ne seront pas versées.");
}
const parArmoire = new Map();
for (const t of trousseaux) parArmoire.set(t.ligne.emplacement, (parArmoire.get(t.ligne.emplacement) ?? 0) + 1);
console.log(`Par armoire : ${[...parArmoire].map(([a, n]) => `${a} ${n}`).join(", ")}`);
console.log(`Prêts ouverts au jour du dump : ${prets.length} (${prets.filter((p) => p.ligne.type === "entreprise").length} entreprises, ${prets.filter((p) => p.ligne.type === "coproprietaire").length} particuliers) · entreprises rapprochées ${prets.filter((p) => p.entrepriseExistante).length}, à créer ${entreprisesACreer.size}`);
for (const p of [...prets].sort((a, b) => b.joursDehors - a.joursDehors)) {
  console.log(`  - ${p.numero} : sorti le ${jour(p.ligne.sorti_le)} (${p.joursDehors} j), ${p.ligne.type}${p.entrepriseExistante ? " (entreprise déjà connue)" : ""}, retour prévu ${p.ligne.retour_prevu_le}`);
}
console.log(`Écarts statut Keyko / état dérivé : ${ecartsStatut.length}${ecartsStatut.length ? "\n  " + ecartsStatut.join("\n  ") : ""}`);
console.log(`Avertissements : ${rapport.avertissements.length}`);
for (const a of rapport.avertissements) console.log("  - " + a);

if (!ECRIRE) {
  console.log("\nDry-run : rien n'a été écrit.");
  if (ageJours > AGE_MAX_JOURS && !FORCER_DUMP_ANCIEN) console.log(`Ce dump a ${ageJours} jours : --ecrire le refusera. Réextraire le jour de la mise en service.`);
} else {
  await ecrire();
}

// ---------------------------------------------------------------------------
// Écriture (pas de process.exit en fin de dry-run : sous Windows, il fait planter node quand
// des connexions fetch sont encore ouvertes)
// ---------------------------------------------------------------------------
/** Verse les photos dans le bucket « cles » et les rattache. Une photo en echec n'arrete rien. */
async function verserPhotos(idT) {
  if (photosTropLourdes.length) console.warn(`${photosTropLourdes.length} photo(s) au-dessus de 8 Mo ignorée(s) : ${photosTropLourdes.map((p) => p.numero).join(", ")}`);
  let n = 0;
  const echecs = [];
  for (const p of photosAVerser.filter((x) => x.taille <= TAILLE_MAX_PHOTO)) {
    const id = idT.get(p.numero);
    if (!id) {
      echecs.push(`${p.numero} : trousseau absent en base`);
      continue;
    }
    const chemin = `trousseaux/${id}.jpg`;
    const { error } = await sb.storage.from("cles").upload(chemin, fs.readFileSync(p.fichier), { contentType: "image/jpeg", upsert: true });
    if (error) {
      echecs.push(`${p.numero} : ${error.message}`);
      continue;
    }
    const { error: e2 } = await sb.from("intranet_cles_trousseau").update({ photo_chemin: chemin }).eq("id", id);
    if (e2) echecs.push(`${p.numero} : photo versée mais non rattachée (${e2.message})`);
    else n++;
  }
  console.log(`✓ ${n} photos versées`);
  for (const e of echecs) console.log(`  - ${e}`);
  if (echecs.length) console.log("  Rattrapage : relancer avec --ecrire --photos-seulement --photos <dossier>.");
}

async function ecrire() {
  if (RETIRER_PHOTOS) {
    // Le SQL de purge ne peut pas vider le Storage (les fichiers vivent hors de la base) : on les
    // retire ici, AVANT la purge, tant que les trousseaux disent encore ou sont leurs photos.
    const { data, error } = await sb.from("intranet_cles_trousseau").select("photo_chemin").eq("agence_code", AGENCE).not("photo_chemin", "is", null);
    if (error) {
      console.error(`Lecture des photos ${AGENCE} : ${error.message}`);
      process.exit(1);
    }
    const chemins = data.map((r) => r.photo_chemin);
    for (let i = 0; i < chemins.length; i += 100) {
      const { error: e } = await sb.storage.from("cles").remove(chemins.slice(i, i + 100));
      if (e) console.warn(`photos ${i}-${i + 100} : ${e.message}`);
    }
    console.log(`✓ ${chemins.length} photos ${AGENCE} retirées du bucket « cles ». Passer maintenant supabase/sql/purge_asn_keyko.sql.`);
    return;
  }
  if (PHOTOS_SEULEMENT) {
    // Apres coup : les trousseaux sont deja la, on ne fait que rattacher les photos (par numero).
    const { data: existants, error } = await sb.from("intranet_cles_trousseau").select("id, numero").eq("agence_code", AGENCE);
    if (error || !existants?.length) {
      console.error(`\nREFUS : aucun trousseau ${AGENCE} en base${error ? ` (${error.message})` : ""}. Importer d'abord.`);
      process.exit(1);
    }
    await verserPhotos(new Map(existants.map((r) => [r.numero, r.id])));
    return;
  }
  if (ageJours > AGE_MAX_JOURS && !FORCER_DUMP_ANCIEN) {
    console.error(`\nREFUS : le dump a ${ageJours} jours (maximum ${AGE_MAX_JOURS}). L'import est une photo à date : réextraire Keyko d'abord.`);
    process.exit(1);
  }
  if (FORCER_DUMP_ANCIEN) console.log(`\n⚠ Import de TEST sur un dump de ${ageJours} jours : à purger avant le vrai import (--retirer-photos, puis purge_asn_keyko.sql).`);
  const { count: dejaT } = await sb.from("intranet_cles_trousseau").select("id", { count: "exact", head: true }).eq("agence_code", AGENCE);
  const { count: dejaB } = await sb.from("intranet_bien").select("id", { count: "exact", head: true }).eq("agence_code", AGENCE);
  if ((dejaT ?? 0) > 0 || (dejaB ?? 0) > 0) {
    console.error(`\nREFUS : ${AGENCE} a déjà ${dejaT ?? 0} trousseau(x) et ${dejaB ?? 0} bien(s). Le journal est immuable : vider à la main (SQL editor) avant de rejouer.`);
    process.exit(1);
  }

  async function inserer(table, lignes, select = "id") {
    const out = [];
    for (let i = 0; i < lignes.length; i += 200) {
      const { data, error } = await sb.from(table).insert(lignes.slice(i, i + 200)).select(select);
      if (error) throw new Error(`${table} : ${error.message}`);
      out.push(...data);
    }
    return out;
  }

  // 1. Trousseaux EN PREMIER : sans intranet_cles_import_keyko.sql, la source « import_keyko »
  // viole le CHECK et le premier lot est refuse en entier, avant qu'aucun bien ne soit ecrit.
  const idsT = await inserer("intranet_cles_trousseau", trousseaux.map((t) => t.ligne), "id, numero");
  const idT = new Map(idsT.map((r) => [r.numero, r.id]));
  for (const t of trousseaux.filter((x) => x.jumeauDeRef && idT.has(x.jumeauDeRef.toUpperCase()))) {
    await sb.from("intranet_cles_trousseau").update({ jumeau_de: idT.get(t.jumeauDeRef.toUpperCase()) }).eq("id", idT.get(t.numero));
  }
  console.log(`\n✓ ${idsT.length} trousseaux`);
  if (DOSSIER_PHOTOS) await verserPhotos(idT);

  // 2. Biens
  const idsB = await inserer("intranet_bien", biens.map((b) => b.ligne), "id, source_ref");
  const idBien = new Map(idsB.map((r) => [r.source_ref, r.id]));
  console.log(`✓ ${idsB.length} biens`);

  // 3. Acces : chaque trousseau ouvre son bien
  const lignesA = trousseaux
    .filter((t) => t.bienKeykoId && idBien.has(String(t.bienKeykoId)))
    .map((t) => ({ trousseau_id: idT.get(t.numero), copropriete_id: null, bien_id: idBien.get(String(t.bienKeykoId)), immeuble: null, types: t.typesAcces, libelle: "", ordre: 0 }));
  await inserer("intranet_cles_acces", lignesA);
  console.log(`✓ ${lignesA.length} accès`);

  // 4. Entreprises nouvelles
  const idsE = entreprisesACreer.size ? await inserer("intranet_cles_entreprise", [...entreprisesACreer.values()], "id, nom_normalise") : [];
  const idEntreprise = new Map([...(entreprisesBase ?? []).map((e) => [e.nom_normalise, e.id]), ...idsE.map((e) => [e.nom_normalise, e.id])]);
  console.log(`✓ ${idsE.length} entreprises créées`);

  // 5. Prets ouverts
  const idsP = await inserer(
    "intranet_cles_pret",
    prets.map((p) => ({ ...p.ligne, trousseau_id: idT.get(p.numero), entreprise_id: p.entrepriseNorm ? idEntreprise.get(p.entrepriseNorm) : null })),
    "id, trousseau_id",
  );
  console.log(`✓ ${idsP.length} prêts ouverts`);

  // 6. Mouvements : reprise de chaque trousseau (date du dump) + la sortie de chaque pret ouvert.
  const pretParTrousseau = new Map(idsP.map((r) => [r.trousseau_id, r.id]));
  const lignesM = [
    ...trousseaux.map((t) => ({ trousseau_id: idT.get(t.numero), type: "import", horodatage: dump.extrait_le, par_user_id: null, par_nom: CREE_PAR, agence_code: AGENCE, details: { libelle: "trousseau repris", numero: t.numero, armoire: t.ligne.emplacement, keykoId: t.keykoId, photo: t.photo } })),
    ...prets.map((p) => ({
      trousseau_id: idT.get(p.numero),
      type: "sortie",
      horodatage: p.ligne.sorti_le,
      par_user_id: p.ligne.sorti_par_id,
      par_nom: p.ligne.sorti_par_nom,
      agence_code: AGENCE,
      entreprise_id: p.entrepriseNorm ? idEntreprise.get(p.entrepriseNorm) : null,
      pret_id: pretParTrousseau.get(idT.get(p.numero)),
      details: { import: "keyko", referenceKeyko: p.reference, type: p.ligne.type, entrepriseNom: p.societe ?? undefined, contactNom: p.ligne.contact?.nom, retourPrevuLeISO: p.ligne.retour_prevu_le },
    })),
  ];
  await inserer("intranet_cles_mouvement", lignesM);
  console.log(`✓ ${lignesM.length} mouvements`);

  const { count: nT } = await sb.from("intranet_cles_trousseau").select("id", { count: "exact", head: true }).eq("agence_code", AGENCE);
  const { count: nB } = await sb.from("intranet_bien").select("id", { count: "exact", head: true }).eq("agence_code", AGENCE);
  console.log(`\nContrôle en base : ${nB} biens et ${nT} trousseaux ${AGENCE} (attendu ${biens.length} et ${trousseaux.length}).`);
}
