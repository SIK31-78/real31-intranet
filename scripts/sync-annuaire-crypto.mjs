// Synchro nocturne de l'annuaire des expediteurs depuis l'export Crypto (REA-291).
//
// Tourne sur le PC de Sekou (allume 24 h/24), qui synchronise par OneDrive le dossier
// « Export Crypto » du patron. Tache planifiee Windows a 4 h, avec rattrapage au reveil
// (scripts/sync-annuaire-crypto.cmd). A la main : double-clic sur le .cmd.
//
//   node scripts/sync-annuaire-crypto.mjs            synchronise
//   node scripts/sync-annuaire-crypto.mjs --essai    construit et compte, n'ecrit rien
//   node scripts/sync-annuaire-crypto.mjs --forcer   resynchronise meme si l'export n'a pas change
//
// Dossier de l'export : CRYPTO_EXPORT_DIR, sinon le chemin OneDrive par defaut ci-dessous.
// Lit la cle service_role depuis .env.local. Ne lit QUE 7 petits fichiers de l'export : jamais la
// comptabilite (9 Go) ni _Users.txt (comptes Crypto).
//
// Chaque passage, reussi ou non, est note dans intranet_synchro : la tache planifiee de
// l'intranet (/api/cron/annuaire-crypto) le relit chaque matin et alerte Sekou par mail.

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { codesParRnic, construireAnnuaire, metiersParTiers } from "./lib/annuaire-crypto.mjs";

const CLE = "annuaire-crypto";
const DOSSIER_DEFAUT = "C:/Users/SekouKOMA/OneDrive - REAL 31 (1)/Export Crypto";
const FICHIERS = ["Tiers", "TiersCorrespondants", "MandatCopro", "Immeuble", "Locataire", "_Casquette", "_TypeDeK"];
const PAQUET = 1000;

const essai = process.argv.includes("--essai");
const forcer = process.argv.includes("--forcer");

for (const l of fs.readFileSync(path.join(import.meta.dirname, "..", ".env.local"), "utf8").split(/\r?\n/)) {
  const g = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (g && !process.env[g[1]]) process.env[g[1]] = g[2].replace(/^["']|["']$/g, "");
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants dans .env.local");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });
const dossier = process.env.CRYPTO_EXPORT_DIR ?? DOSSIER_DEFAUT;

async function noter(champs) {
  if (essai) return;
  const { error } = await sb.from("intranet_synchro").upsert({ cle: CLE, passe_le: new Date().toISOString(), ...champs });
  if (error) console.error("Compte rendu non écrit :", error.message);
}

// Les exports Crypto sont en Windows-1252 (accents) : lecture en latin1.
const lire = (nom) => JSON.parse(fs.readFileSync(path.join(dossier, `${nom}.txt`), "latin1"));

async function synchroniser() {
  // 1. L'export est-il la ? De quand date-t-il ? (date du plus ancien des fichiers lus)
  for (const f of FICHIERS) {
    if (!fs.existsSync(path.join(dossier, `${f}.txt`))) throw new Error(`Fichier absent de l'export : ${f}.txt (dossier ${dossier}).`);
  }
  const exportDu = new Date(Math.min(...FICHIERS.map((f) => fs.statSync(path.join(dossier, `${f}.txt`)).mtimeMs)));
  console.log(`Export Crypto du ${exportDu.toLocaleString("fr-FR")}`);

  if (!forcer && !essai) {
    const { data: etat } = await sb.from("intranet_synchro").select("export_du").eq("cle", CLE).maybeSingle();
    if (etat?.export_du && new Date(etat.export_du).getTime() >= exportDu.getTime()) {
      console.log("Export déjà synchronisé : rien à faire.");
      await noter({ statut: "inchange", message: "Export déjà synchronisé." });
      return;
    }
  }

  // 2. Construire l'annuaire.
  const { data: copros, error: e1 } = await sb.from("Copropriete").select("referenceCrypto, registrationNumber");
  if (e1) throw new Error(`Lecture Copropriete : ${e1.message}`);
  const metiers = metiersParTiers(lire("_Casquette"), lire("_TypeDeK"));
  const { lignes, bilan } = construireAnnuaire({
    tiers: lire("Tiers"),
    correspondants: lire("TiersCorrespondants"),
    mandats: lire("MandatCopro"),
    immeubles: lire("Immeuble"),
    locataires: lire("Locataire"),
    metiers,
    codeParRnic: codesParRnic(copros),
  });
  console.log(
    `${bilan.lignes} lignes, ${bilan.adresses} adresses dont ${bilan.adressesAvecCopro} reliées à une copro` +
      ` (${bilan.mandatsSansCopro} mandats sans copro connue, ${bilan.correspondantsInactifs} correspondants inactifs écartés).`,
  );
  if (essai) return;

  // 3. Deposer par paquets, puis basculer d'un coup (la base refuse moins de 80 % de l'existant).
  const passage = randomUUID();
  for (let i = 0; i < lignes.length; i += PAQUET) {
    const { error } = await sb.from("intranet_crypto_annuaire_import").insert(lignes.slice(i, i + PAQUET).map((l) => ({ ...l, passage })));
    if (error) {
      await sb.from("intranet_crypto_annuaire_import").delete().eq("passage", passage);
      throw new Error(`Dépôt du paquet ${i} : ${error.message}`);
    }
  }
  const { data: n, error: e2 } = await sb.rpc("intranet_crypto_annuaire_basculer", { p_passage: passage });
  if (e2) {
    await sb.from("intranet_crypto_annuaire_import").delete().eq("passage", passage);
    throw new Error(e2.message);
  }

  await noter({ statut: "reussi", reussi_le: new Date().toISOString(), export_du: exportDu.toISOString(), lignes: n, message: `${bilan.adresses} adresses, ${bilan.adressesAvecCopro} reliées à une copro.` });
  console.log(`Annuaire remplacé : ${n} lignes.`);
}

try {
  await synchroniser();
} catch (e) {
  const message = e instanceof Error ? e.message : String(e);
  console.error(`ÉCHEC : ${message}`);
  await noter({ statut: "echec", message: message.slice(0, 500) });
  process.exit(1);
}
