// SMOKE manuel : cree UNE facture de gestion courante reelle (honoraires +
// timbres), telecharge son PDF pour inspection, puis SUPPRIME le brouillon
// Pennylane et la ligne en base. Rien ne doit rester.
//
// Periode bidon "2099-T1" pour ne pas marquer une copro comme deja-facturee sur
// un vrai trimestre. Lancement : corepack pnpm run test:smoke gestion-courante-pdf

import { readFileSync, writeFileSync } from "node:fs";
import { describe, it, beforeAll } from "vitest";

const MARQUEUR = "[TEST GC - A SUPPRIMER]";
const PERIODE = "2099-T1";

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

describe("smoke gestion courante PDF (cree, telecharge, supprime)", () => {
  it(
    "produit le PDF d'une facture trimestrielle (honoraires + timbres hors TVA)",
    async () => {
      // eslint-disable-next-line boundaries/element-types
      const { createSupabasePublicClient } = await import("@/lib/adapters/supabase/public-client");
      const { getFacturationRepository } = await import("@/lib/adapters/router");
      const { emettreFacturesEnAttente } = await import("./emettre-factures-en-attente");
      const { calculerTrimestreGestionCourante } = await import(
        "@/lib/domain/facturation/gestion-courante"
      );

      const supabase = createSupabasePublicClient();
      const entetes = {
        Authorization: `Bearer ${process.env.PENNYLANE_API_KEY}`,
        Accept: "application/json",
      };

      // Une copro avec contrat en vigueur + pennylaneId + un forfait timbres > 0.
      const base = await getFacturationRepository().chargerGestionCourante(PERIODE);
      const { data: avecPenny } = await supabase
        .from("Copropriete")
        .select("referenceCrypto")
        .not("pennylaneId", "is", null)
        .eq("status", "ACTIVE");
      const okPenny = new Set(
        ((avecPenny as { referenceCrypto: string }[] | null) ?? []).map((c) => c.referenceCrypto),
      );
      // `honorairesAnnuelsTtc` peut etre null depuis que les copros sans contrat
      // remontent aussi (pour etre signalees) : on ne garde que celles qui en ont un.
      const ligne = base.find(
        (l) =>
          l.forfaitPostauxAnnuel > 0 &&
          (l.honorairesAnnuelsTtc ?? 0) > 0 &&
          okPenny.has(l.coproCode),
      );
      if (!ligne) throw new Error("Aucune copro testable (contrat + timbres + pennylaneId).");

      const t = calculerTrimestreGestionCourante(
        ligne.honorairesAnnuelsTtc ?? 0,
        ligne.forfaitPostauxAnnuel,
      );
      console.log("=== COPRO DE TEST ===");
      console.log("code             :", ligne.coproCode);
      console.log("contrat annuel   :", ligne.honorairesAnnuelsTtc, "TTC | timbres", ligne.forfaitPostauxAnnuel);
      console.log("trimestre        : honoraires", t.honorairesHt.toFixed(2), "HT | timbres", t.timbres.toFixed(2), "(hors TVA)");

      const factureId = await getFacturationRepository().creerFacture({
        coproCode: ligne.coproCode,
        typePrestation: "gestion_courante",
        periode: PERIODE,
        libelle: `${MARQUEUR} Gestion courante ${PERIODE}`,
        dateFacture: new Date().toISOString().slice(0, 10),
        details: { test: true },
        par: "GC",
        lignes: [
          {
            description: `Honoraires de gestion courante - ${PERIODE}`,
            categorieProduit: "Honoraires gestion courante",
            quantite: 1,
            prixUnitaireHt: t.honorairesHt,
          },
          {
            description: `Forfait de frais postaux - ${PERIODE}`,
            categorieProduit: "Forfait frais postaux",
            quantite: 1,
            prixUnitaireHt: t.timbres,
            tauxTva: 0,
          },
        ],
      });

      const emission = await emettreFacturesEnAttente([factureId]);
      console.log("\nemises :", emission.emises, "| erreurs :", emission.enErreur);
      for (const e of emission.erreurs) console.log("  ERREUR :", e.message.slice(0, 300));

      const { data: f } = await supabase
        .from("intranet_factures")
        .select("statut, pennylane_invoice_id, pennylane_error")
        .eq("id", factureId)
        .single();
      const facture = f as {
        statut: string;
        pennylane_invoice_id: string | null;
        pennylane_error: string | null;
      };
      console.log("statut :", facture.statut, "| pennylane :", facture.pennylane_invoice_id);
      if (facture.pennylane_error) console.log("erreur :", facture.pennylane_error.slice(0, 300));

      // Telechargement du PDF.
      if (facture.pennylane_invoice_id) {
        const inv = (await (
          await fetch(
            `https://app.pennylane.com/api/external/v2/customer_invoices/${facture.pennylane_invoice_id}`,
            { headers: entetes },
          )
        ).json()) as { public_file_url?: string };
        if (inv.public_file_url) {
          const buf = Buffer.from(await (await fetch(inv.public_file_url)).arrayBuffer());
          writeFileSync("C:/Users/SekouKOMA/projects/real31-intranet/apercu-gestion-courante.pdf", buf);
          console.log(`\nPDF telecharge (${Math.round(buf.length / 1024)} ko).`);
        }
        // Suppression du brouillon Pennylane.
        const del = await fetch(
          `https://app.pennylane.com/api/external/v2/customer_invoices/${facture.pennylane_invoice_id}`,
          { method: "DELETE", headers: entetes },
        );
        console.log("suppression brouillon Pennylane : HTTP", del.status);
      }

      // Suppression de la ligne en base (les facture_lignes cascadent).
      await supabase.from("intranet_factures").delete().eq("id", factureId);
      console.log("ligne de facture supprimee en base.");
    },
    120_000,
  );
});
