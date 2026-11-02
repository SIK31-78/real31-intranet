// Vue « Brouillons » (02/11/2026) : seulement MA boîte perso (ni partagée, ni celle d'un
// titulaire par délégation, ni la boîte d'une autre personne), et seulement un brouillon que la
// liste relue côté serveur montre. Gardes et services doublés.

import { beforeEach, describe, expect, it, vi } from "vitest";

const etat = vi.hoisted(() => ({
  session: { id: "g1", email: "julie@real31.fr" } as Record<string, string> | null,
  // Les boîtes de la personne : id -> nature.
  boites: new Map<string, "mienne" | "deleguee" | "partagee">([
    ["julie@real31.fr", "mienne"],
    ["fanny@real31.fr", "deleguee"],
    ["syndic2@real31.fr", "partagee"],
  ]),
  // Les brouillons que la liste montre, par boîte.
  brouillons: new Map<string, { id: string; objet: string; internetMessageId: string }[]>([
    ["julie@real31.fr", [{ id: "d1", objet: "Devis", internetMessageId: "<d1@x>" }]],
  ]),
}));
const graph = vi.hoisted(() => ({
  envoyerBrouillon: vi.fn(async () => {}),
  mettreALaCorbeille: vi.fn(async (p: { internetMessageIds: string[] }) => ({ deplaces: p.internetMessageIds, echecs: [] })),
  lireCorps: vi.fn(async () => "Bonjour"),
  // « Modifier » (02/11/2026) : le brouillon complet, sa mise à jour, le retrait d'une pièce.
  lireBrouillonComplet: vi.fn(async (p: { id: string }) =>
    p.id === "d1"
      ? {
          objet: "Devis",
          a: ["client@ex.fr"],
          cc: [],
          cci: ["archive@ex.fr"],
          html: `<html><head></head><body><div>Bonjour,</div><br>${SIG}</body></html>`,
          pieces: [{ id: "pj1", nom: "devis.pdf", taille: 1000 }],
        }
      : null,
  ),
  majBrouillon: vi.fn(async () => {}),
  retirerPieceJointe: vi.fn(async () => {}),
}));
const SIG = vi.hoisted(() => "<table><tr><td>Julie MARTIN, gestionnaire REAL31</td></tr></table>");

vi.mock("@/lib/auth/session", () => ({
  getGestionnaireCourant: async () => etat.session,
  mailModuleActifPour: () => true,
}));
vi.mock("@/lib/observabilite", () => ({ tracer: vi.fn(), signaler: vi.fn(), signalerException: vi.fn() }));
vi.mock("./gardes-boites", () => ({
  boiteCible: async (_g: unknown, b: string) => (etat.boites.has(b.trim().toLowerCase()) ? b.trim().toLowerCase() : null),
  natureBoite: async (_g: unknown, b: string) => etat.boites.get(b) ?? null,
}));
vi.mock("@/lib/adapters/router", () => ({
  getRechercheMail: () => ({
    async brouillons(p: { boite: string }) {
      return etat.brouillons.get(p.boite) ?? [];
    },
    lireCorps: graph.lireCorps,
    lireBrouillonComplet: graph.lireBrouillonComplet,
  }),
  getMailOutboundProvider: () => ({ envoyerBrouillon: graph.envoyerBrouillon, majBrouillon: graph.majBrouillon, retirerPieceJointe: graph.retirerPieceJointe }),
  getMailboxProvider: () => ({ mettreALaCorbeille: graph.mettreALaCorbeille }),
}));

vi.mock("@/lib/services/mes-emails/get-signature", () => ({ getSignatureGestionnaire: async () => SIG }));
vi.mock("@/lib/services/mes-emails/composer-mail", () => ({ brouillonPossible: () => true, envoiDirectComposition: () => true }));
vi.mock("@/lib/services/mes-emails/jeton-envoi", () => ({ DUREE_JETON_MS: 1000, scellerJeton: (j: unknown) => JSON.stringify(j) }));

import {
  chargerBrouillonsAction,
  envoyerBrouillonAction,
  lireBrouillonAction,
  ouvrirBrouillonEditionAction,
  preparerEditionBrouillonAction,
  supprimerBrouillonAction,
} from "./actions-brouillons";

const REFUS = { ok: false, erreur: "Les brouillons ne s'affichent que pour votre boîte personnelle." };
const ABSENT = { ok: false, erreur: "Ce brouillon n'est plus dans vos brouillons." };

beforeEach(() => {
  etat.session = { id: "g1", email: "julie@real31.fr" };
  vi.clearAllMocks();
});

describe("actions des brouillons", () => {
  it("liste, lit, envoie et met à la corbeille un brouillon de ma boîte perso", async () => {
    expect(await chargerBrouillonsAction({ boite: "julie@real31.fr" })).toMatchObject({ ok: true, donnees: [{ id: "d1" }] });
    expect(await lireBrouillonAction({ boite: "julie@real31.fr", id: "d1" })).toEqual({ ok: true, donnees: "Bonjour" });
    expect(await envoyerBrouillonAction({ boite: "julie@real31.fr", id: "d1" })).toEqual({ ok: true, donnees: { objet: "Devis" } });
    expect(graph.envoyerBrouillon).toHaveBeenCalledWith({ boite: "julie@real31.fr", id: "d1" });
    expect(await supprimerBrouillonAction({ boite: "julie@real31.fr", id: "d1" })).toEqual({ ok: true });
    // La corbeille d'Outlook (réversible), par l'internetMessageId relu dans la liste.
    expect(graph.mettreALaCorbeille).toHaveBeenCalledWith({ boite: "julie@real31.fr", internetMessageIds: ["<d1@x>"] });
  });

  it("refuse une boîte partagée, la boîte d'un titulaire par délégation et la boîte d'une autre personne", async () => {
    for (const boite of ["syndic2@real31.fr", "fanny@real31.fr", "marc@real31.fr"]) {
      expect(await chargerBrouillonsAction({ boite })).toEqual(REFUS);
      expect(await envoyerBrouillonAction({ boite, id: "d1" })).toEqual(REFUS);
      expect(await supprimerBrouillonAction({ boite, id: "d1" })).toEqual(REFUS);
      expect(await lireBrouillonAction({ boite, id: "d1" })).toEqual(REFUS);
    }
    expect(graph.envoyerBrouillon).not.toHaveBeenCalled();
    expect(graph.mettreALaCorbeille).not.toHaveBeenCalled();
  });

  it("refuse un id absent de mes brouillons (mail reçu, brouillon d'ailleurs) sans rien lire ni écrire", async () => {
    expect(await lireBrouillonAction({ boite: "julie@real31.fr", id: "recu-1" })).toEqual(ABSENT);
    expect(await envoyerBrouillonAction({ boite: "julie@real31.fr", id: "recu-1" })).toEqual(ABSENT);
    expect(await supprimerBrouillonAction({ boite: "julie@real31.fr", id: "recu-1" })).toEqual(ABSENT);
    expect(graph.lireCorps).not.toHaveBeenCalled();
    expect(graph.envoyerBrouillon).not.toHaveBeenCalled();
    expect(graph.mettreALaCorbeille).not.toHaveBeenCalled();
  });

  it("sans session : refusé", async () => {
    etat.session = null;
    expect(await chargerBrouillonsAction({ boite: "julie@real31.fr" })).toMatchObject({ ok: false });
    expect(await envoyerBrouillonAction({ boite: "julie@real31.fr", id: "d1" })).toMatchObject({ ok: false });
    expect(graph.envoyerBrouillon).not.toHaveBeenCalled();
  });
});

// « Modifier » un brouillon dans l'éditeur riche (02/11/2026, décision Sekou, option a).
describe("rouvrir et mettre à jour un brouillon", () => {
  const demande = (o: Record<string, unknown> = {}) => ({
    boite: "julie@real31.fr",
    id: "d1",
    objet: "Devis révisé",
    a: ["client@ex.fr"],
    cc: ["collegue@real31.fr"],
    cci: [],
    corpsHtml: "<p>Bonjour, <b>voici</b> le devis.</p>",
    retirer: ["pj1", "pj-d-ailleurs"],
    ...o,
  });

  it("rouvre : destinataires (Cci compris), objet, texte sans la signature, pièces", async () => {
    const r = await ouvrirBrouillonEditionAction({ boite: "julie@real31.fr", id: "d1" });
    expect(r).toMatchObject({ ok: true, donnees: { objet: "Devis", a: ["client@ex.fr"], cci: ["archive@ex.fr"], signature: "isolee", pieces: [{ id: "pj1" }] } });
    expect(r.ok && r.donnees!.corpsHtml).not.toContain("Julie MARTIN");
  });

  it("envoie : PATCH du brouillon existant, signature gardée une seule fois, seules ses pièces retirées, jeton « existant »", async () => {
    const r = await preparerEditionBrouillonAction(demande());
    expect(r).toMatchObject({ ok: true, donnees: { simulation: false, envoi: true } });
    const jeton = JSON.parse((r.ok && r.donnees!.jeton) || "{}") as Record<string, unknown>;
    expect(jeton).toMatchObject({ nature: "neuf", boite: "julie@real31.fr", draftId: "d1", gid: "g1", mode: "envoyer", existant: true });
    const patch = (graph.majBrouillon.mock.calls[0] as unknown as [{ corpsHtml: string; sujet: string; cc: string[] }])[0];
    expect(patch).toMatchObject({ sujet: "Devis révisé", cc: ["collegue@real31.fr"] });
    expect(patch.corpsHtml.match(/Julie MARTIN/g)).toHaveLength(1);
    expect(patch.corpsHtml).toContain("<b>voici</b>");
    expect(graph.retirerPieceJointe).toHaveBeenCalledTimes(1);
    expect(graph.retirerPieceJointe).toHaveBeenCalledWith({ boite: "julie@real31.fr", draftId: "d1", pieceId: "pj1" });
    expect(graph.envoyerBrouillon).not.toHaveBeenCalled();
  });

  it("« Enregistrer » : mode brouillon, rien ne part", async () => {
    const r = await preparerEditionBrouillonAction(demande({ brouillon: true, a: [], objet: "" }));
    expect(JSON.parse((r.ok && r.donnees!.jeton) || "{}")).toMatchObject({ mode: "brouillon" });
  });

  it("isolation : boîte partagée, déléguée ou d'un autre, brouillon absent : refusé sans rien lire ni écrire", async () => {
    for (const boite of ["syndic2@real31.fr", "fanny@real31.fr", "marc@real31.fr"]) {
      expect(await ouvrirBrouillonEditionAction({ boite, id: "d1" })).toEqual(REFUS);
      expect(await preparerEditionBrouillonAction(demande({ boite }))).toEqual(REFUS);
    }
    expect(await ouvrirBrouillonEditionAction({ boite: "julie@real31.fr", id: "recu-1" })).toEqual(ABSENT);
    expect(await preparerEditionBrouillonAction(demande({ id: "recu-1" }))).toEqual(ABSENT);
    expect(graph.lireBrouillonComplet).not.toHaveBeenCalled();
    expect(graph.majBrouillon).not.toHaveBeenCalled();
    expect(graph.retirerPieceJointe).not.toHaveBeenCalled();
  });
});
