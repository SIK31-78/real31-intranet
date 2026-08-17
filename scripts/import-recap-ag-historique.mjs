// Reprise de l'historique des recaps d'AG saisis dans PowerApps avant l'intranet.
// Source : data/imports/historique-recap-ag.csv (git-ignore : honoraires, budgets, noms).
// Cible  : public.intranet_recap_ag + public.intranet_recap_ag_travaux.
//
// ECRITURE DIRECTE, VOLONTAIREMENT HORS DU SERVICE `creerRecapAg`.
// Le service de saisie ouvre un cycle de contrat ET cree une facture de depassement,
// que `emettreFacturesEnAttente` pousse ensuite dans Pennylane. Le passer sur 300 lignes
// d'historique produirait des centaines de factures reelles. Ici on REPREND un existant :
// on ecrit les lignes telles qu'elles etaient, sans declencher aucun effet de bord.
//
// Ne touche PAS a intranet_suivi_contrats : les colonnes de contrat du CSV (honoraires,
// forfait postaux, date de debut) ouvriraient 326 cycles retroactifs, decision separee.
//
//   node scripts/import-recap-ag-historique.mjs             # dry-run (defaut) : n'ecrit rien
//   node scripts/import-recap-ag-historique.mjs --ecrire    # ecrit reellement
//   node scripts/import-recap-ag-historique.mjs --ecrire --heures-depuis-quantity
//
// PII : aucun nom d'auteur n'est journalise (compteurs agreges seulement).

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const FICHIER = "data/imports/historique-recap-ag.csv";
const FUSEAU = "Europe/Paris";

const ECRIRE = process.argv.includes("--ecrire");
// `Quantity` du CSV = le depassement en heures (cf. rapport de dry-run : TTC / Quantity
// vaut exactement 160,45 sur les 96 lignes a depassement non nul, en 2025 comme en 2026).
// Reste desactive par defaut : c'est une deduction, pas une colonne nommee.
const HEURES_DEPUIS_QUANTITY = process.argv.includes("--heures-depuis-quantity");

// ---------------------------------------------------------------------------
// Environnement
// ---------------------------------------------------------------------------

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
// Lecture CSV
// ---------------------------------------------------------------------------

/**
 * Parseur CSV RFC 4180. Un split sur les retours a la ligne ne suffit pas ici :
 * les champs libres (info comptable, reserves) contiennent des sauts de ligne
 * a l'interieur des guillemets.
 */
function parserCsv(texte) {
  const lignes = [];
  let champ = "";
  let ligne = [];
  let dansGuillemets = false;
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (dansGuillemets) {
      if (c === '"') {
        if (texte[i + 1] === '"') {
          champ += '"';
          i++;
        } else dansGuillemets = false;
      } else champ += c;
      continue;
    }
    if (c === '"') {
      dansGuillemets = true;
      continue;
    }
    if (c === ",") {
      ligne.push(champ);
      champ = "";
      continue;
    }
    if (c === "\r") continue;
    if (c === "\n") {
      ligne.push(champ);
      lignes.push(ligne);
      ligne = [];
      champ = "";
      continue;
    }
    champ += c;
  }
  if (champ !== "" || ligne.length > 0) {
    ligne.push(champ);
    lignes.push(ligne);
  }
  return lignes;
}

// ---------------------------------------------------------------------------
// Conversions (format francais -> types Postgres)
// ---------------------------------------------------------------------------

/** "6 690" / "320,9" -> 6690 / 320.9. Espaces fines et insecables comprises. */
function nombre(brut) {
  const s = String(brut ?? "").trim();
  if (!s) return null;
  const n = Number(s.replace(/[\s  ]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * Arrondi a 2 decimales AVANT l'envoi. Les colonnes montants sont en numeric(12,2) :
 * Postgres arrondirait de lui-meme les 57 valeurs a 3 decimales du CSV (0,5 h x 160,45
 * = 80,225 -> 80,23). On le fait ici pour que le dry-run montre exactement ce qui atterrit.
 */
function montant(brut) {
  const n = nombre(brut);
  return n === null ? null : Math.round(n * 100) / 100;
}

/** Booleens PowerApps : melange "Vrai"/"False" dans le meme export. */
function booleen(brut) {
  const s = String(brut ?? "").trim().toLowerCase();
  if (s === "vrai" || s === "true" || s === "oui") return true;
  if (s === "false" || s === "faux" || s === "non") return false;
  return null;
}

const RE_DATE_FR = /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/;

/** Decalage Europe/Paris (en minutes) a un instant donne : gere le passage heure d'ete. */
function decalageParis(ts) {
  const parties = new Intl.DateTimeFormat("en-US", {
    timeZone: FUSEAU,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .formatToParts(new Date(ts))
    .filter((p) => p.type !== "literal");
  const p = Object.fromEntries(parties.map((x) => [x.type, Number(x.value)]));
  const commeUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
  return (commeUtc - ts) / 60000;
}

/**
 * "20/06/2025 18:00" (heure de Paris) -> { jour: "2025-06-20", iso: "2025-06-20T16:00:00.000Z" }.
 *
 * `jour` est decoupe dans la CHAINE, jamais via un objet Date : c'est la cle metier
 * (copropriete_id, ag_date) et une AG de 18:00 ne doit pas basculer au lendemain a
 * cause d'une conversion UTC. `iso` porte l'heure reelle, convertie depuis Paris
 * (2 passes : la premiere estimation sert a lire le decalage du bon cote d'un
 * changement d'heure, la seconde le corrige).
 */
function dateParis(brut) {
  const m = String(brut ?? "").trim().match(RE_DATE_FR);
  if (!m) return null;
  const [, j, mo, a, h = "00", mi = "00"] = m;
  const naif = Date.UTC(Number(a), Number(mo) - 1, Number(j), Number(h), Number(mi));
  let ts = naif;
  for (let i = 0; i < 2; i++) ts = naif - decalageParis(ts) * 60000;
  return { jour: `${a}-${mo}-${j}`, iso: new Date(ts).toISOString() };
}

/** Codes du CSV : "S012" tel quel, mais aussi "S0299" a rapprocher de "S299". */
function normaliserCode(code) {
  const m = String(code ?? "").trim().toUpperCase().match(/^([A-Z]+)0*(\d+)$/);
  return m ? `${m[1]}${m[2]}` : String(code ?? "").trim().toUpperCase();
}

const STATUTS = { Terminé: "termine", Erreur: "erreur", Nouveau: "nouveau" };

// ---------------------------------------------------------------------------
// Referentiel copro
// ---------------------------------------------------------------------------

const { data: copros, error: erreurCopros } = await sb
  .from("Copropriete")
  .select("referenceCrypto, nextAGDate")
  .limit(5000);
if (erreurCopros) {
  console.error("Lecture Copropriete :", erreurCopros.message);
  process.exit(1);
}
const refsExactes = new Set();
const refsNormalisees = new Map(); // code normalise -> referenceCrypto reelle
for (const c of copros) {
  const r = (c.referenceCrypto ?? "").trim();
  if (!r) continue;
  refsExactes.add(r);
  const n = normaliserCode(r);
  // Une normalisation ambigue (deux refs qui se replient sur le meme code) ne doit
  // jamais servir a resoudre : on la neutralise.
  refsNormalisees.set(n, refsNormalisees.has(n) ? null : r);
}

// ---------------------------------------------------------------------------
// Transformation
// ---------------------------------------------------------------------------

const brut = fs.readFileSync(FICHIER, "utf8").replace(/^﻿/, "");
const grille = parserCsv(brut).filter((l) => l.length > 1 || (l[0] ?? "").trim() !== "");
const entete = grille.shift();
const idx = Object.fromEntries(entete.map((c, i) => [c, i]));
const col = (l, nom) => l[idx[nom]] ?? "";

const retenues = [];
const rejets = [];
// Nombre de lignes du CSV BRUT portant des donnees de contrat (avant tout ecartement) :
// c'est le volume de cycles retroactifs qu'un import de ces colonnes ouvrirait.
let lignesAvecContratBrut = 0;

for (const l of grille) {
  const idPowerApps = col(l, "ID").trim();
  const codeBrut = col(l, "Copropriété").trim();
  const debut = dateParis(col(l, "Date/Heure début AG"));
  const fin = dateParis(col(l, "Date/Heure Fin AG"));
  const cree = dateParis(col(l, "Créé"));

  if (
    col(l, "Honoraires de gestion courante (TTC)").trim() ||
    col(l, "Forfait frais postaux").trim() ||
    col(l, "Date de début de contrat").trim()
  ) {
    lignesAvecContratBrut++;
  }

  // Ce que la ligne aura d'inhabituel une fois ecrite, sous forme [famille, detail].
  // Rattache A LA LIGNE et non a un compteur global : les anomalies d'une ligne
  // ecartee en doublon n'ont rien a faire dans un rapport qui decrit ce qui atterrit.
  const signaux = [];
  if (!cree) signaux.push(["date de creation illisible -> repli sur la date d'AG", col(l, "Créé")]);

  // --- Rejets : ce qui ne peut pas produire une ligne valide -----------------
  if (!debut || !fin) {
    rejets.push({ idPowerApps, code: codeBrut, motif: "date d'AG illisible" });
    continue;
  }
  const statut = STATUTS[col(l, "Statut de création").trim()];
  if (!statut) {
    rejets.push({ idPowerApps, code: codeBrut, motif: `statut inconnu "${col(l, "Statut de création")}"` });
    continue;
  }

  // Copro : exacte, sinon repliee sur son code sans zeros de tete, sinon rejetee.
  // Aucune insertion a l'aveugle : une copro absente du referentiel produirait une
  // ligne que l'intranet ne saurait jamais rattacher a une fiche.
  let code = refsExactes.has(codeBrut) ? codeBrut : null;
  if (!code) {
    const resolue = refsNormalisees.get(normaliserCode(codeBrut));
    if (resolue) {
      code = resolue;
      signaux.push(["code copro normalise (zeros de tete)", `${codeBrut} -> ${resolue}`]);
    }
  }
  if (!code) {
    rejets.push({ idPowerApps, code: codeBrut, motif: "copro absente du referentiel Copropriete" });
    continue;
  }

  // --- Champs ---------------------------------------------------------------
  const heuresBrutes = (new Date(fin.iso) - new Date(debut.iso)) / 3600000;
  if (heuresBrutes < 0) signaux.push(["creneau inverse (fin avant debut)", `${heuresBrutes} h`]);
  else if (heuresBrutes === 0) signaux.push(["creneau nul (fin = debut)", ""]);
  else if (heuresBrutes > 12) signaux.push(["creneau de plus de 12 h", `${heuresBrutes} h`]);

  // "Oui mais avec reserves" -> approuves (true) : l'AG a bien approuve, la nuance
  // est un commentaire, pas un refus. Elle vit dans `reserves`.
  const comptesBrut = col(l, "Comptes approuvés").trim();
  const avecReserves = /réserves/i.test(comptesBrut);
  const comptesApprouves = comptesBrut ? !/^non$/i.test(comptesBrut) : null;
  let reserves = col(l, "Réserves").trim() || null;
  if (avecReserves && !reserves) {
    // Le texte saisi est vide mais le choix « avec reserves » est une information que
    // seule cette colonne peut porter : on la materialise plutot que de la perdre.
    reserves = "Comptes approuvés avec réserves (détail non renseigné dans l'export PowerApps).";
    signaux.push(["mention de reserves posee (choix « avec reserves », texte vide)", ""]);
  }

  // "Sans objet" n'est ni oui ni non : la colonne est booleenne, on laisse NULL.
  const fondsBrut = col(l, "Fonds travaux").trim();
  const sansObjet = /sans objet/i.test(fondsBrut);
  if (sansObjet) signaux.push(['fonds travaux "Sans objet" -> NULL', ""]);
  const fondsTravaux = sansObjet ? null : booleen(fondsBrut);

  const ttcSource = nombre(col(l, "Dépassement AG TTC (€)"));
  const ttc = montant(col(l, "Dépassement AG TTC (€)"));
  if (ttcSource !== null && ttcSource !== ttc) signaux.push(["depassement TTC arrondi a 2 decimales", `${ttcSource} -> ${ttc}`]);
  if (ttcSource === null) signaux.push(["depassement TTC absent -> NULL", ""]);

  const quantity = nombre(col(l, "Quantity"));

  // --- Travaux --------------------------------------------------------------
  const travaux = [];
  const travauxBrut = col(l, "Travaux").trim();
  if (travauxBrut) {
    let postes;
    try {
      postes = JSON.parse(travauxBrut);
    } catch {
      rejets.push({ idPowerApps, code, motif: "colonne Travaux : JSON invalide" });
      continue;
    }
    if (!Array.isArray(postes)) {
      rejets.push({ idPowerApps, code, motif: "colonne Travaux : JSON qui n'est pas un tableau" });
      continue;
    }
    postes.forEach((p, i) => {
      // `libelle` est NOT NULL cote base : un poste sans libelle recoit un marqueur
      // explicite plutot que de faire echouer tout le lot.
      const libelle = String(p.LibelleTravaux ?? "").trim() || "(libellé non renseigné)";
      if (!String(p.LibelleTravaux ?? "").trim()) signaux.push(["poste de travaux sans libelle", `poste #${i + 1}`]);
      travaux.push({
        ordre: i + 1,
        libelle,
        budget: montant(p.Budget),
        cle_repartition: String(p.cleRepartitionConcerneeParTravaux ?? "").trim() || null,
        modalites_appel_fonds: String(p.modalitesAppelDeFond ?? "").trim() || null,
      });
    });
  }

  // La reponse du gestionnaire est conservee telle quelle, meme quand elle contredit
  // le detail : on reprend un historique, on ne le corrige pas.
  const travauxVotes = booleen(col(l, "Y a-t-il eu des travaux votés"));
  if (travauxVotes === true && travaux.length === 0) {
    signaux.push(['"travaux votes" = oui mais aucun poste detaille', ""]);
  }

  retenues.push({
    idPowerApps: Number(idPowerApps),
    creeIso: cree ? cree.iso : null,
    statutSource: col(l, "Statut de création").trim(),
    signaux,
    recap: {
      copropriete_id: code,
      ag_date: debut.jour,
      debut_ag: debut.iso,
      fin_ag: fin.iso,
      comptes_approuves: comptesApprouves,
      reserves,
      budget_modifie: booleen(col(l, "Le budget présenté a-t-il été modifié en AG ?")),
      montant_budget: montant(col(l, "Montant du budget N+2 (€)")),
      pourcentage_budget: montant(col(l, "Pourcentage budget (%)")),
      // `ppt_vote` n'a pas de colonne source : le CSV ne porte que le pourcentage et
      // le montant PPT. On ne le deduit pas, il reste NULL.
      ppt_vote: null,
      pourcentage_ppt: montant(col(l, "Pourcentage PPT (%)")),
      montant_ppt: montant(col(l, "Montant PPT (€)")),
      fonds_travaux: fondsTravaux,
      travaux_votes: travauxVotes,
      info_comptable: col(l, "Autres informations utiles pour le comptable copropriété").trim() || null,
      depassement_heures: HEURES_DEPUIS_QUANTITY ? quantity : null,
      depassement_ttc: ttc,
      statut,
      cree_par: col(l, "Créé par").trim() || null,
      // Toujours present, jamais `undefined` : PostgREST refuse un lot dont les objets
      // n'ont pas exactement les memes cles. Repli sur la date d'AG si `Créé` est illisible.
      created_at: cree ? cree.iso : debut.iso,
    },
    travaux,
  });
}

// ---------------------------------------------------------------------------
// Doublons sur la cle metier (copropriete_id, ag_date)
// ---------------------------------------------------------------------------
//
// La table impose `unique (copropriete_id, ag_date)` ; PowerApps ne l'imposait pas.
// Regle deterministe : on garde la ligne CREEE EN DERNIER (`Créé`) — c'est la
// re-saisie qui corrige la precedente, les montants le montrent (S277 passe de
// 401,125 a 80,225, S091 de 320,9 a 240,675). Departages successifs, tous
// deterministes : statut `termine` avant les autres, puis ID PowerApps le plus grand.

const RANG_STATUT = { termine: 0, a_facturer: 1, nouveau: 2, erreur: 3 };

const parCle = new Map();
for (const r of retenues) {
  const cle = `${r.recap.copropriete_id}|${r.recap.ag_date}`;
  if (!parCle.has(cle)) parCle.set(cle, []);
  parCle.get(cle).push(r);
}

const finales = [];
const doublons = [];
for (const [cle, lot] of parCle) {
  if (lot.length === 1) {
    finales.push(lot[0]);
    continue;
  }
  const trie = [...lot].sort((a, b) => {
    const da = a.creeIso ?? "";
    const db = b.creeIso ?? "";
    if (da !== db) return db.localeCompare(da);
    const ra = RANG_STATUT[a.recap.statut] ?? 9;
    const rb = RANG_STATUT[b.recap.statut] ?? 9;
    if (ra !== rb) return ra - rb;
    return b.idPowerApps - a.idPowerApps;
  });
  finales.push(trie[0]);
  doublons.push({ cle, garde: trie[0], ecartes: trie.slice(1) });
}

// ---------------------------------------------------------------------------
// Verification des contraintes (miroir du DDL, cf. supabase/sql/intranet_recap_ag.sql)
// ---------------------------------------------------------------------------
//
// PostgREST envoie un lot entier ou rien : une seule valeur hors bornes fait echouer
// 100 lignes avec un message qui ne dit pas laquelle. On verifie ici, avant l'envoi,
// pour que le dry-run soit un vrai feu vert et pas une esperance.

const NUMERIQUES = {
  montant_budget: [0, 1e10],
  montant_ppt: [0, 1e10],
  depassement_ttc: [0, 1e10],
  depassement_heures: [0, 9999.99],
  pourcentage_budget: [-999.99, 999.99],
  pourcentage_ppt: [-999.99, 999.99],
};

const violations = [];
for (const r of finales) {
  const v = (msg) => violations.push(`ID=${r.idPowerApps} ${r.recap.copropriete_id}@${r.recap.ag_date} : ${msg}`);
  for (const champ of ["copropriete_id", "ag_date", "debut_ag", "fin_ag", "statut", "created_at"]) {
    if (r.recap[champ] === null || r.recap[champ] === undefined) v(`${champ} est NULL (colonne NOT NULL)`);
  }
  if (!["nouveau", "a_facturer", "termine", "erreur"].includes(r.recap.statut)) v(`statut hors enumeration : ${r.recap.statut}`);
  for (const [champ, [mini, maxi]] of Object.entries(NUMERIQUES)) {
    const n = r.recap[champ];
    if (n === null || n === undefined) continue;
    if (n < mini || n > maxi) v(`${champ} = ${n} hors bornes [${mini} ; ${maxi}]`);
  }
  for (const t of r.travaux) {
    if (!t.libelle) v("un poste de travaux sans libelle (NOT NULL)");
    if (t.budget !== null && t.budget < 0) v(`budget de travaux negatif : ${t.budget}`);
  }
}

// ---------------------------------------------------------------------------
// Rapport
// ---------------------------------------------------------------------------

const compter = (liste, cle) => {
  const m = new Map();
  for (const x of liste) m.set(cle(x), (m.get(cle(x)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
};

console.log(`\n=== Reprise historique recap AG ${ECRIRE ? "(ECRITURE REELLE)" : "(DRY-RUN : aucune ecriture)"} ===\n`);
console.log(`Lignes de donnees lues     : ${grille.length}`);
console.log(`Lignes ecartees en amont   : ${rejets.length}`);
for (const [motif, n] of compter(rejets, (r) => r.motif)) console.log(`    ${motif} : ${n}`);
for (const r of rejets) console.log(`      - ID=${r.idPowerApps} copro=${r.code}`);
console.log(`Lignes transformees        : ${retenues.length}`);
console.log(`Cles (copro, date) en double : ${doublons.length} (${doublons.reduce((s, d) => s + d.ecartes.length, 0)} lignes ecartees)`);
console.log(`Recaps a ecrire            : ${finales.length}`);
console.log(`Travaux a ecrire           : ${finales.reduce((s, r) => s + r.travaux.length, 0)}`);

console.log(`\n--- Doublons : garde / ecarte (regle : Créé le plus recent) ---`);
for (const d of doublons) {
  console.log(`  ${d.cle}`);
  const ligne = (r, marque) =>
    `      ${marque} ID=${r.idPowerApps} cree=${(r.creeIso ?? "?").slice(0, 16).replace("T", " ")}Z statut=${r.statutSource} ttc=${r.recap.depassement_ttc} travaux=${r.travaux.length}`;
  console.log(ligne(d.garde, "GARDE  "));
  for (const e of d.ecartes) console.log(ligne(e, "ecarte "));
}

console.log(`\n--- Repartition ---`);
console.log("  par statut :", compter(finales, (r) => r.recap.statut).map(([s, n]) => `${s}=${n}`).join(" "));
console.log("  par annee d'AG :", compter(finales, (r) => r.recap.ag_date.slice(0, 4)).map(([a, n]) => `${a}=${n}`).join(" "));
console.log(`  coproprietes distinctes : ${new Set(finales.map((r) => r.recap.copropriete_id)).size}`);
console.log(`  auteurs distincts : ${new Set(finales.map((r) => r.recap.cree_par).filter(Boolean)).size} (noms non journalises)`);

console.log(`\n--- Points a verifier (sur les ${finales.length} lignes qui atterrissent) ---`);
// Les signaux sont regroupes par famille : on montre le volume, puis les lignes.
const familles = new Map();
for (const r of finales) {
  for (const [famille, detail] of r.signaux) {
    if (!familles.has(famille)) familles.set(famille, []);
    const ou = `ID${r.idPowerApps}/${r.recap.copropriete_id}@${r.recap.ag_date}`;
    familles.get(famille).push(detail ? `${ou} (${detail})` : ou);
  }
}
if (familles.size === 0) console.log("  (aucun)");
for (const [famille, lignes] of [...familles.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${famille} : ${lignes.length}`);
  if (lignes.length <= 12) for (const x of lignes) console.log(`      ${x}`);
}
console.log(`  depassement_heures : ${HEURES_DEPUIS_QUANTITY ? "repris de la colonne Quantity" : "NULL (aucune colonne nommee dans le CSV)"}`);
console.log(`  ppt_vote : NULL (aucune colonne source)`);
console.log(`  suivi_contrat_id / facture_id / notif_comptable_at : NULL (reprise, pas de saisie)`);
console.log(`  lignes du CSV portant des donnees de contrat, NON importees : ${lignesAvecContratBrut}/${grille.length}`);

// --- Couverture des AG deja passees ---------------------------------------
const aujourdhui = new Date().toISOString().slice(0, 10);
const agPassees = copros.filter((c) => c.nextAGDate && String(c.nextAGDate).slice(0, 10) < aujourdhui);
const clesFinales = new Set(finales.map((r) => `${r.recap.copropriete_id}|${r.recap.ag_date}`));
const coprosFinales = new Set(finales.map((r) => r.recap.copropriete_id));
let exactes = 0;
let autreDate = 0;
const sansRien = [];
for (const c of agPassees) {
  const r = (c.referenceCrypto ?? "").trim();
  const d = String(c.nextAGDate).slice(0, 10);
  if (clesFinales.has(`${r}|${d}`)) exactes++;
  else if (coprosFinales.has(r)) autreDate++;
  else sansRien.push(`${r}@${d}`);
}
console.log(`\n--- Couverture des copros dont la nextAGDate est passee (< ${aujourdhui}) ---`);
console.log(`  copros concernees : ${agPassees.length}`);
console.log(`  correspondance exacte copro + date : ${exactes}`);
console.log(`  copro couverte mais a une autre date : ${autreDate}`);
console.log(`  aucune ligne dans l'historique : ${sansRien.length} ${sansRien.join(" ")}`);

// ---------------------------------------------------------------------------
// Ecriture
// ---------------------------------------------------------------------------

console.log(`\n--- Contraintes de la table (verifiees avant envoi) ---`);
console.log(`  violations : ${violations.length}`);
for (const v of violations.slice(0, 20)) console.log(`      ${v}`);

if (!ECRIRE) {
  console.log("\nDry-run : rien n'a ete ecrit. Relancer avec --ecrire pour importer.\n");
  process.exit(0);
}

if (violations.length > 0) {
  console.error("\nEcriture annulee : des lignes violent les contraintes de la table (voir ci-dessus).\n");
  process.exit(1);
}

console.log("\nEcriture...");
const TAILLE = 100;
const idsParCle = new Map();
for (let i = 0; i < finales.length; i += TAILLE) {
  const lot = finales.slice(i, i + TAILLE);
  const { data, error } = await sb
    .from("intranet_recap_ag")
    .upsert(lot.map((r) => r.recap), { onConflict: "copropriete_id,ag_date" })
    .select("id, copropriete_id, ag_date");
  if (error) {
    console.error("Upsert recaps lot", i, ":", error.message);
    process.exit(1);
  }
  for (const d of data ?? []) idsParCle.set(`${d.copropriete_id}|${d.ag_date}`, d.id);
  console.log(`  recaps ${Math.min(i + TAILLE, finales.length)}/${finales.length}`);
}

// Les travaux n'ont pas de cle naturelle : un rejeu doit REMPLACER les postes du recap,
// pas les empiler. On purge avant de reinserer (le `on delete cascade` ne joue pas ici,
// le recap parent n'etant pas supprime).
const recapIds = [...idsParCle.values()];
for (let i = 0; i < recapIds.length; i += TAILLE) {
  const { error } = await sb
    .from("intranet_recap_ag_travaux")
    .delete()
    .in("recap_ag_id", recapIds.slice(i, i + TAILLE));
  if (error) {
    console.error("Purge travaux lot", i, ":", error.message);
    process.exit(1);
  }
}

const lignesTravaux = [];
for (const r of finales) {
  const recapId = idsParCle.get(`${r.recap.copropriete_id}|${r.recap.ag_date}`);
  if (!recapId) {
    console.error(`Aucun id renvoye pour ${r.recap.copropriete_id} ${r.recap.ag_date}`);
    process.exit(1);
  }
  for (const t of r.travaux) lignesTravaux.push({ recap_ag_id: recapId, ...t });
}
for (let i = 0; i < lignesTravaux.length; i += 500) {
  const { error } = await sb.from("intranet_recap_ag_travaux").insert(lignesTravaux.slice(i, i + 500));
  if (error) {
    console.error("Insert travaux lot", i, ":", error.message);
    process.exit(1);
  }
  console.log(`  travaux ${Math.min(i + 500, lignesTravaux.length)}/${lignesTravaux.length}`);
}

console.log(`\nImport termine : ${finales.length} recaps, ${lignesTravaux.length} travaux.\n`);
