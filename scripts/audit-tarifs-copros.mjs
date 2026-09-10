// Audit LECTURE SEULE : quelles copros leveront une erreur "Tarif absent du
// bareme" a la facturation ? Aucune ecriture. N'affiche PAS les montants.
//
// Logique reprise de src/lib/services/facturation/bareme.ts :
//   annee de bareme d'une copro = annee du debut_contrat EN VIGUEUR
//   (debut_contrat <= aujourd'hui, le plus recent).
//   exigerTarifTtc leve si (identifiant, annee) absent de intranet_tarifs.
//
// Lancer : node --env-file=.env.local scripts/audit-tarifs-copros.mjs
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { db: { schema: "public" }, auth: { persistSession: false } },
);

const AUJOURDHUI = new Date().toISOString().slice(0, 10);

// Identifiants de tarif exiges par les prestations qui lisent le bareme.
// (suivi_travaux ne lit PAS le bareme -> exclu.)
const IDENTIFIANTS_REQUIS = [
  "TauxHoraire", // depassement CS + depassement AG
  "PreEtatDate", // pre-etat date
  "EtatDate", // etat date
  "DossierAssureur", // sinistre
  "DepLieu", // sinistre
  "MesConser", // sinistre
  "AssExp", // sinistre
];

// --- 1. Grille tarifaire reelle : couples (identifiant, annee) presents. ---
async function chargerGrille() {
  const { data, error } = await sb
    .from("intranet_tarifs")
    .select("*")
    .limit(10000);
  if (error) throw new Error(`Lecture intranet_tarifs : ${error.message}`);
  const colonnes = data.length ? Object.keys(data[0]) : [];
  const aColonneAgence = colonnes.some((c) => /agence|agency/i.test(c));
  const set = new Set(); // "annee|identifiant"
  const anneesPresentes = new Set();
  for (const r of data) {
    set.add(`${r.annee}|${r.identifiant_prestation}`);
    anneesPresentes.add(r.annee);
  }
  return { set, anneesPresentes, colonnes, aColonneAgence, nb: data.length };
}

// --- 2. Contrats reels : annee en vigueur par copro. ---
async function chargerContratsEnVigueur() {
  const { data, error } = await sb
    .from("intranet_suivi_contrats")
    .select("copropriete_id, debut_contrat, honoraires_gestion_ttc")
    .limit(10000);
  if (error) throw new Error(`Lecture intranet_suivi_contrats : ${error.message}`);

  const enVigueur = new Map(); // code -> { debut, montantNull }
  let totalLignes = 0;
  let sansHonoraires = 0;
  for (const r of data) {
    totalLignes++;
    if (r.honoraires_gestion_ttc === null) sansHonoraires++;
    if (r.debut_contrat > AUJOURDHUI) continue; // pas encore actif
    const prec = enVigueur.get(r.copropriete_id);
    if (!prec || r.debut_contrat > prec.debut) {
      enVigueur.set(r.copropriete_id, {
        debut: r.debut_contrat,
        montantNull: r.honoraires_gestion_ttc === null,
      });
    }
  }
  return { enVigueur, totalLignes, sansHonoraires, copros: new Set(data.map((r) => r.copropriete_id)).size };
}

// --- 3. Copros actives + agence + syndicContractEndDate. ---
async function chargerCopros() {
  const { data, error } = await sb
    .from("Copropriete")
    .select('referenceCrypto, referenceEstale, status, syndicContractEndDate, "agencyId", Agency:agencyId (name)')
    .eq("status", "ACTIVE")
    .limit(10000);
  if (error) throw new Error(`Lecture Copropriete : ${error.message}`);
  const parCode = new Map();
  for (const c of data) {
    const code = c.referenceCrypto ?? c.referenceEstale;
    if (!code) continue;
    parCode.set(code, {
      agence: c.Agency?.name ?? "(sans agence)",
      finContrat: c.syndicContractEndDate ? String(c.syndicContractEndDate).slice(0, 10) : null,
    });
  }
  return parCode;
}

async function main() {
  const grille = await chargerGrille();
  const { enVigueur, totalLignes, sansHonoraires, copros } = await chargerContratsEnVigueur();
  const coprosActives = await chargerCopros();

  console.log("=== GRILLE intranet_tarifs ===");
  console.log(`  colonnes : ${grille.colonnes.join(", ")}`);
  console.log(`  colonne agence ? ${grille.aColonneAgence ? "OUI" : "NON (grille globale)"}`);
  console.log(`  lignes : ${grille.nb} ; annees presentes : ${[...grille.anneesPresentes].sort().join(", ")}`);
  console.log("  couverture par annee :");
  for (const annee of [...grille.anneesPresentes].sort()) {
    const presents = IDENTIFIANTS_REQUIS.filter((id) => grille.set.has(`${annee}|${id}`));
    const manquants = IDENTIFIANTS_REQUIS.filter((id) => !grille.set.has(`${annee}|${id}`));
    console.log(`    ${annee} : requis presents ${presents.length}/${IDENTIFIANTS_REQUIS.length}${manquants.length ? " | MANQUE " + manquants.join(", ") : " (complet)"}`);
  }

  console.log("\n=== CONTRATS intranet_suivi_contrats ===");
  console.log(`  lignes totales : ${totalLignes} ; copros distinctes : ${copros}`);
  console.log(`  lignes SANS honoraires (montant NULL = reconstitution stopgap) : ${sansHonoraires}`);
  console.log(`  copros actives (status ACTIVE) : ${coprosActives.size}`);

  // Distribution des annees de bareme (parmi copros actives avec contrat).
  const distAnnees = new Map();

  const problemes = [];
  for (const [code, meta] of coprosActives) {
    const contrat = enVigueur.get(code);
    if (!contrat) continue; // pas de contrat en vigueur -> autre probleme (bareme introuvable), hors scope tarif
    const annee = Number(contrat.debut.slice(0, 4));
    distAnnees.set(annee, (distAnnees.get(annee) ?? 0) + 1);

    const manquants = IDENTIFIANTS_REQUIS.filter((id) => !grille.set.has(`${annee}|${id}`));
    if (manquants.length > 0) {
      const perime = meta.finContrat ? meta.finContrat < AUJOURDHUI : null;
      problemes.push({
        code,
        agence: meta.agence,
        annee,
        debut: contrat.debut,
        manquants,
        montantNull: contrat.montantNull,
        finContrat: meta.finContrat,
        perime,
      });
    }
  }

  console.log("\n  distribution annee de bareme (copros actives avec contrat) :");
  for (const a of [...distAnnees.keys()].sort()) console.log(`    ${a} : ${distAnnees.get(a)} copro(s)`);

  // Copros actives SANS contrat en vigueur (autre erreur : bareme introuvable).
  const sansContrat = [...coprosActives.keys()].filter((code) => !enVigueur.get(code));

  console.log("\n=== COPROS A PROBLEME (tarif manquant a la facturation) ===");
  console.log(`  total : ${problemes.length}`);
  problemes.sort((a, b) => a.annee - b.annee || a.code.localeCompare(b.code, "fr", { numeric: true }));
  console.log("  code | agence | annee bareme | debut contrat | perime | montantNull | identifiants manquants");
  for (const p of problemes) {
    console.log(
      `  ${p.code} | ${p.agence} | ${p.annee} | ${p.debut} | ${p.perime === null ? "?" : p.perime ? "OUI" : "non"} | ${p.montantNull ? "OUI" : "non"} | ${p.manquants.join(",")}`,
    );
  }

  console.log(`\n=== BONUS : copros actives SANS contrat en vigueur (erreur 'bareme introuvable', hors tarif) : ${sansContrat.length} ===`);
  if (sansContrat.length && sansContrat.length <= 40) console.log("  " + sansContrat.sort().join(", "));
}

main().catch((e) => {
  console.error("ECHEC :", e.message);
  process.exit(1);
});
