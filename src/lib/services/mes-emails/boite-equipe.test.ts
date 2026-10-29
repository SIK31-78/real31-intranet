// Service de la boîte d'équipe sur le dépôt en mémoire : journal du tri et collaborateurs doublés.

import { beforeEach, describe, expect, it, vi } from "vitest";
// Le dépôt en mémoire de la production (même contrat que les tables), pas un double écrit ici.
// eslint-disable-next-line boundaries/element-types
import { MemoireBoiteEquipeRepository } from "@/lib/adapters/mock/memoire-boite-equipe-repository";
import type { EntreeJournalTri } from "@/lib/domain/tri-emails";

const BOITE = "syndic4@real31.fr";
const etat = vi.hoisted(() => ({
  repo: null as unknown as MemoireBoiteEquipeRepository,
  journal: [] as Partial<EntreeJournalTri>[],
  absent: false,
}));

vi.mock("react", () => ({ cache: <T,>(f: T) => f }));
vi.mock("@/lib/domain/mail-gate", () => ({ boiteTri: (b: string) => (b?.trim().toLowerCase() === BOITE ? { boite: BOITE } : null) }));
vi.mock("@/lib/adapters/router", () => ({
  getBoiteEquipeRepository: () =>
    etat.absent
      ? { attributions: async () => null, compterNotes: async () => null, attentes: async () => null }
      : etat.repo,
  getGestionnaireRepository: () => ({
    listTous: async () => [
      { id: "u-el", nomComplet: "Emmanuel Lopes", initiales: "EL", email: "emmanuel.lopes@real31.fr", role: "GESTIONNAIRE" },
      { id: "u-fs", nomComplet: "Fanny S.", initiales: "FS", email: "fanny.s@real31.fr", role: "ASSISTANT" },
      { id: "u-cp", nomComplet: "Claire Compta", initiales: "CC", email: "claire.compta@real31.fr", role: "COMPTABLE" },
      { id: "u-x", nomComplet: "Autre Binôme", initiales: "AB", email: "autre@real31.fr", role: "GESTIONNAIRE" },
    ],
  }),
  getTriRepository: () => ({
    binomes: async () => ({
      binomes: [{ id: "b1", gestionnaireEmail: "emmanuel.lopes@real31.fr", assistant: { nomComplet: "Fanny S.", email: "fanny.s@real31.fr" }, principal: true }],
      parCopro: {},
    }),
    rangementActif: async (_b: string, id: string) => etat.journal.find((e) => e.internetMessageId === id) ?? null,
    journalPourCles: async (_b: string, _d: string, cles: string[]) => etat.journal.filter((e) => cles.includes(e.dossierCle ?? "")),
  }),
}));

import {
  ajouterNoteMail,
  attribuerAuRepondant,
  attribuerMail,
  etatEquipeDesMails,
  mettreEnAttente,
  modifierNoteMail,
  notesDuMail,
  prendreMail,
  relancerSiPasDeReponse,
  relancesDesBoites,
  reprendreMail,
  retirerAttributionMail,
  supprimerNoteMail,
} from "./boite-equipe";

const fanny = { id: "u-fs", email: "fanny.s@real31.fr", nomComplet: "Fanny S.", initiales: "FS" };
const emmanuel = { id: "u-el", email: "emmanuel.lopes@real31.fr", nomComplet: "Emmanuel Lopes", initiales: "EL" };
const rangement = (id: string, dossierCle: string, conversationId = "conv-" + id, faitLe = "2026-10-29T08:00:00Z"): Partial<EntreeJournalTri> => ({
  internetMessageId: id,
  dossierCle,
  conversationId,
  faitLe,
});

beforeEach(() => {
  etat.repo = new MemoireBoiteEquipeRepository();
  etat.journal = [rangement("<m1@x>", "binome:emmanuel.lopes@real31.fr")];
  etat.absent = false;
});

describe("attribution", () => {
  it("« Je prends » puis « Attribuer à » l'autre membre du binôme, avec l'historique", async () => {
    expect((await prendreMail(fanny, "Syndic4@real31.fr", "<m1@x>")).initiales).toBe("FS");
    expect((await attribuerMail(fanny, BOITE, "<m1@x>", "Emmanuel.Lopes@real31.fr")).nomComplet).toBe("Emmanuel Lopes");
    const etats = await etatEquipeDesMails([{ internetMessageId: "<m1@x>", boite: BOITE }], { lecteur: fanny });
    expect(etats.parMail.get("<m1@x>")?.attributaire?.initiales).toBe("EL");
    expect(etat.repo.historique.map((h) => [h.geste, h.attributaireEmail, h.dossierCle])).toEqual([
      ["prendre", "fanny.s@real31.fr", "binome:emmanuel.lopes@real31.fr"],
      ["attribuer", "emmanuel.lopes@real31.fr", "binome:emmanuel.lopes@real31.fr"],
    ]);
  });

  it("refuse quelqu'un d'une autre équipe ; le comptable seulement en Comptabilité", async () => {
    await expect(attribuerMail(fanny, BOITE, "<m1@x>", "autre@real31.fr")).rejects.toThrow(/pas de l'équipe/);
    await expect(attribuerMail(fanny, BOITE, "<m1@x>", "claire.compta@real31.fr")).rejects.toThrow(/pas de l'équipe/);
    etat.journal = [rangement("<m1@x>", "comptabilite")];
    expect((await attribuerMail(fanny, BOITE, "<m1@x>", "claire.compta@real31.fr")).initiales).toBe("CC");
  });

  it("retirer : non attribué, trace gardée", async () => {
    await prendreMail(fanny, BOITE, "<m1@x>");
    await retirerAttributionMail(emmanuel, BOITE, "<m1@x>");
    expect((await etatEquipeDesMails([{ internetMessageId: "<m1@x>", boite: BOITE }], { lecteur: fanny })).parMail.size).toBe(0);
    expect(etat.repo.historique.at(-1)).toMatchObject({ geste: "retirer", attributaireEmail: null, parEmail: "emmanuel.lopes@real31.fr" });
  });

  it("le mail part en Comptabilité : l'attribution du binôme ne vaut plus", async () => {
    await prendreMail(fanny, BOITE, "<m1@x>");
    const avant = await etatEquipeDesMails([{ internetMessageId: "<m1@x>", boite: BOITE, dossierCle: "comptabilite" }], { lecteur: fanny });
    expect(avant.parMail.get("<m1@x>")).toBeUndefined();
  });
});

describe("attribution automatique à la réponse", () => {
  it("attribue à celui qui répond si personne n'a le mail", async () => {
    expect(await attribuerAuRepondant(emmanuel, BOITE, "<m1@x>")).toBe(true);
    expect(etat.repo.historique.at(-1)).toMatchObject({ geste: "reponse", attributaireEmail: "emmanuel.lopes@real31.fr" });
  });

  it("ne vole pas un mail déjà pris", async () => {
    await prendreMail(fanny, BOITE, "<m1@x>");
    expect(await attribuerAuRepondant(emmanuel, BOITE, "<m1@x>")).toBe(false);
  });

  it("boîte perso, tables absentes : rien, sans erreur", async () => {
    expect(await attribuerAuRepondant(emmanuel, "emmanuel.lopes@real31.fr", "<m1@x>")).toBe(false);
    etat.absent = true;
    expect(await attribuerAuRepondant(emmanuel, BOITE, "<m1@x>")).toBe(false);
  });
});

describe("notes internes", () => {
  it("plusieurs notes, comptées pour la liste ; seul l'auteur modifie ou supprime", async () => {
    const n1 = await ajouterNoteMail(fanny, BOITE, "<m1@x>", " J'ai appelé le président. ");
    await ajouterNoteMail(emmanuel, BOITE, "<m1@x>", "Il passe demain.");
    expect((await notesDuMail("<m1@x>")).map((n) => n.texte)).toEqual(["J'ai appelé le président.", "Il passe demain."]);
    expect((await etatEquipeDesMails([{ internetMessageId: "<m1@x>", boite: BOITE }], { lecteur: fanny })).parMail.get("<m1@x>")?.notes).toBe(2);

    await expect(modifierNoteMail(emmanuel, n1.id, "<m1@x>", "autre")).rejects.toThrow(/Seul l'auteur/);
    await expect(supprimerNoteMail(emmanuel, n1.id, "<m1@x>")).rejects.toThrow(/Seul l'auteur/);
    await expect(modifierNoteMail(fanny, n1.id, "<autre@x>", "x")).rejects.toThrow(/introuvable/);
    await modifierNoteMail(fanny, n1.id, "<m1@x>", "Président rappelé.");
    await supprimerNoteMail(fanny, n1.id, "<m1@x>");
    expect((await notesDuMail("<m1@x>")).map((n) => n.texte)).toEqual(["Il passe demain."]);
  });

  it("la note suit le mail quand il change de boîte", async () => {
    await ajouterNoteMail(fanny, BOITE, "<m1@x>", "à suivre");
    const r = await etatEquipeDesMails([{ internetMessageId: "<m1@x>", boite: "syndic2@real31.fr" }], { lecteur: fanny });
    expect(r.parMail.get("<m1@x>")?.notes).toBe(1);
  });

  it("note vide refusée", async () => {
    await expect(ajouterNoteMail(fanny, BOITE, "<m1@x>", "   ")).rejects.toThrow(/vide/);
  });
});

describe("en attente, de côté, relance", () => {
  it("de côté : hors du chiffre jusqu'à reprise", async () => {
    expect(await mettreEnAttente(fanny, BOITE, "<m1@x>", "de-cote")).toBeNull();
    const r = await etatEquipeDesMails([{ internetMessageId: "<m1@x>", boite: BOITE }], { lecteur: fanny });
    expect(r.parMail.get("<m1@x>")).toMatchObject({ horsATraiter: true, attente: { deCote: true } });
    await reprendreMail(BOITE, "<m1@x>");
    expect((await etatEquipeDesMails([{ internetMessageId: "<m1@x>", boite: BOITE }], { lecteur: fanny })).parMail.size).toBe(0);
  });

  it("attente datée : une réponse dans le fil (journal) la fait revenir", async () => {
    await mettreEnAttente(fanny, BOITE, "<m1@x>", "semaine");
    const dehors = await etatEquipeDesMails([{ internetMessageId: "<m1@x>", boite: BOITE }], { lecteur: fanny });
    expect(dehors.parMail.get("<m1@x>")?.horsATraiter).toBe(true);
    etat.journal.push(rangement("<m2@x>", "binome:emmanuel.lopes@real31.fr", "conv-<m1@x>", new Date(Date.now() + 60_000).toISOString()));
    const revenu = await etatEquipeDesMails([{ internetMessageId: "<m1@x>", boite: BOITE }], { lecteur: fanny });
    expect(revenu.parMail.get("<m1@x>")).toMatchObject({ horsATraiter: false, attente: { statut: "a-traiter", motif: "reponse" } });
  });

  it("relance d'un envoi : listée pour le binôme, due à la date", async () => {
    await relancerSiPasDeReponse(emmanuel, { boite: BOITE, internetMessageId: "<envoi@x>", conversationId: "conv-e", envoyeLe: "2026-10-28T10:00:00Z", choix: "demain" });
    const dans10j = new Date(Date.now() + 10 * 86_400_000);
    const pourFanny = await relancesDesBoites([{ id: BOITE, personnelle: false }], { lecteur: fanny, maintenant: dans10j });
    expect(pourFanny?.map((r) => [r.internetMessageId, r.statut])).toEqual([["<envoi@x>", "a-traiter"]]);
    const pourAutre = await relancesDesBoites([{ id: BOITE, personnelle: false }], { lecteur: { email: "autre@real31.fr" }, maintenant: dans10j });
    expect(pourAutre).toEqual([]);
  });

  it("relance sans date refusée", async () => {
    await expect(
      relancerSiPasDeReponse(emmanuel, { boite: BOITE, internetMessageId: "<e@x>", conversationId: "c", envoyeLe: "2026-10-28T10:00:00Z", choix: { jour: "2020-01-01" } }),
    ).rejects.toThrow(/demain/);
  });
});

describe("dégradation sans les tables", () => {
  it("état agrégé inactif, aucune erreur", async () => {
    etat.absent = true;
    expect(await etatEquipeDesMails([{ internetMessageId: "<m1@x>", boite: BOITE }], { lecteur: fanny })).toEqual({ actif: false, parMail: new Map() });
  });
});
