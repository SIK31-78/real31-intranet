// Tests de l'AIGUILLAGE A TROIS VOIES (grand livre / patrimoine / ANNEXE) + pipeline annexes.
// Providers MOCK (aucun reseau). Noms SYNTHETIQUES - aucune donnee reelle.
import { describe, expect, it } from "vitest";
import { analyserDossierUnifie, estAnnexe } from "../analyser-dossier";
import { MockExtractionProvider } from "@/lib/reprise/adapters/extraction/mock-extraction-provider";
import { MockAnnexeExtractionProvider } from "@/lib/reprise/adapters/annexe-extraction/mock-provider";
import type { DocumentSource, ResultatPatrimoine, ResultatProprietaires } from "@/lib/reprise/ports/extraction-provider";
import type { AnnexeExtraite } from "@/lib/reprise/ports/extraction-annexe-provider";

const doc = (nom: string): DocumentSource => ({ nom, contenu: new Uint8Array() });

const PATRIMOINE: ResultatPatrimoine = {
  lots: [{ numero: 1, type: "Appartement", usage: "residential", commentaire: "T3" }],
  cles: [{ code: "001", libelle: "Charges generales", totalAttendu: 100, defaut: true }],
  tantiemes: [{ cleCode: "001", lot: 1, valeur: 100 }],
  notes: [],
};
const PROPRIETAIRES: ResultatProprietaires = {
  owners: [
    { id: "o1", civilite: "m", nom: "MARTIN", prenom: "Paul", pro: false },
    { id: "o2", civilite: "mme", nom: "NOVAK", prenom: "Elena", pro: false },
  ],
  attributions: [{ ownerId: "o1", lot: 1 }],
  notes: [],
};

const ANNEXE: AnnexeExtraite = {
  typeDetecte: "liste coproprietaires",
  contacts: [
    { nom: "MARTIN Paul", email: "paul@example.test", telephone: "0600000000" },
    { nom: "ZORGLUB Xavier", email: "x@example.test" },
  ],
  pointsAttention: ["Un lot signale un contentieux (synthetique)."],
  resume: "Liste synthetique.",
};

const patri = () => new MockExtractionProvider(PATRIMOINE, PROPRIETAIRES);
const annexe = () => new MockAnnexeExtractionProvider(ANNEXE);

describe("estAnnexe", () => {
  it("classe en annexe ce qui n'est ni grand livre ni patrimoine", () => {
    expect(estAnnexe("liste coproprietaires.pdf")).toBe(true);
    expect(estAnnexe("courrier.pdf")).toBe(true);
    expect(estAnnexe("avis de mutation.pdf")).toBe(true);
  });
  it("un grand livre ou un document patrimoine n'est jamais une annexe", () => {
    expect(estAnnexe("grand livre.pdf")).toBe(false);
    expect(estAnnexe("rcp.pdf")).toBe(false);
    expect(estAnnexe("feuille de presence.pdf")).toBe(false);
    expect(estAnnexe("annexe comptable.pdf")).toBe(false); // "annexe/comptable" -> patrimoine (RGDD)
  });
});

describe("analyserDossierUnifie - aiguillage annexes", () => {
  it("patrimoine + annexe : analyse l'annexe et rapproche les contacts aux owners", async () => {
    const { jeu, recap, annexes } = await analyserDossierUnifie(patri(), null, [
      doc("rcp.pdf"),
      doc("liste coproprietaires.pdf"),
    ], annexe());

    expect(annexes).toBeDefined();
    expect(annexes!.annexes).toHaveLength(1);
    expect(annexes!.annexes[0].typeDetecte).toBe("liste coproprietaires");
    expect(annexes!.contacts).toHaveLength(2);
    const martin = annexes!.contacts.find((c) => c.nom === "MARTIN Paul");
    expect(martin?.statut).toBe("sur");
    expect(martin?.ownerId).toBe("o1");
    expect(annexes!.contacts.find((c) => c.nom === "ZORGLUB Xavier")?.statut).toBe("inconnu");
    // Le patrimoine reste extrait normalement.
    expect(jeu.owners).toHaveLength(2);
    // Les precisions remontent en note de vigilance.
    expect(recap.notes.some((n) => /vigilance/i.test(n))).toBe(true);
  });

  it("SANS provider annexe : comportement identique (aucun bloc annexe, retro-compat)", async () => {
    const { annexes } = await analyserDossierUnifie(patri(), null, [
      doc("rcp.pdf"),
      doc("liste coproprietaires.pdf"),
    ], null);
    expect(annexes).toBeUndefined();
  });

  it("dossier SANS annexe : aucun bloc annexe (retro-compat)", async () => {
    const { annexes } = await analyserDossierUnifie(patri(), null, [doc("rcp.pdf"), doc("feuille de presence.pdf")], annexe());
    expect(annexes).toBeUndefined();
  });

  it("ANNEXES SEULES (aucun patrimoine, aucun grand livre) : jeu vide + bloc annexe, sans throw", async () => {
    const { jeu, annexes } = await analyserDossierUnifie(patri(), null, [doc("courrier.pdf")], annexe());
    expect(jeu.owners).toHaveLength(0);
    expect(annexes).toBeDefined();
    expect(annexes!.annexes).toHaveLength(1);
    // Aucun owner -> tous les contacts inconnus.
    expect(annexes!.contacts.every((c) => c.statut === "inconnu")).toBe(true);
  });
});
