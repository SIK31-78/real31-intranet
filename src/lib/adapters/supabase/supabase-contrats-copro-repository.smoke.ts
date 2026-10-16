// SMOKE (à la main, LECTURE SEULE) : l'adapter « Contrats & contrôles » contre la vraie base
// partagée. Aucune écriture : les gestes d'écriture se testent sur SE999, par Sekou.
//   node --env-file=.env.local ./node_modules/vitest/vitest.mjs run \
//     --config vitest.smoke.config.mts supabase-contrats-copro --disableConsoleIntercept
import { describe, expect, it } from "vitest";

describe("SupabaseContratsCoproRepository : lectures sur la base partagée", () => {
  it("lit cycles, contrat courant, appareils, devis, règles, fiche et documents", async () => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return console.log("credentials Supabase absents : mesure impossible");
    }
    const { SupabaseContratsCoproRepository } = await import("./supabase-contrats-copro-repository");
    const repo = new SupabaseContratsCoproRepository();
    const code = process.env.SMOKE_COPRO ?? "S001";

    const assurance = await repo.listerCycles({ sujets: ["assurance"] });
    const parStatut = (xs: { statut: string }[]) =>
      xs.reduce<Record<string, number>>((acc, c) => ((acc[c.statut] = (acc[c.statut] ?? 0) + 1), acc), {});
    console.log("cycles assurance :", assurance.length, parStatut(assurance));
    expect(assurance.length).toBeGreaterThan(0);
    expect(assurance.every((c) => c.coproCode && !c.coproCode.includes("-"))).toBe(true); // des codes, pas des uuid

    const tousEnCours = await repo.listerCycles({ statuts: ["en_cours"] });
    const parSujet = tousEnCours.reduce<Record<string, number>>((acc, c) => ((acc[c.sujet] = (acc[c.sujet] ?? 0) + 1), acc), {});
    console.log("cycles en cours par sujet :", parSujet);

    const dUneCopro = await repo.listerCycles({ coproCodes: [code] });
    console.log(`cycles de ${code} :`, dUneCopro.map((c) => `${c.sujet}/${c.statut}/${c.echeanceISO ?? "sans échéance"}${c.ascenseurIdentifiant ? ` (${c.ascenseurIdentifiant})` : ""}`));
    expect(dUneCopro.every((c) => c.coproCode === code)).toBe(true);

    const contrat = await repo.getContratCourant(code);
    console.log(`contrat courant ${code} :`, JSON.stringify(contrat));
    expect(contrat?.coproCode).toBe(code);

    const ascenseurs = await repo.listerAscenseurs([code]);
    console.log(`ascenseurs ${code} :`, ascenseurs.map((a) => `${a.identifiant ?? "?"} dernier CTQ ${a.dernierCtqISO ?? "-"}`));

    const devis = await repo.listerDevisCtq([code]);
    console.log(`devis CTQ ${code} :`, devis.length);

    const regles = await repo.listerReglesRelance();
    console.log("règles :", JSON.stringify(regles));
    expect(regles.assurance.premierRappelJours).toBe(180);

    const fiche = await repo.getFicheImmeuble(code);
    console.log(`fiche immeuble ${code} :`, JSON.stringify(fiche));

    const documents = await repo.listerDocuments({ type: "toute_copro", coproCode: code });
    console.log(`documents ${code} :`, documents.length, documents.map((d) => `${d.typeDocument}/${d.rattachement.type}`));

    // Les offres des cycles d'assurance en cours : passe par la lecture dégradée tant que
    // deletedAt n'existe pas (un console.warn attendu).
    const offres = await repo.listerOffresAssurance(assurance.filter((c) => c.statut === "en_cours").map((c) => c.id));
    console.log("offres d'assurance (cycles en cours) :", offres.length);

    const prestataires = await repo.listerPrestataires([code]);
    console.log(`prestataires ${code} (table native, peut manquer) :`, prestataires.length);
    const journal = await repo.listerJournal(code);
    console.log(`journal ${code} (table native, peut manquer) :`, journal.length);
  }, 120_000);
});
