import { beforeEach, describe, expect, it, vi } from "vitest";
import { MockClesEntrepriseRepository, MockClesRepository } from "@/lib/adapters/mock/mock-cles-repository";

const etat = vi.hoisted(() => ({ repo: null as unknown as MockClesRepository, entreprises: null as unknown as MockClesEntrepriseRepository }));

vi.mock("@/lib/adapters/router", () => ({
  getClesRepository: () => etat.repo,
  getClesEntrepriseRepository: () => etat.entreprises,
  getClesPhotoStore: () => ({ urlSignee: async () => null, televerser: async () => {} }),
  getCoproRepository: () => ({ listerToutes: async () => [{ code: "S004", nom: "BLEUETS6", adresse: { ligne1: "6 rue des Bleuets", ville: "La Garenne-Colombes" } }] }),
}));

import { annulerReservation, corrigerPret, enregistrerRetour, marquer, prolonger, reserver, sortir } from "./comptoir";
import { creerEntreprise, creerTrousseau } from "./referentiel";
import { ficheEntreprise, indexRecherche, tableauDeBord, trousseauxDeCopro, vueTrousseaux } from "./lecture";
import type { Acteur } from "./contexte";

const AUJ = "2026-09-18";
const NEIS: Acteur = { id: "u1", nom: "Neis L.", agence: "LGC", profil: { email: "neis@real31.fr", roleTable: "ASSISTANT" } };
const ML: Acteur = { id: "u2", nom: "Isa M.", agence: "ML", profil: { email: "isa@real31.fr", roleTable: "GESTIONNAIRE" } };
const DIRECTION: Acteur = { id: "u3", nom: "Sekou K.", agence: "LGC", profil: { email: "sekou@real31.fr", roleTable: "ADMIN" } };

async function jeu() {
  const t = await creerTrousseau({ numero: "r4", libelle: "Accès total", emplacement: "t004", composition: [{ type: "cle", libelle: "hall", quantite: 2 }], acces: [{ bien: { type: "copro", code: "s004" }, types: ["total"], libelle: "Accès total", ordre: 0 }] }, NEIS);
  const cth = await creerEntreprise({ nom: "CTH", contacts: [{ nom: "M. Martin", telephone: "0600000000", principal: true }] }, NEIS);
  const absolu = await creerEntreprise({ nom: "Absolu Services" }, NEIS);
  return { t, cth, absolu };
}

beforeEach(() => {
  etat.repo = new MockClesRepository();
  etat.entreprises = new MockClesEntrepriseRepository(etat.repo.nomsEntreprises);
  vi.stubEnv("SUPER_ADMINS", "");
});

describe("referentiel", () => {
  it("canonise le numero et la copro, garde un mouvement de creation", async () => {
    const { t } = await jeu();
    expect(t.numero).toBe("R004");
    expect(t.emplacement).toBe("T004");
    expect(t.acces[0].bien).toEqual({ type: "copro", code: "S004" });
    expect(etat.repo.mouvements.map((m) => m.type)).toEqual(["creation"]);
  });
  it("refuse un doublon de numero et un doublon d'entreprise", async () => {
    await jeu();
    await expect(creerTrousseau({ numero: "R004", libelle: "", composition: [], acces: [{ bien: { type: "copro", code: "S004" }, types: [], libelle: "", ordre: 0 }] }, NEIS)).rejects.toThrow(/existe déjà/);
    await expect(creerEntreprise({ nom: "cth" }, NEIS)).rejects.toThrow(/« CTH » existe déjà/);
  });
  it("une autre agence ne cree pas dans LGC", async () => {
    await expect(creerTrousseau({ agenceCode: "LGC", numero: "R001", libelle: "", composition: [], acces: [{ bien: { type: "copro", code: "S004" }, types: [], libelle: "", ordre: 0 }] }, ML)).rejects.toThrow(/autre agence/);
  });
});

describe("comptoir : sortir, rendre", () => {
  it("sortie -> pret ouvert, snapshot de composition et de contact, mouvement", async () => {
    const { t, cth } = await jeu();
    const r = await sortir({ trousseauId: t.id, type: "entreprise", entrepriseId: cth.id, retourPrevuLeISO: AUJ, aujourdhuiISO: AUJ }, NEIS);
    expect("pret" in r).toBe(true);
    const pret = "pret" in r ? r.pret : null;
    expect(pret?.composition).toEqual([{ type: "cle", libelle: "hall", quantite: 2 }]);
    expect(pret?.contact?.nom).toBe("M. Martin");
    expect(pret?.entrepriseNom).toBe("CTH");
    const vue = await vueTrousseaux("LGC", AUJ);
    expect(vue[0].etat).toBe("sorti");
    expect(etat.repo.mouvements.at(-1)).toMatchObject({ type: "sortie", entrepriseId: cth.id, pretId: pret?.id, parNom: "Neis L." });
  });
  it("le pret ouvert precede le mouvement (ordre d'ecriture fixe)", async () => {
    const { t, cth } = await jeu();
    const ordre: string[] = [];
    const creer = etat.repo.creerPret.bind(etat.repo);
    const ajouter = etat.repo.ajouterMouvement.bind(etat.repo);
    etat.repo.creerPret = async (p) => { ordre.push("pret"); return creer(p); };
    etat.repo.ajouterMouvement = async (m) => { ordre.push("mouvement"); return ajouter(m); };
    await sortir({ trousseauId: t.id, type: "entreprise", entrepriseId: cth.id, retourPrevuLeISO: AUJ, aujourdhuiISO: AUJ }, NEIS);
    expect(ordre).toEqual(["pret", "mouvement"]);
  });
  it("refuse une seconde sortie et une sortie par une autre agence", async () => {
    const { t, cth } = await jeu();
    await sortir({ trousseauId: t.id, type: "entreprise", entrepriseId: cth.id, retourPrevuLeISO: AUJ, aujourdhuiISO: AUJ }, NEIS);
    await expect(sortir({ trousseauId: t.id, type: "entreprise", entrepriseId: cth.id, retourPrevuLeISO: AUJ, aujourdhuiISO: AUJ }, NEIS)).rejects.toThrow(/déjà sorti chez CTH/);
    await expect(sortir({ trousseauId: t.id, type: "interne", retourPrevuLeISO: AUJ, aujourdhuiISO: AUJ }, ML)).rejects.toThrow(/autre agence/);
  });
  it("retour : cloture, conformite, jours dehors, puis le trousseau est de nouveau en agence", async () => {
    const { t, cth } = await jeu();
    await sortir({ trousseauId: t.id, type: "entreprise", entrepriseId: cth.id, retourPrevuLeISO: AUJ, aujourdhuiISO: AUJ }, NEIS);
    await expect(enregistrerRetour({ trousseauId: t.id, conformite: "incomplet", aujourdhuiISO: AUJ }, NEIS)).rejects.toThrow(/commentaire/);
    const clos = await enregistrerRetour({ trousseauId: t.id, conformite: "incomplet", commentaire: "manque une clé", aujourdhuiISO: AUJ }, NEIS);
    expect(clos.renduLeISO).toBeTruthy();
    expect(clos.recuParNom).toBe("Neis L.");
    expect((await vueTrousseaux("LGC", AUJ))[0].etat).toBe("en_agence");
    expect(etat.repo.mouvements.at(-1)).toMatchObject({ type: "retour", details: { conformite: "incomplet", commentaire: "manque une clé" } });
    await expect(enregistrerRetour({ trousseauId: t.id, conformite: "complet", aujourdhuiISO: AUJ }, NEIS)).rejects.toThrow(/pas sorti/);
  });
  it("retard derive : sorti avec retour prevu hier -> en_retard, la fiche entreprise le compte", async () => {
    const { t, cth } = await jeu();
    await sortir({ trousseauId: t.id, type: "entreprise", entrepriseId: cth.id, retourPrevuLeISO: "2026-09-17", aujourdhuiISO: "2026-09-16" }, NEIS);
    const tb = await tableauDeBord("LGC", AUJ);
    expect(tb.enRetard).toHaveLength(1);
    expect(tb.enRetard[0].joursRetard).toBe(1);
    expect(tb.compteurs).toMatchObject({ total: 1, sortis: 1, enRetard: 1, enAgence: 0 });
    const fe = await ficheEntreprise(cth.id, AUJ);
    expect(fe?.detenus).toHaveLength(1);
    expect(fe?.enRetard).toBe(1);
  });
  it("pret interne : sans entreprise", async () => {
    const { t, cth } = await jeu();
    await expect(sortir({ trousseauId: t.id, type: "interne", entrepriseId: cth.id, retourPrevuLeISO: AUJ, aujourdhuiISO: AUJ }, NEIS)).rejects.toThrow(/interne/);
    const r = await sortir({ trousseauId: t.id, type: "interne", contact: { nom: "Julie B." }, retourPrevuLeISO: AUJ, aujourdhuiISO: AUJ }, NEIS);
    expect("pret" in r && r.pret.type).toBe("interne");
  });
});

describe("comptoir : reserver", () => {
  it("reservation puis sortie pre-remplie qui la convertit", async () => {
    const { t, cth } = await jeu();
    const { reservation } = await reserver({ trousseauId: t.id, entrepriseId: cth.id, debutISO: AUJ, finPrevueISO: AUJ, motif: "fuite", aujourdhuiISO: AUJ }, NEIS);
    expect((await vueTrousseaux("LGC", AUJ))[0].etat).toBe("reserve");
    const r = await sortir({ trousseauId: t.id, type: "entreprise", entrepriseId: cth.id, retourPrevuLeISO: AUJ, aujourdhuiISO: AUJ }, NEIS);
    const pret = "pret" in r ? r.pret : null;
    expect(pret?.reservationId).toBe(reservation.id);
    expect(pret?.motif).toBe("fuite");
    expect((await etat.repo.getReservation(reservation.id))?.statut).toBe("convertie");
  });
  it("une autre entreprise a reserve aujourd'hui : confirmation demandee, puis sortie confirmee", async () => {
    const { t, cth, absolu } = await jeu();
    await reserver({ trousseauId: t.id, entrepriseId: absolu.id, debutISO: AUJ, finPrevueISO: AUJ, aujourdhuiISO: AUJ }, NEIS);
    const r = await sortir({ trousseauId: t.id, type: "entreprise", entrepriseId: cth.id, retourPrevuLeISO: AUJ, aujourdhuiISO: AUJ }, NEIS);
    expect(r).toMatchObject({ confirmationRequise: expect.stringMatching(/réservé aujourd'hui par Absolu Services/) });
    expect(etat.repo.prets).toHaveLength(0);
    const r2 = await sortir({ trousseauId: t.id, type: "entreprise", entrepriseId: cth.id, retourPrevuLeISO: AUJ, aujourdhuiISO: AUJ, confirme: true }, NEIS);
    expect("pret" in r2).toBe(true);
    // La reservation d'Absolu reste prevue (elle n'a pas ete consommee).
    expect(etat.repo.reservations[0].statut).toBe("prevue");
  });
  it("chevauchement refuse, annulation avec motif", async () => {
    const { t, cth, absolu } = await jeu();
    const { reservation } = await reserver({ trousseauId: t.id, entrepriseId: cth.id, debutISO: "2026-09-20", finPrevueISO: "2026-09-22", aujourdhuiISO: AUJ }, NEIS);
    await expect(reserver({ trousseauId: t.id, entrepriseId: absolu.id, debutISO: "2026-09-22", finPrevueISO: "2026-09-23", aujourdhuiISO: AUJ }, NEIS)).rejects.toThrow(/déjà réservé du 20\/09\/2026 au 22\/09\/2026 par CTH/);
    await expect(annulerReservation({ reservationId: reservation.id, motif: " " }, NEIS)).rejects.toThrow(/motif/);
    await annulerReservation({ reservationId: reservation.id, motif: "intervention reportée" }, NEIS);
    expect((await reserver({ trousseauId: t.id, entrepriseId: absolu.id, debutISO: "2026-09-22", finPrevueISO: "2026-09-23", aujourdhuiISO: AUJ }, NEIS)).reservation.statut).toBe("prevue");
  });
  it("reservation demain sur un trousseau sorti : avertissement et conflit au tableau de bord", async () => {
    const { t, cth, absolu } = await jeu();
    await sortir({ trousseauId: t.id, type: "entreprise", entrepriseId: cth.id, retourPrevuLeISO: "2026-09-25", aujourdhuiISO: AUJ }, NEIS);
    const { avertissement } = await reserver({ trousseauId: t.id, entrepriseId: absolu.id, debutISO: "2026-09-19", finPrevueISO: "2026-09-19", aujourdhuiISO: AUJ }, NEIS);
    expect(avertissement).toMatch(/sorti chez CTH, retour prévu le 25\/09\/2026/);
    const tb = await tableauDeBord("LGC", AUJ);
    expect(tb.conflits).toHaveLength(1);
    expect(tb.reservationsAVenir).toHaveLength(1);
  });
});

describe("comptoir : prolonger, marquer, corriger", () => {
  it("prolonge avec trace avant/apres", async () => {
    const { t, cth } = await jeu();
    await sortir({ trousseauId: t.id, type: "entreprise", entrepriseId: cth.id, retourPrevuLeISO: AUJ, aujourdhuiISO: AUJ }, NEIS);
    await expect(prolonger({ trousseauId: t.id, retourPrevuLeISO: AUJ, aujourdhuiISO: AUJ }, NEIS)).rejects.toThrow(/déjà la date/);
    const p = await prolonger({ trousseauId: t.id, retourPrevuLeISO: "2026-09-25", motif: "chantier", aujourdhuiISO: AUJ }, NEIS);
    expect(p.retourPrevuLeISO).toBe("2026-09-25");
    expect(etat.repo.mouvements.at(-1)).toMatchObject({ type: "prolongation", details: { avant: AUJ, retourPrevuLeISO: "2026-09-25", motif: "chantier" } });
  });
  it("introuvable / retrouve par l'equipe ; retire par la direction seule et sans pret ouvert", async () => {
    const { t, cth } = await jeu();
    await marquer({ trousseauId: t.id, marquage: "introuvable", motif: "pas dans le tiroir" }, NEIS);
    expect((await vueTrousseaux("LGC", AUJ))[0].etat).toBe("introuvable");
    await expect(sortir({ trousseauId: t.id, type: "interne", retourPrevuLeISO: AUJ, aujourdhuiISO: AUJ }, NEIS)).rejects.toThrow(/introuvable/);
    await marquer({ trousseauId: t.id, marquage: "retrouve" }, NEIS);
    expect((await vueTrousseaux("LGC", AUJ))[0].etat).toBe("en_agence");
    await expect(marquer({ trousseauId: t.id, marquage: "retire" }, NEIS)).rejects.toThrow(/direction/);
    await sortir({ trousseauId: t.id, type: "entreprise", entrepriseId: cth.id, retourPrevuLeISO: AUJ, aujourdhuiISO: AUJ }, NEIS);
    await expect(marquer({ trousseauId: t.id, marquage: "retire" }, DIRECTION)).rejects.toThrow(/prêt est ouvert/);
    await enregistrerRetour({ trousseauId: t.id, conformite: "complet", aujourdhuiISO: AUJ }, DIRECTION);
    await marquer({ trousseauId: t.id, marquage: "retire", motif: "copro perdue" }, DIRECTION);
    expect((await vueTrousseaux("LGC", AUJ))[0].etat).toBe("retire");
    expect((await indexRecherche("LGC", AUJ)).some((e) => e.kind === "trousseau")).toBe(false);
  });
  it("corriger : direction, motif, l'original reste et la correction le reference", async () => {
    const { t, cth } = await jeu();
    const r = await sortir({ trousseauId: t.id, type: "entreprise", entrepriseId: cth.id, retourPrevuLeISO: AUJ, aujourdhuiISO: AUJ }, NEIS);
    const pret = "pret" in r ? r.pret : null;
    await expect(corrigerPret({ pretId: pret!.id, champ: "retourPrevuLeISO", valeur: "2026-09-20", motif: "erreur de saisie" }, NEIS)).rejects.toThrow(/direction/);
    await expect(corrigerPret({ pretId: pret!.id, champ: "retourPrevuLeISO", valeur: "2026-09-20", motif: "" }, DIRECTION)).rejects.toThrow(/motif/);
    await corrigerPret({ pretId: pret!.id, champ: "retourPrevuLeISO", valeur: "2026-09-20", motif: "erreur de saisie" }, DIRECTION);
    expect((await etat.repo.getPret(pret!.id))?.retourPrevuLeISO).toBe("2026-09-20");
    const sortie = etat.repo.mouvements.find((m) => m.type === "sortie")!;
    const correction = etat.repo.mouvements.at(-1)!;
    expect(correction).toMatchObject({ type: "correction", corrigeId: sortie.id, details: { champ: "retourPrevuLeISO", avant: AUJ, apres: "2026-09-20", motif: "erreur de saisie" } });
    expect(etat.repo.mouvements.filter((m) => m.type === "sortie")).toHaveLength(1);
  });
});

describe("lectures", () => {
  it("les trousseaux d'une copro et l'index de recherche portent le nom du referentiel", async () => {
    await jeu();
    const parCopro = await trousseauxDeCopro("S004", AUJ);
    expect(parCopro).toHaveLength(1);
    expect(parCopro[0].biens[0]).toMatchObject({ coproCode: "S004", libelle: "BLEUETS6", adresse: "6 rue des Bleuets, La Garenne-Colombes" });
    const index = await indexRecherche("LGC", AUJ);
    expect(index.map((e) => e.kind).sort()).toEqual(["copro", "entreprise", "entreprise", "trousseau"]);
    expect(index.find((e) => e.kind === "trousseau")).toMatchObject({ numero: "R004", biens: expect.stringContaining("BLEUETS6") });
  });
});
