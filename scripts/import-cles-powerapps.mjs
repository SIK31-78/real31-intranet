// Reprise de l'outil PowerApps « Gestion des Clés » (5 listes SharePoint, agence LGC) dans
// les tables intranet_cles_* (ADR-040). Deux passes en un seul run : le referentiel
// (trousseaux, acces, entreprises) puis l'historique (reservations, prets, mouvements).
//
// Source : data/imports/cles/{Keys,Buildings,AccessTypes,Companies,Reservations}.csv
//          (exports SharePoint, git-ignores : noms de collaborateurs et d'entreprises).
//
//   node scripts/import-cles-powerapps.mjs                 # dry-run (defaut) : rapport, rien d'ecrit
//   node scripts/import-cles-powerapps.mjs --ecrire        # ecrit reellement
//   node scripts/import-cles-powerapps.mjs --ecrire --photos "C:/chemin/vers/le/dossier"
//          # + televerse les photos (fichiers nommes comme la colonne Photo de Keys.csv) dans le bucket « cles »
//   node scripts/import-cles-powerapps.mjs --ecrire --photos-seulement --photos "C:/chemin"
//          # apres coup : rattache les photos aux trousseaux deja importes (par numero)
//
// Les photos vivent dans SharePoint (SiteAssets/Lists/<id de la liste Keys>) : l'app Graph
// n'a pas Sites.Read.All (403 le 18/09/2026), il faut telecharger le dossier a la main.
//
// ECRITURE DIRECTE, VOLONTAIREMENT HORS DES SERVICES : on reprend un existant tel qu'il
// etait (dates saisies, auteurs declares), sans redresser l'etat ni notifier. Chaque
// ligne du journal SharePoint devient un mouvement date d'origine ; les incoherences de
// sequence (retour sans sortie, sortie sur trousseau deja sorti) sont MARQUEES, pas
// corrigees. Le journal etant immuable (trigger), un import rate ne se rejoue pas :
// dry-run d'abord, puis --ecrire une fois. Refuse de tourner si LGC a deja des trousseaux.
//
// Regles de reprise (docs/audit-gestion-des-cles-2026-09-18.md § 11) :
//  - Buildings.Titre = code copro (referenceCrypto) ; « S105 Secours » -> S105 + acces secours.
//  - Keys.Status n'est PAS repris : l'etat se derive des prets ; le rapport signale les ecarts.
//  - Companies : seules les societes citees dans Reservations ; doublons fusionnes par nom
//    normalise ; « DIVERS » et societe vide -> « Non identifiée (historique) », bloquee ;
//    « REAL31 - Syndic » -> prets INTERNES.
//  - Reservations : par trousseau, ordre = date puis ordre du fichier. Reserve -> reservation
//    (convertie si un emprunt de la meme societe suit dans les 30 j, sinon annulee « jamais
//    retiree ») ; Emprunte -> pret ouvert (retour prevu = jour de sortie, inconnu) ; Restitue
//    -> cloture du pret ouvert. Heure = 10:00 UTC (midi Paris).

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const DOSSIER = "data/imports/cles";
const AGENCE = "LGC";
const ECRIRE = process.argv.includes("--ecrire");
const iPhotos = process.argv.indexOf("--photos");
const DOSSIER_PHOTOS = iPhotos >= 0 ? process.argv[iPhotos + 1] : null;
const AUJOURDHUI = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

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

// ---------------------------------------------------------------------------
// CSV SharePoint : 1re ligne = ListSchema=..., 2e = en-tetes, puis les lignes (RFC 4180).
// ---------------------------------------------------------------------------
function parserCsv(texte) {
  const lignes = [];
  let champ = "";
  let ligne = [];
  let dansGuillemets = false;
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (dansGuillemets) {
      if (c === '"') {
        if (texte[i + 1] === '"') { champ += '"'; i++; } else dansGuillemets = false;
      } else champ += c;
      continue;
    }
    if (c === '"') { dansGuillemets = true; continue; }
    if (c === ",") { ligne.push(champ); champ = ""; continue; }
    if (c === "\r") continue;
    if (c === "\n") { ligne.push(champ); lignes.push(ligne); ligne = []; champ = ""; continue; }
    champ += c;
  }
  if (champ !== "" || ligne.length > 0) { ligne.push(champ); lignes.push(ligne); }
  return lignes;
}

function lireListe(nom) {
  const brut = fs.readFileSync(path.join(DOSSIER, `${nom}.csv`), "utf8").replace(/^\uFEFF/, "");
  const corps = brut.slice(brut.indexOf("\n") + 1);
  const [entetes, ...lignes] = parserCsv(corps);
  return lignes.filter((l) => l.some((v) => v.trim())).map((l) => Object.fromEntries(entetes.map((h, i) => [h.trim(), (l[i] ?? "").trim()])));
}

const norm = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function numeroCanonique(s) {
  const t = s.trim().toUpperCase();
  const m = t.match(/^([A-Z]{1,2})\s*0*(\d{1,3})$/);
  return m ? `${m[1]}${m[2].padStart(3, "0")}` : t;
}
const TYPES_ACCES = {
  "total": "total", "local eau": "local_eau", "local fibre": "local_fibre", "local velo": "local_velo", "local encombrants": "local_encombrants",
  "parking": "parking", "local chaufferie": "chaufferie", "local electrique": "local_electrique", "acces toiture": "toiture", "caves": "caves", "jardin": "jardin",
};
function typesDepuis(json, titre) {
  const out = new Set();
  try { for (const v of JSON.parse(json || "[]")) { const t = TYPES_ACCES[norm(v)]; if (t) out.add(t); } } catch { /* vide */ }
  const t = norm(titre);
  if (/secours/.test(t)) out.add("secours");
  if (/\bhall\b/.test(t)) out.add("hall");
  if (/fibre/.test(t)) out.add("local_fibre");
  if (/chaufferie/.test(t)) out.add("chaufferie");
  if (/toiture/.test(t)) out.add("toiture");
  if (/cave/.test(t)) out.add("caves");
  if (/velo/.test(t)) out.add("local_velo");
  if (/tgbt|electrique/.test(t)) out.add("local_electrique");
  if (/parking|emetteur/.test(t)) out.add("parking");
  if (/jardin/.test(t)) out.add("jardin");
  if (/encombrant/.test(t)) out.add("local_encombrants");
  if (out.size === 0 && /total|general|pass|vigik/.test(t)) out.add("total");
  return [...out];
}
const dateISO = (s) => (s ? s.slice(0, 10) : null);
const plusJours = (iso, n) => { const [a, m, j] = iso.split("-").map(Number); return new Date(Date.UTC(a, m - 1, j + n)).toISOString().slice(0, 10); };

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------
const keys = lireListe("Keys");
const buildings = lireListe("Buildings");
const accessTypes = lireListe("AccessTypes");
const companies = lireListe("Companies");
const reservations = lireListe("Reservations");
const rapport = { avertissements: [], incoherences: 0 };
const avertir = (s) => rapport.avertissements.push(s);

// Copros connues (referentiel), pour signaler les refs inconnues.
const { data: coprosDb, error: eCopros } = await sb.from("Copropriete").select("referenceCrypto, status");
if (eCopros) { console.error("Lecture des copros :", eCopros.message); process.exit(1); }
const coprosConnues = new Map(coprosDb.map((c) => [c.referenceCrypto, c.status]));
const { data: users } = await sb.from("User").select("id, name");
const userParNom = new Map();
for (const u of users ?? []) {
  const n = norm(u.name || "").replace(/ /g, "");
  userParNom.set(n, u.id);
}
function userId(nom) {
  if (!nom) return null;
  const parts = nom.split(" ");
  const a = norm(nom).replace(/ /g, "");
  const b = norm([...parts.slice(1), parts[0]].join(" ")).replace(/ /g, "");
  return userParNom.get(a) ?? userParNom.get(b) ?? null;
}

// ---------------------------------------------------------------------------
// 1. Trousseaux (Keys) : dedoublonnes par numero canonique.
// ---------------------------------------------------------------------------
const trousseaux = new Map(); // numero -> { numero, emplacement, photo, acces: [] }
for (const k of keys) {
  const numero = numeroCanonique(k["Key Number"] || k.Titre || "");
  if (!numero) { avertir("Keys : ligne sans numero ignoree"); continue; }
  if (trousseaux.has(numero)) { avertir(`Keys : numero en double « ${numero} », lignes fusionnees`); continue; }
  trousseaux.set(numero, { numero, emplacement: (k.Tiroir || "").trim().toUpperCase() || null, photo: (k.Photo || "").trim() || null, statutSp: k.Status || "", acces: [] });
}

// 2. Acces (AccessTypes) : key + building -> acces ; dedoublonnes par (numero, copro, libelle).
const buildingsConnus = new Set(buildings.map((b) => b.Titre.trim()));
for (const a of accessTypes) {
  const numero = numeroCanonique(a.Key || "");
  let copro = (a.Building || "").trim().toUpperCase();
  const titre = (a.Titre || "").trim();
  if (!numero || !copro) { avertir(`AccessTypes : ligne incomplete ignoree (« ${titre} », clé « ${a.Key} », immeuble « ${a.Building} »)`); continue; }
  let types = typesDepuis(a.AccessType, titre);
  const mSecours = copro.match(/^(S\d+)\s+SECOURS$/);
  if (mSecours) { copro = mSecours[1]; if (!types.includes("secours")) types.push("secours"); }
  const t = trousseaux.get(numero);
  if (!t) { avertir(`AccessTypes : clé inconnue « ${numero} »`); continue; }
  if (!coprosConnues.has(copro)) avertir(`AccessTypes : copro « ${copro} » absente du référentiel (${numero}) — importée telle quelle`);
  else if (coprosConnues.get(copro) !== "ACTIVE") avertir(`AccessTypes : copro « ${copro} » inactive (${numero})`);
  if (!buildingsConnus.has(a.Building.trim())) avertir(`AccessTypes : immeuble « ${a.Building} » absent de Buildings (${numero})`);
  if (t.acces.some((x) => x.copro === copro && norm(x.libelle) === norm(titre))) continue;
  t.acces.push({ copro, types, libelle: titre });
}
const sansAcces = [...trousseaux.values()].filter((t) => t.acces.length === 0).map((t) => t.numero);
if (sansAcces.length) avertir(`Trousseaux sans aucun accès : ${sansAcces.join(", ")}`);

// 3. Entreprises : celles citees dans Reservations, dedoublonnees par nom normalise.
const NON_IDENTIFIEE = "Non identifiée (historique)";
const INTERNE_RE = /^real\s*31/i;
const citees = new Set(reservations.map((r) => (r["Company ID"] || "").trim()).filter(Boolean));
const entreprises = new Map(); // nomNormalise -> { nom, tel, mail, adresse, note, contacts, aliases: [] }
const aliasVersCle = new Map(); // nom brut -> nomNormalise
for (const c of companies) {
  const nom = (c["Identité"] || c.Titre || "").trim();
  if (!nom || !citees.has(nom)) continue;
  if (norm(nom) === "divers" || INTERNE_RE.test(nom)) continue;
  const k = norm(nom);
  if (!k) continue;
  const mails = (c.MailBox || "").split(/[,;\s]+/).map((m) => m.trim().toLowerCase()).filter((m) => /^[^@]+@[^@]+\.[^@]+$/.test(m));
  if (!entreprises.has(k)) {
    entreprises.set(k, {
      nom,
      tel: (c["Tél"] || "").trim() || null,
      mail: mails[0] ?? null,
      adresse: (c["Adresse 1"] || c.CP || c.Ville) ? { ligne1: (c["Adresse 1"] || "").trim() || undefined, ligne2: [c["Adresse 2"], c["Adresse 3"]].map((x) => (x || "").trim()).filter(Boolean).join(", ") || undefined, codePostal: (c.CP || "").trim() || undefined, ville: (c.Ville || "").trim() || undefined } : null,
      note: (c.Note || "").trim() || null,
      contacts: mails.slice(1).map((m) => ({ nom: m, email: m })),
    });
  } else {
    const e = entreprises.get(k);
    if (!e.tel && c["Tél"]) e.tel = c["Tél"].trim();
    if (!e.mail && mails[0]) e.mail = mails[0];
    e.note = [e.note, (c.Note || "").trim()].filter(Boolean).join(" · ") || null;
    avertir(`Companies : doublon fusionné « ${nom} » -> « ${e.nom} »`);
  }
  aliasVersCle.set(nom, k);
}
const nonReferencees = [...citees].filter((n) => !aliasVersCle.has(n) && norm(n) !== "divers" && !INTERNE_RE.test(n));
for (const n of nonReferencees) { entreprises.set(norm(n), { nom: n, tel: null, mail: null, adresse: null, note: "Citée dans les mouvements PowerApps sans fiche société", contacts: [] }); aliasVersCle.set(n, norm(n)); }

// 4. Reconstruction de l'historique.
const parCle = new Map();
reservations.forEach((r, i) => {
  const numero = numeroCanonique(r["Key ID"] || "");
  const d = dateISO(r["Reservation Date"]);
  if (!numero) { avertir(`Reservations : ligne ${i + 3} sans trousseau ignorée (${r.Status}, ${d ?? "sans date"})`); return; }
  if (!d) { avertir(`Reservations : ligne ${i + 3} sans date ignorée (${numero}, ${r.Status})`); return; }
  if (!trousseaux.has(numero)) { avertir(`Reservations : trousseau inconnu « ${numero} » (ligne ${i + 3})`); return; }
  (parCle.get(numero) ?? parCle.set(numero, []).get(numero)).push({ i, numero, d, statut: r.Status, collab: (r["Collaborator ID"] || "").trim(), societe: (r["Company ID"] || "").trim() });
});
for (const evs of parCle.values()) evs.sort((a, b) => a.d.localeCompare(b.d) || a.i - b.i);

const stats = { trousseaux: trousseaux.size, acces: [...trousseaux.values()].reduce((n, t) => n + t.acces.length, 0), entreprises: entreprises.size + 1, reservations: 0, converties: 0, annulees: 0, prets: 0, ouverts: 0, retoursSansPret: 0, sortiesSurSorti: 0, mouvements: 0, ecartsStatut: [] };

// Plan d'ecriture (calcule avant d'ecrire, pour le dry-run).
const plan = { reservations: [], prets: [], mouvements: [] };
function societeInfo(nomBrut) {
  if (!nomBrut || norm(nomBrut) === "divers") return { type: "entreprise", cle: NON_IDENTIFIEE, nom: NON_IDENTIFIEE };
  if (INTERNE_RE.test(nomBrut)) return { type: "interne", cle: null, nom: null };
  const k = aliasVersCle.get(nomBrut) ?? norm(nomBrut);
  return { type: "entreprise", cle: k, nom: entreprises.get(k)?.nom ?? nomBrut };
}
for (const [numero, evs] of parCle) {
  let ouvert = null; // pret en cours { ref }
  for (let idx = 0; idx < evs.length; idx++) {
    const e = evs[idx];
    const ts = `${e.d}T10:00:00Z`;
    const soc = societeInfo(e.societe);
    const qui = e.collab || "Inconnu (PowerApps)";
    if (e.statut === "Réservé") {
      const suivant = evs.slice(idx + 1).find((x) => x.statut === "Emprunté" && x.d <= plusJours(e.d, 30));
      const convertie = suivant && societeInfo(suivant.societe).cle === soc.cle && soc.type === "entreprise";
      const future = e.d >= AUJOURDHUI;
      const ref = { numero, entrepriseCle: soc.type === "entreprise" ? soc.cle : NON_IDENTIFIEE, debut: e.d, fin: e.d, statut: convertie ? "convertie" : future ? "prevue" : "annulee", par: qui, ts, pretRef: null, motifAnnulation: convertie || future ? null : "Reprise PowerApps : réservation jamais suivie d'un emprunt" };
      if (convertie) { suivant.reservationRef = ref; stats.converties++; } else if (!future) stats.annulees++;
      plan.reservations.push(ref);
      stats.reservations++;
      plan.mouvements.push({ numero, type: "reservation", ts, par: qui, parId: userId(e.collab), entrepriseCle: ref.entrepriseCle, reservationRef: ref, details: { import: true, entrepriseNom: soc.nom ?? NON_IDENTIFIEE, debutISO: e.d, finPrevueISO: e.d } });
      if (ref.statut === "annulee") plan.mouvements.push({ numero, type: "annulation_reservation", ts, par: "Reprise PowerApps", parId: null, entrepriseCle: ref.entrepriseCle, reservationRef: ref, details: { import: true, entrepriseNom: soc.nom ?? NON_IDENTIFIEE, motif: ref.motifAnnulation } });
    } else if (e.statut === "Emprunté") {
      if (ouvert) {
        // Sortie sur un trousseau deja sorti : le pret precedent est clos implicitement.
        ouvert.rendu = ts; ouvert.recuPar = "Inconnu (PowerApps)"; ouvert.commentaire = "Clôture implicite : une nouvelle sortie a été enregistrée sans retour (reprise PowerApps)";
        plan.mouvements.push({ numero, type: "import", ts, par: "Reprise PowerApps", parId: null, entrepriseCle: ouvert.entrepriseCle, pretRef: ouvert, details: { libelle: "Emprunté", incoherence: "sortie enregistrée alors que le trousseau était déjà sorti ; prêt précédent clos à cette date" } });
        stats.sortiesSurSorti++; rapport.incoherences++;
      }
      const ref = { numero, type: soc.type, entrepriseCle: soc.type === "entreprise" ? soc.cle : null, contact: soc.type === "interne" ? { nom: qui } : null, sorti: ts, sortiPar: qui, sortiParId: userId(e.collab), retourPrevu: e.d, rendu: null, recuPar: null, recuParId: null, commentaire: null, reservationRef: e.reservationRef ?? null };
      if (ref.reservationRef) ref.reservationRef.pretRef = ref;
      plan.prets.push(ref); stats.prets++;
      ouvert = ref;
      plan.mouvements.push({ numero, type: "sortie", ts, par: qui, parId: ref.sortiParId, entrepriseCle: ref.entrepriseCle, pretRef: ref, reservationRef: ref.reservationRef, details: { import: true, type: soc.type, entrepriseNom: soc.nom, contactNom: soc.type === "interne" ? qui : undefined, retourPrevuLeISO: e.d } });
    } else if (e.statut === "Restitué") {
      if (!ouvert) {
        plan.mouvements.push({ numero, type: "import", ts, par: qui, parId: userId(e.collab), entrepriseCle: soc.type === "entreprise" && soc.cle !== NON_IDENTIFIEE ? soc.cle : null, details: { libelle: "Restitué", incoherence: "restitution enregistrée sans sortie ouverte" } });
        stats.retoursSansPret++; rapport.incoherences++;
        continue;
      }
      ouvert.rendu = ts; ouvert.recuPar = qui; ouvert.recuParId = userId(e.collab);
      plan.mouvements.push({ numero, type: "retour", ts, par: qui, parId: ouvert.recuParId, entrepriseCle: ouvert.entrepriseCle, pretRef: ouvert, details: { import: true, entrepriseNom: ouvert.type === "interne" ? undefined : entreprises.get(ouvert.entrepriseCle)?.nom ?? NON_IDENTIFIEE, retourPrevuLeISO: ouvert.retourPrevu } });
      ouvert = null;
    } else {
      avertir(`Reservations : statut inconnu « ${e.statut} » (${numero}, ${e.d})`);
    }
  }
  if (ouvert) stats.ouverts++;
  const t = trousseaux.get(numero);
  const etatDerive = ouvert ? "Emprunté" : "Disponible";
  if (t.statutSp && t.statutSp !== "Réservé" && t.statutSp !== etatDerive) stats.ecartsStatut.push(`${numero} : SharePoint « ${t.statutSp} », dérivé « ${etatDerive} »`);
}
stats.mouvements = plan.mouvements.length + trousseaux.size;

// Photos disponibles ?
let photosTrouvees = 0;
if (DOSSIER_PHOTOS) {
  for (const t of trousseaux.values()) if (t.photo && fs.existsSync(path.join(DOSSIER_PHOTOS, t.photo))) photosTrouvees++;
}

// ---------------------------------------------------------------------------
// Rapport
// ---------------------------------------------------------------------------
console.log(`\n=== Reprise PowerApps « Gestion des Clés » → intranet_cles_* (${ECRIRE ? "ÉCRITURE" : "dry-run"}) ===`);
console.log(`Trousseaux ${stats.trousseaux} (${sansAcces.length} sans accès) · accès ${stats.acces} · entreprises ${stats.entreprises} (dont « ${NON_IDENTIFIEE} »)`);
console.log(`Réservations ${stats.reservations} (converties ${stats.converties}, annulées « jamais retirées » ${stats.annulees}) · prêts ${stats.prets} dont ${stats.ouverts} encore ouverts · mouvements ${stats.mouvements}`);
console.log(`Incohérences marquées : ${rapport.incoherences} (retours sans sortie ${stats.retoursSansPret}, sorties sur trousseau déjà sorti ${stats.sortiesSurSorti})`);
console.log(`Écarts de statut SharePoint / dérivé : ${stats.ecartsStatut.length}${stats.ecartsStatut.length ? "\n  " + stats.ecartsStatut.join("\n  ") : ""}`);
console.log(`Photos : ${[...trousseaux.values()].filter((t) => t.photo).length} référencées, ${DOSSIER_PHOTOS ? `${photosTrouvees} trouvées dans ${DOSSIER_PHOTOS}` : "aucun dossier fourni (--photos)"}`);
const groupes = new Map();
for (const a of rapport.avertissements) { const k = a.split(":")[0]; groupes.set(k, (groupes.get(k) ?? 0) + 1); }
console.log(`Avertissements : ${rapport.avertissements.length} — ${[...groupes].map(([k, n]) => `${k} ${n}`).join(", ")}`);
for (const a of rapport.avertissements.slice(0, 60)) console.log("  - " + a);
if (rapport.avertissements.length > 60) console.log(`  … ${rapport.avertissements.length - 60} de plus`);

if (!ECRIRE) { console.log("\nDry-run : rien n'a été écrit. Relancer avec --ecrire."); process.exit(0); }

// ---------------------------------------------------------------------------
// Écriture
// ---------------------------------------------------------------------------
const { count: deja } = await sb.from("intranet_cles_trousseau").select("id", { count: "exact", head: true }).eq("agence_code", AGENCE);
// --photos-seulement : les trousseaux sont deja la, on ne fait que rattacher les photos (par numero).
if (process.argv.includes("--photos-seulement")) {
  if (!DOSSIER_PHOTOS) { console.error("--photos-seulement demande --photos <dossier>"); process.exit(1); }
  const { data: existants } = await sb.from("intranet_cles_trousseau").select("id, numero").eq("agence_code", AGENCE);
  const parNumero = new Map((existants ?? []).map((r) => [r.numero, r.id]));
  const { data: buckets } = await sb.storage.listBuckets();
  if (!(buckets ?? []).some((b) => b.name === "cles")) { const { error } = await sb.storage.createBucket("cles", { public: false }); if (error) { console.error("Bucket :", error.message); process.exit(1); } }
  let n = 0;
  for (const t of trousseaux.values()) {
    const id = parNumero.get(t.numero);
    if (!id || !t.photo || !fs.existsSync(path.join(DOSSIER_PHOTOS, t.photo))) continue;
    const chemin = `trousseaux/${id}.jpg`;
    const { error } = await sb.storage.from("cles").upload(chemin, fs.readFileSync(path.join(DOSSIER_PHOTOS, t.photo)), { contentType: "image/jpeg", upsert: true });
    if (error) { console.warn(`photo ${t.numero} : ${error.message}`); continue; }
    await sb.from("intranet_cles_trousseau").update({ photo_chemin: chemin }).eq("id", id);
    n++;
  }
  console.log(`✓ ${n} photos rattachées`);
  process.exit(0);
}
if (deja && deja > 0) { console.error(`\nREFUS : ${deja} trousseau(x) existent déjà pour ${AGENCE}. Le journal est immuable : vider les tables à la main (SQL editor) avant de rejouer.`); process.exit(1); }

async function inserer(table, lignes, select = "id") {
  const out = [];
  for (let i = 0; i < lignes.length; i += 200) {
    const { data, error } = await sb.from(table).insert(lignes.slice(i, i + 200)).select(select);
    if (error) throw new Error(`${table} : ${error.message}`);
    out.push(...data);
  }
  return out;
}

const CREE_PAR = "Reprise PowerApps";
// Bucket photos
if (DOSSIER_PHOTOS && photosTrouvees > 0) {
  const { data: buckets } = await sb.storage.listBuckets();
  if (!(buckets ?? []).some((b) => b.name === "cles")) {
    const { error } = await sb.storage.createBucket("cles", { public: false });
    if (error) console.warn("Bucket « cles » non créé :", error.message);
    else console.log("Bucket Storage « cles » créé (privé).");
  }
}

// 1. Trousseaux
const listeT = [...trousseaux.values()];
const idsT = await inserer("intranet_cles_trousseau", listeT.map((t) => ({ agence_code: AGENCE, numero: t.numero, libelle: t.acces[0]?.libelle ?? "", emplacement: t.emplacement, composition: [], source: "import_powerapps", cree_par: CREE_PAR })), "id, numero");
const idT = new Map(idsT.map((r) => [r.numero, r.id]));
console.log(`\n✓ ${idsT.length} trousseaux`);

// Photos
let photosOk = 0;
if (DOSSIER_PHOTOS) {
  for (const t of listeT) {
    if (!t.photo) continue;
    const f = path.join(DOSSIER_PHOTOS, t.photo);
    if (!fs.existsSync(f)) continue;
    const chemin = `trousseaux/${idT.get(t.numero)}.jpg`;
    const { error } = await sb.storage.from("cles").upload(chemin, fs.readFileSync(f), { contentType: "image/jpeg", upsert: true });
    if (error) { console.warn(`photo ${t.numero} : ${error.message}`); continue; }
    await sb.from("intranet_cles_trousseau").update({ photo_chemin: chemin }).eq("id", idT.get(t.numero));
    photosOk++;
  }
  console.log(`✓ ${photosOk} photos téléversées`);
}

// 2. Acces
const lignesA = listeT.flatMap((t) => t.acces.map((a, i) => ({ trousseau_id: idT.get(t.numero), copropriete_id: a.copro, immeuble: null, types: a.types, libelle: a.libelle, ordre: i })));
await inserer("intranet_cles_acces", lignesA);
console.log(`✓ ${lignesA.length} accès`);

// 3. Entreprises
const lignesE = [...entreprises.entries()].map(([k, e]) => ({ nom: e.nom, nom_normalise: k, telephone: e.tel, email: e.mail, adresse: e.adresse, contacts: e.contacts, note: e.note, statut: "active", relances: true, source: "import_powerapps", cree_par: CREE_PAR }));
lignesE.push({ nom: NON_IDENTIFIEE, nom_normalise: norm(NON_IDENTIFIEE), telephone: null, email: null, adresse: null, contacts: [], note: "Mouvements PowerApps saisis sur « DIVERS » ou sans société. Ne plus utiliser : créer la vraie entreprise.", statut: "bloquee", motif_blocage: "Entreprise fictive de reprise : choisir la vraie entreprise", relances: false, source: "import_powerapps", cree_par: CREE_PAR });
const idsE = await inserer("intranet_cles_entreprise", lignesE, "id, nom_normalise");
const idE = new Map(idsE.map((r) => [r.nom_normalise, r.id]));
idE.set(NON_IDENTIFIEE, idE.get(norm(NON_IDENTIFIEE)));
const entrepriseId = (cle) => (cle ? idE.get(cle) ?? idE.get(NON_IDENTIFIEE) : null);
console.log(`✓ ${idsE.length} entreprises`);

// 4. Prets (avant les reservations, pour lier pret_id)
const lignesP = plan.prets.map((p) => ({ trousseau_id: idT.get(p.numero), type: p.type, entreprise_id: p.type === "interne" ? null : entrepriseId(p.entrepriseCle), contact: p.contact, composition: [], motif: null, sorti_le: p.sorti, sorti_par_id: p.sortiParId, sorti_par_nom: p.sortiPar, retour_prevu_le: p.retourPrevu, rendu_le: p.rendu, recu_par_id: p.recuParId, recu_par_nom: p.recuPar, retour_conforme: null, commentaire_retour: p.commentaire }));
const idsP = await inserer("intranet_cles_pret", lignesP, "id, trousseau_id, sorti_le");
plan.prets.forEach((p, i) => { p.id = idsP[i].id; });
console.log(`✓ ${idsP.length} prêts (${stats.ouverts} ouverts)`);

// 5. Reservations
const lignesR = plan.reservations.map((r) => ({ trousseau_id: idT.get(r.numero), entreprise_id: entrepriseId(r.entrepriseCle), contact: null, debut: r.debut, fin_prevue: r.fin, motif: null, origine: "interne", statut: r.statut, pret_id: r.pretRef?.id ?? null, annulee_le: r.statut === "annulee" ? r.ts : null, annulee_par: r.statut === "annulee" ? CREE_PAR : null, motif_annulation: r.motifAnnulation, cree_par: r.par, created_at: r.ts }));
const idsR = await inserer("intranet_cles_reservation", lignesR, "id");
plan.reservations.forEach((r, i) => { r.id = idsR[i].id; });
if (plan.prets.some((p) => p.reservationRef)) {
  for (const p of plan.prets.filter((p) => p.reservationRef)) await sb.from("intranet_cles_pret").update({ reservation_id: p.reservationRef.id }).eq("id", p.id);
}
console.log(`✓ ${idsR.length} réservations`);

// 6. Mouvements : creation de chaque trousseau (date d'export) + l'historique aux dates d'origine.
const lignesM = [
  ...listeT.map((t) => ({ trousseau_id: idT.get(t.numero), type: "import", horodatage: "2024-12-26T10:00:00Z", par_user_id: null, par_nom: CREE_PAR, agence_code: AGENCE, details: { libelle: "trousseau repris", numero: t.numero, tiroir: t.emplacement, statutSharePoint: t.statutSp, photo: t.photo } })),
  ...plan.mouvements.map((m) => ({ trousseau_id: idT.get(m.numero), type: m.type, horodatage: m.ts, par_user_id: m.parId ?? null, par_nom: m.par, agence_code: AGENCE, entreprise_id: m.entrepriseCle ? entrepriseId(m.entrepriseCle) : null, pret_id: m.pretRef?.id ?? null, reservation_id: m.reservationRef?.id ?? null, details: m.details })),
];
await inserer("intranet_cles_mouvement", lignesM);
console.log(`✓ ${lignesM.length} mouvements`);

// Contrôle
const { count: nT } = await sb.from("intranet_cles_trousseau").select("id", { count: "exact", head: true }).eq("agence_code", AGENCE);
const { count: nOuv } = await sb.from("intranet_cles_pret").select("id", { count: "exact", head: true }).is("rendu_le", null);
console.log(`\nContrôle en base : ${nT} trousseaux ${AGENCE}, ${nOuv} prêts ouverts (attendu ${stats.ouverts}).`);
