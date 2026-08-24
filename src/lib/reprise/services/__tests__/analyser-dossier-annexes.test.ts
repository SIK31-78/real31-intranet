// Tests de l'AIGUILLAGE A TROIS VOIES (xlsx patrimoine / grand livre / ANNEXE) + pipeline
// annexes. Providers MOCK (aucun reseau). Noms SYNTHETIQUES - aucune donnee reelle.
import { describe, expect, it } from "vitest";
import { analyserDossierUnifie, estAnnexe } from "../analyser-dossier";
import { MockAnnexeExtractionProvider } from "@/lib/reprise/adapters/annexe-extraction/mock-provider";
import { genererPhaseABuffers } from "@/lib/reprise/adapters/xlsx/generer-xlsx";
import type { DocumentSource } from "@/lib/reprise/ports/document-source";
import type { AnnexeExtraite } from "@/lib/reprise/ports/extraction-annexe-provider";
import type { JeuDeDonnees } from "@/lib/reprise/domain/patrimoine";

const doc = (nom: string): DocumentSource => ({ nom, contenu: new Uint8Array() });

const JEU_PATRIMOINE: JeuDeDonnees = {
  lots: [{ numero: 1, type: "Appartement", usage: "residential", commentaire: "T3" }],
  cles: [{ code: "001", libelle: "Charges generales", totalAttendu: 100, defaut: true }],
  tantiemes: [{ cleCode: "001", lot: 1, valeur: 100 }],
  owners: [
    { id: "o1", civilite: "m", nom: "MARTIN", prenom: "Paul", pro: false },
    { id: "o2", civilite: "mme", nom: "NOVAK", prenom: "Elena", pro: false },
  ],
  attributions: [{ ownerId: "o1", lot: 1 }],
};

async function fichiersPatrimoine(): Promise<DocumentSource[]> {
  const buffers = await genererPhaseABuffers(JEU_PATRIMOINE);
  return buffers.map((b) => ({ nom: b.nom, contenu: b.contenu }));
}

const ANNEXE: AnnexeExtraite = {
  typeDetecte: "liste coproprietaires",
  contacts: [
    { nom: "MARTIN Paul", email: "paul@example.test", telephone: "0600000000" },
    { nom: "ZORGLUB Xavier", email: "x@example.test" },
  ],
  pointsAttention: ["Un lot signale un contentieux (synthetique)."],
  resume: "Liste synthetique.",
};

const annexe = () => new MockAnnexeExtractionProvider(ANNEXE);

describe("estAnnexe", () => {
  it("classe en annexe ce qui n'est ni grand livre ni xlsx patrimoine", () => {
    expect(estAnnexe("liste des mutations.pdf")).toBe(true);
    expect(estAnnexe("courrier.pdf")).toBe(true);
    expect(estAnnexe("avis de mutation.pdf")).toBe(true);
    expect(estAnnexe("rcp.pdf")).toBe(true); // un RCP PDF n'est plus une entree du module
  });
  it("un grand livre ou un xlsx patrimoine n'est jamais une annexe", () => {
    expect(estAnnexe("grand livre.pdf")).toBe(false);
    expect(estAnnexe("lots.xlsx")).toBe(false);
    expect(estAnnexe("owners.xlsx")).toBe(false);
  });
});

describe("analyserDossierUnifie - aiguillage annexes", () => {
  it("patrimoine + annexe : analyse l'annexe et rapproche les contacts aux owners", async () => {
    const { jeu, recap, annexes } = await analyserDossierUnifie(
      null,
      [...(await fichiersPatrimoine()), doc("liste des mutations.pdf")],
      annexe(),
    );

    expect(annexes).toBeDefined();
    expect(annexes!.annexes).toHaveLength(1);
    expect(annexes!.annexes[0].typeDetecte).toBe("liste coproprietaires");
    expect(annexes!.contacts).toHaveLength(2);
    const martin = annexes!.contacts.find((c) => c.nom === "MARTIN Paul");
    expect(martin?.statut).toBe("sur");
    expect(martin?.ownerId).toBe("o1");
    expect(annexes!.contacts.find((c) => c.nom === "ZORGLUB Xavier")?.statut).toBe("inconnu");
    // Le patrimoine reste parse normalement.
    expect(jeu.owners).toHaveLength(2);
    // Les precisions remontent en note de vigilance.
    expect(recap.notes.some((n) => /vigilance/i.test(n))).toBe(true);
  });

  it("SANS provider annexe : les annexes versees sont NOTEES, jamais un silence", async () => {
    const { annexes, recap } = await analyserDossierUnifie(
      null,
      [...(await fichiersPatrimoine()), doc("liste des mutations.pdf")],
      null,
    );
    expect(annexes).toBeUndefined();
    expect(recap.notes.some((n) => /annexe/i.test(n) && /non analyse/i.test(n))).toBe(true);
  });

  it("dossier SANS annexe : aucun bloc annexe (retro-compat)", async () => {
    const { annexes } = await analyserDossierUnifie(null, await fichiersPatrimoine(), annexe());
    expect(annexes).toBeUndefined();
  });

  it("ANNEXES SEULES (aucun patrimoine, aucun grand livre) : jeu vide + bloc annexe, sans throw", async () => {
    const { jeu, annexes } = await analyserDossierUnifie(null, [doc("courrier.pdf")], annexe());
    expect(jeu.owners).toHaveLength(0);
    expect(annexes).toBeDefined();
    expect(annexes!.annexes).toHaveLength(1);
    // Aucun owner -> tous les contacts inconnus.
    expect(annexes!.contacts.every((c) => c.statut === "inconnu")).toBe(true);
  });
});
