import { describe, expect, it } from "vitest";
import {
  ecartJours,
  etatTrousseau,
  joursDeRetard,
  joursDehors,
  libelleDuree,
  plusJours,
  reservationExpiree,
  verifierReservation,
  verifierRetour,
  verifierSortie,
} from "./etat";
import type { Entreprise, Pret, Reservation } from "./types";

const AUJ = "2026-09-18";

function pret(over: Partial<Pret> = {}): Pret {
  return {
    id: "p1",
    trousseauId: "t1",
    type: "entreprise",
    entrepriseId: "e1",
    entrepriseNom: "CTH",
    composition: [],
    sortiLeISO: "2026-09-15T09:00:00.000Z",
    sortiParNom: "Neis L.",
    retourPrevuLeISO: "2026-09-16",
    ...over,
  };
}

function resa(over: Partial<Reservation> = {}): Reservation {
  return {
    id: "r1",
    trousseauId: "t1",
    entrepriseId: "e2",
    entrepriseNom: "ABSOLU SERVICES",
    debutISO: "2026-09-18",
    finPrevueISO: "2026-09-18",
    origine: "interne",
    statut: "prevue",
    creeParNom: "Natacha P.",
    creeLeISO: "2026-09-10",
    ...over,
  };
}

const CTH: Pick<Entreprise, "id" | "nom" | "statut" | "motifBlocage"> = { id: "e1", nom: "CTH", statut: "active" };

describe("dates", () => {
  it("ajoute des jours sans fuseau", () => {
    expect(plusJours("2026-09-18", 1)).toBe("2026-09-19");
    expect(plusJours("2026-12-31", 1)).toBe("2027-01-01");
    expect(ecartJours("2026-09-16", "2026-09-18")).toBe(2);
  });
});

describe("etatTrousseau (derive, jamais stocke)", () => {
  it("en agence sans pret ni reservation", () => {
    expect(etatTrousseau({}, null, [], AUJ)).toBe("en_agence");
  });
  it("sorti quand un pret est ouvert dans les temps", () => {
    expect(etatTrousseau({}, pret({ retourPrevuLeISO: "2026-09-20" }), [], AUJ)).toBe("sorti");
  });
  it("en retard des le lendemain de la date prevue", () => {
    expect(etatTrousseau({}, pret({ retourPrevuLeISO: "2026-09-18" }), [], AUJ)).toBe("sorti");
    expect(etatTrousseau({}, pret({ retourPrevuLeISO: "2026-09-17" }), [], AUJ)).toBe("en_retard");
    expect(joursDeRetard(pret({ retourPrevuLeISO: "2026-09-16" }), AUJ)).toBe(2);
  });
  it("un pret clos ne compte plus", () => {
    expect(etatTrousseau({}, pret({ renduLeISO: "2026-09-17T10:00:00Z" }), [], AUJ)).toBe("en_agence");
    expect(joursDeRetard(pret({ renduLeISO: "2026-09-17T10:00:00Z" }), AUJ)).toBe(0);
  });
  it("reserve si une reservation prevue commence aujourd'hui ou demain, pas apres", () => {
    expect(etatTrousseau({}, null, [resa({ debutISO: "2026-09-18" })], AUJ)).toBe("reserve");
    expect(etatTrousseau({}, null, [resa({ debutISO: "2026-09-19", finPrevueISO: "2026-09-19" })], AUJ)).toBe("reserve");
    expect(etatTrousseau({}, null, [resa({ debutISO: "2026-09-25", finPrevueISO: "2026-09-25" })], AUJ)).toBe("en_agence");
    expect(etatTrousseau({}, null, [resa({ statut: "annulee" })], AUJ)).toBe("en_agence");
  });
  it("la marque prime sur tout", () => {
    expect(etatTrousseau({ marque: "introuvable" }, pret(), [], AUJ)).toBe("introuvable");
    expect(etatTrousseau({ marque: "retire" }, null, [resa()], AUJ)).toBe("retire");
  });
  it("une reservation expiree est derivee, pas stockee", () => {
    expect(reservationExpiree(resa({ debutISO: "2026-09-17", finPrevueISO: "2026-09-17" }), AUJ)).toBe(true);
    expect(reservationExpiree(resa({ debutISO: "2026-09-18" }), AUJ)).toBe(false);
    expect(reservationExpiree(resa({ debutISO: "2026-09-17", statut: "convertie" }), AUJ)).toBe(false);
  });
});

describe("verifierSortie", () => {
  const base = { trousseau: { numero: "R004" }, pretOuvert: null, reservations: [], entreprise: CTH, type: "entreprise" as const, retourPrevuLeISO: AUJ, aujourdhuiISO: AUJ };
  it("refuse un trousseau deja sorti, retire ou introuvable", () => {
    expect(verifierSortie({ ...base, pretOuvert: pret() }).raison).toMatch(/déjà sorti chez CTH/);
    expect(verifierSortie({ ...base, trousseau: { numero: "R004", marque: "retire" } }).autorise).toBe(false);
    expect(verifierSortie({ ...base, trousseau: { numero: "R004", marque: "introuvable" } }).raison).toMatch(/introuvable/);
  });
  it("refuse une date de retour passee ou illisible", () => {
    expect(verifierSortie({ ...base, retourPrevuLeISO: "2026-09-17" }).raison).toMatch(/passé/);
    expect(verifierSortie({ ...base, retourPrevuLeISO: "18/09/2026" }).raison).toMatch(/illisible/);
  });
  it("exige une entreprise pour un pret entreprise, aucune pour un pret interne", () => {
    expect(verifierSortie({ ...base, entreprise: null }).raison).toMatch(/Choisis l'entreprise/);
    expect(verifierSortie({ ...base, type: "interne" }).raison).toMatch(/interne/);
    expect(verifierSortie({ ...base, type: "interne", entreprise: null }).autorise).toBe(true);
  });
  it("entreprise bloquee : refus, sauf direction qui confirme", () => {
    const bloquee = { ...CTH, statut: "bloquee" as const, motifBlocage: "clés perdues en 2025" };
    expect(verifierSortie({ ...base, entreprise: bloquee }).raison).toMatch(/bloquée \(clés perdues en 2025\)/);
    const v = verifierSortie({ ...base, entreprise: bloquee, direction: true });
    expect(v.autorise).toBe(false);
    expect(v.confirmable).toBe(true);
    expect(verifierSortie({ ...base, entreprise: bloquee, direction: true, confirme: true }).autorise).toBe(true);
  });
  it("une autre entreprise a reserve aujourd'hui : avertissement confirmable", () => {
    const v = verifierSortie({ ...base, reservations: [resa()] });
    expect(v.autorise).toBe(false);
    expect(v.avertissement).toMatch(/réservé aujourd'hui par ABSOLU SERVICES/);
    expect(verifierSortie({ ...base, reservations: [resa()], confirme: true }).autorise).toBe(true);
    // La meme entreprise : pas d'avertissement.
    expect(verifierSortie({ ...base, reservations: [resa({ entrepriseId: "e1" })] }).autorise).toBe(true);
    // Reservation d'un autre jour : rien.
    expect(verifierSortie({ ...base, reservations: [resa({ debutISO: "2026-09-20", finPrevueISO: "2026-09-20" })] }).autorise).toBe(true);
  });
});

describe("verifierReservation", () => {
  const base = { trousseau: { numero: "R004" }, pretOuvert: null, reservations: [], debutISO: "2026-09-20", finPrevueISO: "2026-09-21", aujourdhuiISO: AUJ };
  it("accepte une periode libre", () => {
    expect(verifierReservation(base).autorise).toBe(true);
  });
  it("refuse le passe, une fin avant le debut, un retire", () => {
    expect(verifierReservation({ ...base, debutISO: "2026-09-17", finPrevueISO: "2026-09-17" }).raison).toMatch(/passé/);
    expect(verifierReservation({ ...base, finPrevueISO: "2026-09-19" }).raison).toMatch(/précède/);
    expect(verifierReservation({ ...base, trousseau: { numero: "R004", marque: "retire" } }).autorise).toBe(false);
  });
  it("refuse un chevauchement avec une reservation prevue, pas avec une annulee", () => {
    const r = resa({ debutISO: "2026-09-21", finPrevueISO: "2026-09-22" });
    expect(verifierReservation({ ...base, reservations: [r] }).raison).toMatch(/déjà réservé du 21\/09\/2026 au 22\/09\/2026 par ABSOLU SERVICES/);
    expect(verifierReservation({ ...base, reservations: [{ ...r, statut: "annulee" }] }).autorise).toBe(true);
    expect(verifierReservation({ ...base, reservations: [r], reservationId: "r1" }).autorise).toBe(true);
  });
  it("avertit sans bloquer si le trousseau est sorti avec un retour prevu apres le debut", () => {
    const v = verifierReservation({ ...base, pretOuvert: pret({ retourPrevuLeISO: "2026-09-25" }) });
    expect(v.autorise).toBe(true);
    expect(v.avertissement).toMatch(/sorti chez CTH, retour prévu le 25\/09\/2026/);
    expect(verifierReservation({ ...base, pretOuvert: pret({ retourPrevuLeISO: "2026-09-19" }) }).avertissement).toBeUndefined();
  });
});

describe("verifierRetour et durees", () => {
  it("refuse sans pret ouvert, exige un commentaire si non conforme", () => {
    expect(verifierRetour({ pretOuvert: null, conformite: "complet" }).autorise).toBe(false);
    expect(verifierRetour({ pretOuvert: pret(), conformite: "incomplet" }).raison).toMatch(/commentaire/);
    expect(verifierRetour({ pretOuvert: pret(), conformite: "incomplet", commentaire: "manque le bip" }).autorise).toBe(true);
    expect(verifierRetour({ pretOuvert: pret(), conformite: "complet" }).autorise).toBe(true);
  });
  it("compte les jours dehors", () => {
    expect(joursDehors(pret({ sortiLeISO: "2026-09-15T09:00:00Z" }), AUJ)).toBe(3);
    expect(joursDehors(pret({ sortiLeISO: "2026-09-15T09:00:00Z", renduLeISO: "2026-09-15T16:00:00Z" }), AUJ)).toBe(0);
    expect(libelleDuree(0)).toBe("le jour même");
    expect(libelleDuree(1)).toBe("1 jour");
    expect(libelleDuree(25)).toBe("25 jours");
    expect(libelleDuree(437)).toBe("15 mois");
  });
});
