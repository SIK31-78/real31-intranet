// SMOKE test manuel : facturation de bout en bout, EN REEL.
//
// Exerce toute la chaine : service -> garde de perimetre -> parametres copro
// (Copropriete) -> bareme (intranet_tarifs) -> calcul pur (domaine) -> ecriture
// facture + lignes (intranet_factures) -> resolution du client Pennylane
// (external_reference -> customer_id) -> creation d'un BROUILLON Pennylane.
//
// ECRITURES REELLES : une ligne dans intranet_factures + un brouillon dans la
// comptabilite Pennylane de production. Le libelle porte un marqueur explicite
// pour que le brouillon soit identifiable et supprimable sans ambiguite.
// Aucune facture n'est jamais finalisee (draft: true cote adapter).
//
// Lancement : corepack pnpm run test:smoke facturation-e2e

import { readFileSync } from "node:fs";
import { describe, it, beforeAll, expect } from "vitest";

const MARQUEUR = "[TEST E2E - A SUPPRIMER]";

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

describe("smoke facturation E2E (ecritures reelles)", () => {
  it(
    "cree une facturation de depassement CS et l'emet en brouillon Pennylane",
    async () => {
      // Smoke manuel : il inspecte l'etat brut en base pour verifier ce qui a
      // reellement ete ecrit. Cet acces direct a l'adapter est assume ICI et
      // nulle part ailleurs : le code applicatif passe par le routeur (ADR-001).
      // eslint-disable-next-line boundaries/element-types
      const { createSupabasePublicClient } = await import("@/lib/adapters/supabase/public-client");
      const { creerFactureDepassementCs } = await import("./creer-facture-depassement-cs");
      const { emettreFacturesEnAttente } = await import("./emettre-factures-en-attente");

      console.log("=== CONFIG ===");
      console.log("COPRO_SOURCE      :", process.env.COPRO_SOURCE);
      console.log("PENNYLANE_API_KEY :", process.env.PENNYLANE_API_KEY ? "presente" : "ABSENTE (emission simulee)");

      const supabase = createSupabasePublicClient();

      // --- Choix d'une copro testable : bareme complet (2025/2026) + pennylaneId ---
      const { data: contrats } = await supabase
        .from("intranet_suivi_contrats")
        .select("copropriete_id, debut_contrat")
        .gte("debut_contrat", "2025-01-01")
        .lt("debut_contrat", "2027-01-01")
        .limit(200);

      const codes = (contrats ?? []).map((c: { copropriete_id: string }) => c.copropriete_id);
      const { data: copros } = await supabase
        .from("Copropriete")
        .select("referenceCrypto, managerId, pennylaneId, csDurationMinutes")
        .in("referenceCrypto", codes.slice(0, 100))
        .not("pennylaneId", "is", null)
        .not("managerId", "is", null)
        .eq("status", "ACTIVE")
        .limit(1);

      const copro = (copros ?? [])[0] as
        | { referenceCrypto: string; managerId: string; pennylaneId: string; csDurationMinutes: number }
        | undefined;
      expect(copro, "aucune copro testable (bareme 2025/2026 + pennylaneId + gestionnaire)").toBeTruthy();
      if (!copro) return;

      const contrat = (contrats ?? []).find(
        (c: { copropriete_id: string }) => c.copropriete_id === copro.referenceCrypto,
      ) as { debut_contrat: string };

      console.log("\n=== COPRO DE TEST ===");
      console.log("code            :", copro.referenceCrypto);
      console.log("debut contrat   :", contrat.debut_contrat, "-> bareme", contrat.debut_contrat.slice(0, 4));
      console.log("franchise CS    :", copro.csDurationMinutes, "h (colonne csDurationMinutes, unite = HEURES)");

      // --- 1. Creation de la facturation (reunion de 3 h) ---
      // Depassement attendu = 3 h - franchise.
      const reunion = {
        jourDebut: "2026-05-12",
        heureDebut: 18,
        minuteDebut: 0,
        jourFin: "2026-05-12",
        heureFin: 21,
        minuteFin: 0,
      };

      console.log("\n=== 1. CALCUL + ECRITURE ===");
      const resultat = await creerFactureDepassementCs(
        { coproCode: copro.referenceCrypto, reunion, par: "E2E" },
        copro.managerId,
      );
      console.log("franchise appliquee :", resultat.franchiseHeures, "h");
      console.log("heures facturables  :", resultat.heuresFacturables, "h");
      console.log("montant HT          :", resultat.montantHt.toFixed(2), "EUR");
      console.log("facture id          :", resultat.factureId ?? "(aucune - rien a facturer)");

      expect(resultat.factureId, "reunion de 3 h : un depassement etait attendu").toBeTruthy();
      if (!resultat.factureId) return;

      // Marqueur sur le libelle pour retrouver/supprimer le brouillon cote Pennylane.
      await supabase
        .from("intranet_factures")
        .update({ libelle: `${MARQUEUR} Depassement CS du ${reunion.jourDebut}` })
        .eq("id", resultat.factureId);

      const { data: lignes } = await supabase
        .from("intranet_facture_lignes")
        .select("description, quantite, prix_unitaire_ht, taux_tva")
        .eq("facture_id", resultat.factureId);
      console.log("lignes ecrites      :", JSON.stringify(lignes));

      // --- 2. Emission vers Pennylane ---
      console.log("\n=== 2. EMISSION PENNYLANE ===");
      const emission = await emettreFacturesEnAttente([resultat.factureId]);
      console.log("emises   :", emission.emises);
      console.log("en erreur:", emission.enErreur);
      for (const e of emission.erreurs) console.log("  ERREUR", e.factureId, ":", e.message);

      // --- 3. Etat final de NOTRE facture ---
      const { data: apres } = await supabase
        .from("intranet_factures")
        .select("statut, pennylane_invoice_id, pennylane_error, libelle")
        .eq("id", resultat.factureId)
        .single();

      console.log("\n=== 3. ETAT FINAL ===");
      console.log(JSON.stringify(apres, null, 2));

      const f = apres as { statut: string; pennylane_invoice_id: string | null; pennylane_error: string | null };
      if (f.statut === "facturee") {
        console.log(`\nBROUILLON CREE, id Pennylane ${f.pennylane_invoice_id}`);
        console.log(`A SUPPRIMER dans Pennylane (chercher "${MARQUEUR}").`);
      }
      expect(f.statut, `emission en erreur : ${f.pennylane_error}`).toBe("facturee");
    },
    120_000,
  );
});
