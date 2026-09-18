// Lectures du module Gestion des cles : etat des trousseaux (derive), tableau de bord,
// fiches, index de recherche, journal. Passe par le routeur (ADR-001). Les noms de copro
// viennent du referentiel existant (jamais ressaisis).

import { cache } from "react";
import { getClesEntrepriseRepository, getClesPhotoStore, getClesRepository, getCoproRepository } from "@/lib/adapters/router";
import { enRetard, etatTrousseau, joursDeRetard, joursDehors, plusJours, reservationExpiree } from "@/lib/domain/cles/etat";
import type { EntreeIndex } from "@/lib/domain/cles/recherche";
import type { Bien, Entreprise, EtatTrousseau, Mouvement, Pret, Reservation, Trousseau } from "@/lib/domain/cles/types";
import type { FiltreMouvements } from "@/lib/ports/cles-repository";

export interface BienResume {
  bien: Bien;
  libelle: string;
  adresse: string;
  /** Code copro quand le bien est une copro (lien vers la fiche). */
  coproCode?: string;
  /** Qui suit la copro : le gestionnaire et l'assistant(e), depuis le referentiel. */
  gestionnaire?: string;
  assistant?: string;
}

type CoproRef = { nom: string; adresse: string; gestionnaire?: string; assistant?: string };

export interface TrousseauResume {
  trousseau: Trousseau;
  etat: EtatTrousseau;
  /** Pret ouvert, s'il y en a un. */
  pret: Pret | null;
  /** Reservations prevues a venir (ou du jour), les plus proches d'abord. */
  reservations: Reservation[];
  biens: BienResume[];
  joursRetard: number;
  joursDehors: number;
}

/** Referentiel copro { code -> nom, adresse }, memoise par rendu. */
const chargerCopros = cache(async (): Promise<Map<string, CoproRef>> => {
  const copros = await getCoproRepository().listerToutes().catch(() => []);
  return new Map(
    copros.map((c) => {
      const gestionnaire = (c.equipe ?? []).find((m) => m.role === "gestionnaire")?.nomComplet;
      const assistant = (c.equipe ?? []).find((m) => m.role === "assistant")?.nomComplet;
      return [
        c.code,
        { nom: c.nom, adresse: [c.adresse?.ligne1, c.adresse?.ville].filter(Boolean).join(", "), ...(gestionnaire ? { gestionnaire } : {}), ...(assistant ? { assistant } : {}) },
      ];
    }),
  );
});

function biensDe(t: Trousseau, copros: Map<string, CoproRef>): BienResume[] {
  return t.acces.map((a) => {
    if (a.bien.type === "copro") {
      const c = copros.get(a.bien.code);
      return { bien: a.bien, libelle: c?.nom ?? a.bien.nom ?? a.bien.code, adresse: c?.adresse ?? "", coproCode: a.bien.code, ...(c?.gestionnaire ? { gestionnaire: c.gestionnaire } : {}), ...(c?.assistant ? { assistant: c.assistant } : {}) };
    }
    return { bien: a.bien, libelle: a.bien.nom ?? a.bien.ref, adresse: "" };
  });
}

function resumer(
  t: Trousseau,
  pret: Pret | null,
  reservations: Reservation[],
  copros: Map<string, CoproRef>,
  aujourdhuiISO: string,
): TrousseauResume {
  const prevues = reservations
    .filter((r) => r.statut === "prevue" && r.finPrevueISO >= aujourdhuiISO)
    .sort((a, b) => a.debutISO.localeCompare(b.debutISO));
  return {
    trousseau: t,
    etat: etatTrousseau(t, pret, prevues, aujourdhuiISO),
    pret,
    reservations: prevues,
    biens: biensDe(t, copros),
    joursRetard: pret ? joursDeRetard(pret, aujourdhuiISO) : 0,
    joursDehors: pret ? joursDehors(pret, aujourdhuiISO) : 0,
  };
}

/** Tous les trousseaux d'une agence (ou du cabinet), avec leur etat derive. Trois lectures en parallele. */
export async function vueTrousseaux(agenceCode: string | undefined, aujourdhuiISO: string): Promise<TrousseauResume[]> {
  const repo = getClesRepository();
  const [trousseaux, prets, reservations, copros] = await Promise.all([
    repo.listerTrousseaux(agenceCode),
    repo.listerPrets({ agenceCode, ouvert: true }),
    repo.listerReservations({ agenceCode, statut: "prevue", deISO: plusJours(aujourdhuiISO, -60) }),
    chargerCopros(),
  ]);
  const pretPar = new Map(prets.map((p) => [p.trousseauId, p]));
  const resasPar = new Map<string, Reservation[]>();
  for (const r of reservations) (resasPar.get(r.trousseauId) ?? resasPar.set(r.trousseauId, []).get(r.trousseauId)!).push(r);
  return trousseaux.map((t) => resumer(t, pretPar.get(t.id) ?? null, resasPar.get(t.id) ?? [], copros, aujourdhuiISO));
}

export interface TableauDeBordCles {
  resumes: TrousseauResume[];
  sortis: TrousseauResume[];
  enRetard: TrousseauResume[];
  reservationsDuJour: Array<Reservation & { resume: TrousseauResume }>;
  reservationsAVenir: Array<Reservation & { resume: TrousseauResume }>;
  /** Prevues, debut passe, jamais sorties : a annuler ou a sortir. */
  reservationsNonRetirees: Array<Reservation & { resume: TrousseauResume }>;
  /** Reservation demain ou aujourd'hui sur un trousseau encore dehors. */
  conflits: Array<Reservation & { resume: TrousseauResume }>;
  recents: MouvementEnrichi[];
  compteurs: { total: number; enAgence: number; sortis: number; enRetard: number; reserves: number; introuvables: number };
}

export async function tableauDeBord(agenceCode: string | undefined, aujourdhuiISO: string): Promise<TableauDeBordCles> {
  const [resumes, recents] = await Promise.all([
    vueTrousseaux(agenceCode, aujourdhuiISO),
    journalCles({ agenceCode, page: 1, parPage: 15 }),
  ]);
  const actifs = resumes.filter((r) => r.trousseau.marque !== "retire");
  const parId = new Map(resumes.map((r) => [r.trousseau.id, r]));
  const toutesResas = resumes.flatMap((r) => r.reservations.map((x) => ({ ...x, resume: parId.get(x.trousseauId)! })));
  // Les reservations expirees ne sont pas dans `reservations` (fin passee) : on les relit.
  const expirees = (await getClesRepository().listerReservations({ agenceCode, statut: "prevue", aISO: plusJours(aujourdhuiISO, -1), deISO: plusJours(aujourdhuiISO, -60) }))
    .filter((r) => reservationExpiree(r, aujourdhuiISO) && parId.has(r.trousseauId))
    .map((r) => ({ ...r, resume: parId.get(r.trousseauId)! }));
  const demain = plusJours(aujourdhuiISO, 1);
  return {
    resumes,
    sortis: actifs.filter((r) => r.pret).sort((a, b) => a.pret!.sortiLeISO.localeCompare(b.pret!.sortiLeISO)),
    enRetard: actifs.filter((r) => r.etat === "en_retard").sort((a, b) => b.joursRetard - a.joursRetard),
    reservationsDuJour: toutesResas.filter((r) => r.debutISO <= aujourdhuiISO && r.finPrevueISO >= aujourdhuiISO),
    reservationsAVenir: toutesResas.filter((r) => r.debutISO > aujourdhuiISO).slice(0, 20),
    reservationsNonRetirees: expirees,
    conflits: toutesResas.filter((r) => r.debutISO <= demain && r.resume.pret !== null && r.resume.pret.retourPrevuLeISO >= r.debutISO),
    recents: recents.lignes,
    compteurs: {
      total: actifs.length,
      enAgence: actifs.filter((r) => r.etat === "en_agence" || r.etat === "reserve").length,
      sortis: actifs.filter((r) => r.etat === "sorti" || r.etat === "en_retard").length,
      enRetard: actifs.filter((r) => r.etat === "en_retard").length,
      reserves: actifs.filter((r) => r.etat === "reserve").length,
      introuvables: actifs.filter((r) => r.etat === "introuvable").length,
    },
  };
}

export interface FicheTrousseau {
  resume: TrousseauResume;
  /** Tous les prets, les plus recents d'abord. */
  prets: Pret[];
  /** Toutes les reservations (prevues, converties, annulees), les plus recentes d'abord. */
  reservations: Reservation[];
  mouvements: MouvementEnrichi[];
  photoUrl: string | null;
}

export async function ficheTrousseau(id: string, aujourdhuiISO: string): Promise<FicheTrousseau | null> {
  const repo = getClesRepository();
  const t = await repo.getTrousseau(id);
  if (!t) return null;
  const [pret, prets, reservations, mouvements, copros] = await Promise.all([
    repo.getPretOuvert(t.id),
    repo.listerPrets({ trousseauId: t.id, limite: 200 }),
    repo.listerReservations({ trousseauId: t.id }),
    journalCles({ trousseauId: t.id, page: 1, parPage: 100 }),
    chargerCopros(),
  ]);
  const photoUrl = t.photoChemin ? await getClesPhotoStore().urlSignee(t.photoChemin) : null;
  return {
    resume: resumer(t, pret, reservations, copros, aujourdhuiISO),
    prets,
    reservations: [...reservations].sort((a, b) => b.debutISO.localeCompare(a.debutISO)),
    mouvements: mouvements.lignes,
    photoUrl,
  };
}

export interface FicheEntreprise {
  entreprise: Entreprise;
  /** Trousseaux detenus (prets ouverts), les plus anciens d'abord. */
  detenus: Array<Pret & { resume: TrousseauResume | null }>;
  enRetard: number;
  /** Historique des prets clos, les plus recents d'abord. */
  historique: Pret[];
  reservations: Reservation[];
  mouvements: MouvementEnrichi[];
  /** Part des prets clos rendus apres la date prevue (sur les 24 derniers mois). */
  tauxRetard: number | null;
  numeros: Map<string, string>;
}

export async function ficheEntreprise(id: string, aujourdhuiISO: string): Promise<FicheEntreprise | null> {
  const entreprise = await getClesEntrepriseRepository().get(id);
  if (!entreprise) return null;
  const repo = getClesRepository();
  const [prets, reservations, mouvements, trousseaux, copros] = await Promise.all([
    repo.listerPrets({ entrepriseId: id, limite: 500 }),
    repo.listerReservations({ entrepriseId: id }),
    journalCles({ entrepriseId: id, page: 1, parPage: 50 }),
    repo.listerTrousseaux(),
    chargerCopros(),
  ]);
  const parId = new Map(trousseaux.map((t) => [t.id, t]));
  const ouverts = prets.filter((p) => !p.renduLeISO).sort((a, b) => a.sortiLeISO.localeCompare(b.sortiLeISO));
  const clos = prets.filter((p) => p.renduLeISO);
  const recents = clos.filter((p) => p.sortiLeISO >= plusJours(aujourdhuiISO, -730));
  const tardifs = recents.filter((p) => (p.renduLeISO ?? "").slice(0, 10) > p.retourPrevuLeISO).length;
  return {
    entreprise,
    detenus: ouverts.map((p) => {
      const t = parId.get(p.trousseauId);
      return { ...p, resume: t ? resumer(t, p, [], copros, aujourdhuiISO) : null };
    }),
    enRetard: ouverts.filter((p) => enRetard(p, aujourdhuiISO)).length,
    historique: clos,
    reservations: [...reservations].sort((a, b) => b.debutISO.localeCompare(a.debutISO)),
    mouvements: mouvements.lignes,
    tauxRetard: recents.length > 0 ? Math.round((100 * tardifs) / recents.length) : null,
    numeros: new Map(trousseaux.map((t) => [t.id, t.numero])),
  };
}

export interface EntrepriseResume extends Entreprise {
  detenus: number;
  enRetard: number;
}

/** Les entreprises avec ce qu'elles detiennent (pour la liste et la combobox du comptoir). */
export async function listerEntreprises(aujourdhuiISO: string): Promise<EntrepriseResume[]> {
  const [entreprises, ouverts] = await Promise.all([getClesEntrepriseRepository().lister(), getClesRepository().listerPrets({ ouvert: true })]);
  const detenus = new Map<string, { n: number; retard: number }>();
  for (const p of ouverts) {
    if (!p.entrepriseId) continue;
    const d = detenus.get(p.entrepriseId) ?? { n: 0, retard: 0 };
    d.n += 1;
    if (enRetard(p, aujourdhuiISO)) d.retard += 1;
    detenus.set(p.entrepriseId, d);
  }
  return entreprises.map((e) => ({ ...e, detenus: detenus.get(e.id)?.n ?? 0, enRetard: detenus.get(e.id)?.retard ?? 0 }));
}

/** L'index de la recherche du comptoir : trousseaux, copros ayant des trousseaux, entreprises. */
export async function indexRecherche(agenceCode: string | undefined, aujourdhuiISO: string): Promise<EntreeIndex[]> {
  const [resumes, entreprises] = await Promise.all([vueTrousseaux(agenceCode, aujourdhuiISO), listerEntreprises(aujourdhuiISO)]);
  const index: EntreeIndex[] = [];
  const copros = new Map<string, { nom: string; adresse: string; n: number; gestionnaire?: string; assistant?: string }>();
  for (const r of resumes) {
    if (r.trousseau.marque === "retire") continue;
    index.push({
      kind: "trousseau",
      id: r.trousseau.id,
      numero: r.trousseau.numero,
      libelle: r.trousseau.libelle,
      etat: r.etat,
      biens: r.biens.map((b) => `${b.coproCode ?? ""} ${b.libelle} ${b.adresse}`).join(" · "),
      ...(r.pret?.entrepriseNom ? { detenteur: r.pret.entrepriseNom } : {}),
      ...(r.trousseau.emplacement ? { emplacement: r.trousseau.emplacement } : {}),
    });
    for (const b of r.biens) {
      if (!b.coproCode) continue;
      const c = copros.get(b.coproCode) ?? { nom: b.libelle, adresse: b.adresse, n: 0, ...(b.gestionnaire ? { gestionnaire: b.gestionnaire } : {}), ...(b.assistant ? { assistant: b.assistant } : {}) };
      c.n += 1;
      copros.set(b.coproCode, c);
    }
  }
  for (const [code, c] of copros) index.push({ kind: "copro", code, nom: c.nom, adresse: c.adresse, trousseaux: c.n, ...(c.gestionnaire ? { gestionnaire: c.gestionnaire } : {}), ...(c.assistant ? { assistant: c.assistant } : {}) });
  for (const e of entreprises) index.push({ kind: "entreprise", id: e.id, nom: e.nom, detenus: e.detenus, enRetard: e.enRetard, bloquee: e.statut === "bloquee" });
  return index;
}

/** Les trousseaux qui ouvrent une copro (bloc de la fiche copro, etape TR2 d'une perte). */
export async function trousseauxDeCopro(coproCode: string, aujourdhuiISO: string): Promise<TrousseauResume[]> {
  const repo = getClesRepository();
  const trousseaux = await repo.listerTrousseauxDuBien({ type: "copro", code: coproCode });
  if (trousseaux.length === 0) return [];
  const copros = await chargerCopros();
  return Promise.all(
    trousseaux.map(async (t) => {
      const [pret, reservations] = await Promise.all([repo.getPretOuvert(t.id), repo.listerReservations({ trousseauId: t.id, statut: "prevue", deISO: plusJours(aujourdhuiISO, -60) })]);
      return resumer(t, pret, reservations, copros, aujourdhuiISO);
    }),
  );
}

/** Prets en retard dont le trousseau ouvre une des copros donnees (alerte d'accueil du gestionnaire). */
export async function retardsPourCopros(codes: string[], aujourdhuiISO: string): Promise<Array<{ resume: TrousseauResume; coproCode: string }>> {
  if (codes.length === 0) return [];
  const voulus = new Set(codes);
  const resumes = await vueTrousseaux(undefined, aujourdhuiISO);
  const out: Array<{ resume: TrousseauResume; coproCode: string }> = [];
  for (const r of resumes) {
    if (r.etat !== "en_retard") continue;
    const b = r.biens.find((x) => x.coproCode && voulus.has(x.coproCode));
    if (b?.coproCode) out.push({ resume: r, coproCode: b.coproCode });
  }
  return out.sort((a, b) => b.resume.joursRetard - a.resume.joursRetard);
}

export interface MouvementEnrichi extends Mouvement {
  trousseauNumero?: string;
}

export interface JournalCles {
  lignes: MouvementEnrichi[];
  total: number;
}

/** Le journal, pagine serveur, avec les numeros de trousseau et les noms d'entreprise. */
export async function journalCles(f: FiltreMouvements): Promise<JournalCles> {
  const repo = getClesRepository();
  const page = await repo.listerMouvements(f);
  if (page.lignes.length === 0) return { lignes: [], total: page.total };
  const [trousseaux, entreprises] = await Promise.all([repo.listerTrousseaux(f.agenceCode), getClesEntrepriseRepository().lister()]);
  const numero = new Map(trousseaux.map((t) => [t.id, t.numero]));
  const nom = new Map(entreprises.map((e) => [e.id, e.nom]));
  return {
    lignes: page.lignes.map((m) => ({
      ...m,
      ...(numero.has(m.trousseauId) ? { trousseauNumero: numero.get(m.trousseauId) } : {}),
      ...(m.entrepriseId && nom.has(m.entrepriseId) ? { entrepriseNom: nom.get(m.entrepriseId) } : {}),
    })),
    total: page.total,
  };
}
