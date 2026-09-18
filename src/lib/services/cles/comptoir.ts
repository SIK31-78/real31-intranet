// Les gestes du comptoir (ADR-040) : reserver, sortir, enregistrer le retour, prolonger,
// annuler, marquer, corriger. Chaque geste : garde d'agence, verdict du domaine, ecriture
// de la ligne d'etat PUIS du mouvement (ordre fixe, cf. ADR-040 : pas de transaction
// multi-tables en supabase-js ; un pret sans mouvement se voit au controle direction).
//
// Un refus METIER se dit par une Error au message francais (rendu tel quel par l'action, cf. resultat.ts) ; un avertissement
// confirmable est RENDU (`confirmationRequise`) pour que l'ecran redemande.

import { getClesEntrepriseRepository, getClesRepository } from "@/lib/adapters/router";
import { joursDehors, reservationCouvre, reservationImminente, verifierReservation, verifierRetour, verifierSortie } from "@/lib/domain/cles/etat";
import type { ConformiteRetour, Contact, Marque, Pret, Reservation, Trousseau } from "@/lib/domain/cles/types";
import { estDirectionCles, MESSAGE_HORS_AGENCE, MESSAGE_RESERVE_DIRECTION_CLES, peutOperer, type Acteur } from "./contexte";

async function trousseauOperable(id: string, acteur: Acteur): Promise<Trousseau> {
  const t = await getClesRepository().getTrousseau(id);
  if (!t) throw new Error("Trousseau introuvable.");
  if (!peutOperer(acteur, t.agenceCode)) throw new Error(MESSAGE_HORS_AGENCE);
  return t;
}

function contactPrincipal(contacts: Contact[]): Contact | undefined {
  return contacts.find((c) => c.principal) ?? contacts[0];
}

export interface SortieInput {
  trousseauId: string;
  type: "entreprise" | "interne";
  entrepriseId?: string;
  contact?: Contact;
  retourPrevuLeISO: string;
  motif?: string;
  reservationId?: string;
  confirme?: boolean;
  aujourdhuiISO: string;
}

export type ResultatSortie = { pret: Pret } | { confirmationRequise: string };

export async function sortir(input: SortieInput, acteur: Acteur): Promise<ResultatSortie> {
  const repo = getClesRepository();
  const t = await trousseauOperable(input.trousseauId, acteur);
  const [pretOuvert, reservations, entreprise] = await Promise.all([
    repo.getPretOuvert(t.id),
    repo.listerReservations({ trousseauId: t.id, statut: "prevue" }),
    input.entrepriseId ? getClesEntrepriseRepository().get(input.entrepriseId) : Promise.resolve(null),
  ]);
  if (input.entrepriseId && !entreprise) throw new Error("Entreprise introuvable.");
  const verdict = verifierSortie({
    trousseau: t,
    pretOuvert,
    reservations,
    entreprise,
    type: input.type,
    retourPrevuLeISO: input.retourPrevuLeISO,
    aujourdhuiISO: input.aujourdhuiISO,
    confirme: input.confirme,
    direction: estDirectionCles(acteur, t.agenceCode),
  });
  if (!verdict.autorise) {
    if (verdict.avertissement && verdict.confirmable) return { confirmationRequise: verdict.avertissement };
    throw new Error(verdict.raison ?? verdict.avertissement ?? "Sortie refusée.");
  }
  // La reservation consommee : celle qu'on designe, sinon celle de la meme entreprise qui
  // couvre aujourd'hui ou commence demain.
  let reservation: Reservation | undefined = input.reservationId ? reservations.find((r) => r.id === input.reservationId) : undefined;
  if (!reservation && entreprise) {
    reservation = reservations.find((r) => r.entrepriseId === entreprise.id && (reservationCouvre(r, input.aujourdhuiISO) || reservationImminente(r, input.aujourdhuiISO)));
  }
  const contact = input.contact ?? reservation?.contact ?? (entreprise ? contactPrincipal(entreprise.contacts) : undefined);
  const pret = await repo.creerPret({
    trousseauId: t.id,
    type: input.type,
    ...(entreprise ? { entrepriseId: entreprise.id } : {}),
    ...(contact ? { contact } : {}),
    composition: t.composition,
    ...(reservation ? { reservationId: reservation.id } : {}),
    ...(input.motif?.trim() ? { motif: input.motif.trim() } : reservation?.motif ? { motif: reservation.motif } : {}),
    sortiLeISO: new Date().toISOString(),
    sortiParId: acteur.id,
    sortiParNom: acteur.nom,
    retourPrevuLeISO: input.retourPrevuLeISO,
  });
  if (reservation) await repo.sauverReservation({ ...reservation, statut: "convertie", pretId: pret.id });
  await repo.ajouterMouvement({
    trousseauId: t.id,
    type: "sortie",
    parUserId: acteur.id,
    parNom: acteur.nom,
    agenceCode: t.agenceCode,
    ...(entreprise ? { entrepriseId: entreprise.id } : {}),
    pretId: pret.id,
    ...(reservation ? { reservationId: reservation.id } : {}),
    details: {
      type: input.type,
      entrepriseNom: entreprise?.nom,
      contactNom: contact?.nom,
      retourPrevuLeISO: input.retourPrevuLeISO,
      motif: pret.motif,
      ...(verdict.avertissement ? { confirme: verdict.avertissement } : {}),
    },
  });
  return { pret: { ...pret, ...(entreprise ? { entrepriseNom: entreprise.nom } : {}) } };
}

export interface RetourInput {
  trousseauId: string;
  conformite: ConformiteRetour;
  commentaire?: string;
  photoChemin?: string;
  aujourdhuiISO: string;
}

export async function enregistrerRetour(input: RetourInput, acteur: Acteur): Promise<Pret> {
  const repo = getClesRepository();
  const t = await trousseauOperable(input.trousseauId, acteur);
  const pretOuvert = await repo.getPretOuvert(t.id);
  const verdict = verifierRetour({ pretOuvert, conformite: input.conformite, commentaire: input.commentaire });
  if (!verdict.autorise || !pretOuvert) throw new Error(verdict.raison ?? "Retour refusé.");
  const maintenant = new Date().toISOString();
  const clos: Pret = {
    ...pretOuvert,
    renduLeISO: maintenant,
    recuParId: acteur.id,
    recuParNom: acteur.nom,
    retourConforme: input.conformite,
    ...(input.commentaire?.trim() ? { commentaireRetour: input.commentaire.trim() } : {}),
    ...(input.photoChemin ? { photoRetourChemin: input.photoChemin } : {}),
  };
  await repo.sauverPret(clos);
  await repo.ajouterMouvement({
    trousseauId: t.id,
    type: "retour",
    parUserId: acteur.id,
    parNom: acteur.nom,
    agenceCode: t.agenceCode,
    ...(pretOuvert.entrepriseId ? { entrepriseId: pretOuvert.entrepriseId } : {}),
    pretId: pretOuvert.id,
    details: {
      entrepriseNom: pretOuvert.entrepriseNom,
      conformite: input.conformite,
      commentaire: clos.commentaireRetour,
      joursDehors: joursDehors(clos, input.aujourdhuiISO),
      retourPrevuLeISO: pretOuvert.retourPrevuLeISO,
      enRetard: maintenant.slice(0, 10) > pretOuvert.retourPrevuLeISO,
    },
  });
  return clos;
}

export interface ReservationInput {
  trousseauId: string;
  entrepriseId: string;
  contact?: Contact;
  debutISO: string;
  finPrevueISO: string;
  motif?: string;
  aujourdhuiISO: string;
}

export async function reserver(input: ReservationInput, acteur: Acteur): Promise<{ reservation: Reservation; avertissement?: string }> {
  const repo = getClesRepository();
  const t = await trousseauOperable(input.trousseauId, acteur);
  const [pretOuvert, reservations, entreprise] = await Promise.all([
    repo.getPretOuvert(t.id),
    repo.listerReservations({ trousseauId: t.id, statut: "prevue" }),
    getClesEntrepriseRepository().get(input.entrepriseId),
  ]);
  if (!entreprise) throw new Error("Entreprise introuvable.");
  if (entreprise.statut === "bloquee" && !estDirectionCles(acteur, t.agenceCode)) {
    throw new Error(`${entreprise.nom} est bloquée${entreprise.motifBlocage ? ` (${entreprise.motifBlocage})` : ""} : seule la direction peut lui réserver un trousseau.`);
  }
  const verdict = verifierReservation({ trousseau: t, pretOuvert, reservations, debutISO: input.debutISO, finPrevueISO: input.finPrevueISO, aujourdhuiISO: input.aujourdhuiISO });
  if (!verdict.autorise) throw new Error(verdict.raison ?? "Réservation refusée.");
  const contact = input.contact ?? contactPrincipal(entreprise.contacts);
  const reservation = await repo.creerReservation({
    trousseauId: t.id,
    entrepriseId: entreprise.id,
    ...(contact ? { contact } : {}),
    debutISO: input.debutISO,
    finPrevueISO: input.finPrevueISO,
    ...(input.motif?.trim() ? { motif: input.motif.trim() } : {}),
    origine: "interne",
    statut: "prevue",
    creeParNom: acteur.nom,
  });
  await repo.ajouterMouvement({
    trousseauId: t.id,
    type: "reservation",
    parUserId: acteur.id,
    parNom: acteur.nom,
    agenceCode: t.agenceCode,
    entrepriseId: entreprise.id,
    reservationId: reservation.id,
    details: { entrepriseNom: entreprise.nom, contactNom: contact?.nom, debutISO: input.debutISO, finPrevueISO: input.finPrevueISO, motif: reservation.motif },
  });
  return { reservation: { ...reservation, entrepriseNom: entreprise.nom }, ...(verdict.avertissement ? { avertissement: verdict.avertissement } : {}) };
}

export async function annulerReservation(input: { reservationId: string; motif: string }, acteur: Acteur): Promise<void> {
  const repo = getClesRepository();
  const r = await repo.getReservation(input.reservationId);
  if (!r) throw new Error("Réservation introuvable.");
  const t = await trousseauOperable(r.trousseauId, acteur);
  if (r.statut !== "prevue") throw new Error("Cette réservation n'est plus à venir.");
  if (!input.motif.trim()) throw new Error("Un motif est demandé pour annuler.");
  await repo.sauverReservation({ ...r, statut: "annulee", annuleeLeISO: new Date().toISOString(), annuleePar: acteur.nom, motifAnnulation: input.motif.trim() });
  await repo.ajouterMouvement({
    trousseauId: t.id,
    type: "annulation_reservation",
    parUserId: acteur.id,
    parNom: acteur.nom,
    agenceCode: t.agenceCode,
    ...(r.entrepriseId ? { entrepriseId: r.entrepriseId } : {}),
    reservationId: r.id,
    details: { entrepriseNom: r.entrepriseNom, motif: input.motif.trim(), debutISO: r.debutISO, finPrevueISO: r.finPrevueISO },
  });
}

export async function prolonger(input: { trousseauId: string; retourPrevuLeISO: string; motif?: string; aujourdhuiISO: string }, acteur: Acteur): Promise<Pret> {
  const repo = getClesRepository();
  const t = await trousseauOperable(input.trousseauId, acteur);
  const pret = await repo.getPretOuvert(t.id);
  if (!pret) throw new Error("Ce trousseau n'est pas sorti.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.retourPrevuLeISO)) throw new Error("Date illisible.");
  if (input.retourPrevuLeISO < input.aujourdhuiISO) throw new Error("La nouvelle date de retour ne peut pas être dans le passé.");
  if (input.retourPrevuLeISO === pret.retourPrevuLeISO) throw new Error("C'est déjà la date de retour prévue.");
  const maj = { ...pret, retourPrevuLeISO: input.retourPrevuLeISO };
  await repo.sauverPret(maj);
  await repo.ajouterMouvement({
    trousseauId: t.id,
    type: "prolongation",
    parUserId: acteur.id,
    parNom: acteur.nom,
    agenceCode: t.agenceCode,
    ...(pret.entrepriseId ? { entrepriseId: pret.entrepriseId } : {}),
    pretId: pret.id,
    details: { entrepriseNom: pret.entrepriseNom, avant: pret.retourPrevuLeISO, retourPrevuLeISO: input.retourPrevuLeISO, motif: input.motif?.trim() || undefined },
  });
  return maj;
}

export type Marquage = Marque | "retrouve";

export async function marquer(input: { trousseauId: string; marquage: Marquage; motif?: string }, acteur: Acteur): Promise<Trousseau> {
  const repo = getClesRepository();
  const t = await trousseauOperable(input.trousseauId, acteur);
  if (input.marquage === "retire") {
    if (!estDirectionCles(acteur, t.agenceCode)) throw new Error(MESSAGE_RESERVE_DIRECTION_CLES);
    if (await repo.getPretOuvert(t.id)) throw new Error("Un prêt est ouvert : enregistre le retour avant de retirer le trousseau.");
  }
  if (input.marquage === "retrouve" && t.marque !== "introuvable") throw new Error("Ce trousseau n'est pas déclaré introuvable.");
  if (input.marquage === "introuvable" && t.marque === "retire") throw new Error("Ce trousseau est retiré.");
  const maj: Trousseau = input.marquage === "retrouve"
    ? (({ marque: _m, marqueDepuisISO: _d, ...reste }) => reste)(t)
    : { ...t, marque: input.marquage, marqueDepuisISO: new Date().toISOString() };
  await repo.sauverTrousseau(maj);
  await repo.ajouterMouvement({
    trousseauId: t.id,
    type: input.marquage === "retire" ? "retrait" : input.marquage,
    parUserId: acteur.id,
    parNom: acteur.nom,
    agenceCode: t.agenceCode,
    details: { motif: input.motif?.trim() || undefined },
  });
  return maj;
}

export const CHAMPS_CORRIGEABLES = ["retourPrevuLeISO", "sortiLeISO", "renduLeISO", "motif", "commentaireRetour"] as const;
export type ChampCorrigeable = (typeof CHAMPS_CORRIGEABLES)[number];

/** Corriger un pret passe : direction, motif obligatoire, l'original reste au journal. */
export async function corrigerPret(input: { pretId: string; champ: ChampCorrigeable; valeur: string; motif: string }, acteur: Acteur): Promise<Pret> {
  const repo = getClesRepository();
  const pret = await repo.getPret(input.pretId);
  if (!pret) throw new Error("Prêt introuvable.");
  const t = await repo.getTrousseau(pret.trousseauId);
  if (!t) throw new Error("Trousseau introuvable.");
  if (!estDirectionCles(acteur, t.agenceCode)) throw new Error(MESSAGE_RESERVE_DIRECTION_CLES);
  if (!input.motif.trim()) throw new Error("Un motif est obligatoire pour corriger.");
  const avant = pret[input.champ];
  const valeur = input.valeur.trim();
  if (input.champ === "retourPrevuLeISO" && !/^\d{4}-\d{2}-\d{2}$/.test(valeur)) throw new Error("Date illisible.");
  if ((input.champ === "sortiLeISO" || input.champ === "renduLeISO") && Number.isNaN(Date.parse(valeur))) throw new Error("Horodatage illisible.");
  if (input.champ === "renduLeISO" && !pret.renduLeISO) throw new Error("Ce prêt est encore ouvert : enregistre le retour plutôt qu'une correction.");
  const maj: Pret = { ...pret, [input.champ]: valeur || undefined };
  await repo.sauverPret(maj);
  const original = (await repo.listerMouvements({ trousseauId: t.id, page: 1, parPage: 200 })).lignes.find((m) => m.pretId === pret.id && (m.type === "sortie" || m.type === "retour"));
  await repo.ajouterMouvement({
    trousseauId: t.id,
    type: "correction",
    parUserId: acteur.id,
    parNom: acteur.nom,
    agenceCode: t.agenceCode,
    ...(pret.entrepriseId ? { entrepriseId: pret.entrepriseId } : {}),
    pretId: pret.id,
    ...(original ? { corrigeId: original.id } : {}),
    details: { champ: input.champ, avant: avant ?? null, apres: valeur || null, motif: input.motif.trim() },
  });
  return maj;
}
