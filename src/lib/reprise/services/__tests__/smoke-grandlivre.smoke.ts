// SMOKE test manuel : extraction REELLE du grand livre S0302 (couche texte native, zero IA). Aucune ecriture eStale. Ne loggue QUE des agregats (nb
// lignes, balance par classe, controles) - JAMAIS de libelle/nom (PII).
import { readFileSync } from "node:fs";
import { describe, it, beforeAll } from "vitest";

beforeAll(() => {
  const txt = readFileSync("C:/Users/SekouKOMA/projects/real31-intranet/.env.local", "utf8");
  for (const l of txt.split("\n")) {
    const s = l.trim();
    if (!s || s.startsWith("#") || !s.includes("=")) continue;
    const i = s.indexOf("=");
    const k = s.slice(0, i);
    if (!process.env[k]) process.env[k] = s.slice(i + 1);
  }
});

describe("smoke grand livre (reel, aucune ecriture)", () => {
  it(
    "extrait le grand livre S0302 et calcule balance + controles",
    async () => {
      const { getExtractionComptaProvider } = await import("@/lib/reprise/adapters/router");
      const { extraireEtVerifierGrandLivre } = await import("../reprendre-compta");
      const { verifierTotauxParCompte } = await import("@/lib/reprise/domain/controle-comptes");

      const chemin = "C:/Users/SekouKOMA/projects/real31-intranet/data/GRAND_LIVRE_20251001-20260930.pdf";
      const doc = { nom: "grand-livre.pdf", contenu: new Uint8Array(readFileSync(chemin)) };

      const t0 = Date.now();
      const r = await extraireEtVerifierGrandLivre(getExtractionComptaProvider(), [doc]);
      console.log("=== duree :", Math.round((Date.now() - t0) / 1000), "s ===");
      console.log("nb lignes extraites :", r.jeu.lignes.length, "| bloc A (classes 4/5) :", r.blocA.length);
      console.log("equilibre global :", r.equilibreGlobal.equilibre, "| ecart :", r.equilibreGlobal.ecart);
      console.log("total debit :", r.balance.totalDebit, "| total credit :", r.balance.totalCredit);
      for (let c = 1; c <= 7; c++) {
        const a = r.balance.parClasse[c as 1 | 2 | 3 | 4 | 5 | 6 | 7];
        if (a && (a.debit || a.credit)) console.log(`  classe ${c} : debit=${a.debit} credit=${a.credit} solde=${a.solde}`);
      }

      const controles = r.jeu.controles ?? [];
      const ctrl = verifierTotauxParCompte(r.jeu.lignes, controles);
      console.log(
        `controle par compte : ${controles.length} total(aux) captures | ${ctrl.nbComptesControles} controle(s) | ${ctrl.nbEnEcart} en ecart`,
      );
      for (const e of ctrl.enEcart.slice(0, 30)) {
        console.log(`  compte ${e.compte} : ecartDebit=${e.ecartDebit ?? "-"} ecartCredit=${e.ecartCredit ?? "-"}`);
      }
      if (r.jeu.notes.length) console.log("notes :", r.jeu.notes.slice(0, 12).join(" | "));
    },
    900_000,
  );
});
