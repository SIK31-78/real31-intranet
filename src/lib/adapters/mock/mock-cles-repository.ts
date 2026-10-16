// Mock en memoire du module Gestion des cles (COPRO_SOURCE absent, et tests de service).
// Meme contrat que l'adapter Supabase, y compris l'unicite du pret ouvert et du numero.

import type {
  ClesEntrepriseRepository,
  ClesPhotoStore,
  ClesRepository,
  FiltreMouvements,
  FiltrePrets,
  FiltreReservations,
  NouveauMouvement,
  NouveauPret,
  NouveauTrousseau,
  NouvelleEntreprise,
  NouvelleReservation,
  PageMouvements,
} from "@/lib/ports/cles-repository";
import type { Bien, Entreprise, Mouvement, Pret, Reservation, Trousseau } from "@/lib/domain/cles/types";
import type { MetierPrestataire } from "@/lib/domain/contrats-copro/types";

export class MockClesRepository implements ClesRepository {
  trousseaux: Trousseau[] = [];
  reservations: Reservation[] = [];
  prets: Pret[] = [];
  mouvements: Mouvement[] = [];
  /** Noms d'entreprise pour les jointures, alimentes par le mock des entreprises. */
  nomsEntreprises = new Map<string, string>();
  private seq = 0;

  private id(prefixe: string): string {
    this.seq += 1;
    return `${prefixe}-${this.seq}`;
  }

  private nom(entrepriseId?: string): { entrepriseNom?: string } {
    const n = entrepriseId ? this.nomsEntreprises.get(entrepriseId) : undefined;
    return n ? { entrepriseNom: n } : {};
  }

  async listerTrousseaux(agenceCode?: string): Promise<Trousseau[]> {
    return this.trousseaux.filter((t) => !agenceCode || t.agenceCode === agenceCode).sort((a, b) => a.numero.localeCompare(b.numero));
  }
  async getTrousseau(id: string): Promise<Trousseau | null> {
    return this.trousseaux.find((t) => t.id === id) ?? null;
  }
  async getTrousseauParNumero(agenceCode: string, numero: string): Promise<Trousseau | null> {
    return this.trousseaux.find((t) => t.agenceCode === agenceCode && t.numero === numero) ?? null;
  }
  async listerTrousseauxDuBien(bien: Bien): Promise<Trousseau[]> {
    if (bien.type !== "copro") return [];
    return this.trousseaux.filter((t) => t.acces.some((a) => a.bien.type === "copro" && a.bien.code === bien.code));
  }
  async creerTrousseau(t: NouveauTrousseau): Promise<Trousseau> {
    if (this.trousseaux.some((x) => x.agenceCode === t.agenceCode && x.numero === t.numero)) {
      throw new Error(`Le numéro ${t.numero} existe déjà pour l'agence ${t.agenceCode}.`);
    }
    const id = this.id("t");
    const cree: Trousseau = { ...t, id, creeLeISO: new Date().toISOString(), acces: t.acces.map((a, i) => ({ ...a, id: `${id}-a${i}` })) };
    this.trousseaux.push(cree);
    return cree;
  }
  async sauverTrousseau(t: Trousseau): Promise<void> {
    const i = this.trousseaux.findIndex((x) => x.id === t.id);
    if (i >= 0) this.trousseaux[i] = t;
  }

  async listerReservations(f: FiltreReservations): Promise<Reservation[]> {
    const parId = new Map(this.trousseaux.map((t) => [t.id, t]));
    return this.reservations
      .filter((r) => !f.trousseauId || r.trousseauId === f.trousseauId)
      .filter((r) => !f.entrepriseId || r.entrepriseId === f.entrepriseId)
      .filter((r) => !f.statut || r.statut === f.statut)
      .filter((r) => !f.deISO || r.debutISO >= f.deISO)
      .filter((r) => !f.aISO || r.debutISO <= f.aISO)
      .filter((r) => !f.agenceCode || parId.get(r.trousseauId)?.agenceCode === f.agenceCode)
      .map((r) => ({ ...r, ...this.nom(r.entrepriseId) }))
      .sort((a, b) => a.debutISO.localeCompare(b.debutISO));
  }
  async getReservation(id: string): Promise<Reservation | null> {
    const r = this.reservations.find((x) => x.id === id);
    return r ? { ...r, ...this.nom(r.entrepriseId) } : null;
  }
  async creerReservation(r: NouvelleReservation): Promise<Reservation> {
    const cree: Reservation = { ...r, id: this.id("r"), creeLeISO: new Date().toISOString() };
    this.reservations.push(cree);
    return { ...cree, ...this.nom(cree.entrepriseId) };
  }
  async sauverReservation(r: Reservation): Promise<void> {
    const i = this.reservations.findIndex((x) => x.id === r.id);
    if (i >= 0) this.reservations[i] = r;
  }

  async getPretOuvert(trousseauId: string): Promise<Pret | null> {
    const p = this.prets.find((x) => x.trousseauId === trousseauId && !x.renduLeISO);
    return p ? { ...p, ...this.nom(p.entrepriseId) } : null;
  }
  async listerPrets(f: FiltrePrets): Promise<Pret[]> {
    const parId = new Map(this.trousseaux.map((t) => [t.id, t]));
    return this.prets
      .filter((p) => !f.trousseauId || p.trousseauId === f.trousseauId)
      .filter((p) => !f.entrepriseId || p.entrepriseId === f.entrepriseId)
      .filter((p) => f.ouvert === undefined || (f.ouvert ? !p.renduLeISO : Boolean(p.renduLeISO)))
      .filter((p) => !f.agenceCode || parId.get(p.trousseauId)?.agenceCode === f.agenceCode)
      .map((p) => ({ ...p, ...this.nom(p.entrepriseId) }))
      .sort((a, b) => b.sortiLeISO.localeCompare(a.sortiLeISO))
      .slice(0, f.limite ?? 5000);
  }
  async getPret(id: string): Promise<Pret | null> {
    const p = this.prets.find((x) => x.id === id);
    return p ? { ...p, ...this.nom(p.entrepriseId) } : null;
  }
  async creerPret(p: NouveauPret): Promise<Pret> {
    if (!p.renduLeISO && this.prets.some((x) => x.trousseauId === p.trousseauId && !x.renduLeISO)) {
      throw new Error("Ce trousseau est déjà sorti (un prêt est ouvert).");
    }
    const cree: Pret = { ...p, id: this.id("p") };
    this.prets.push(cree);
    return { ...cree, ...this.nom(cree.entrepriseId) };
  }
  async sauverPret(p: Pret): Promise<void> {
    const i = this.prets.findIndex((x) => x.id === p.id);
    if (i >= 0) this.prets[i] = p;
  }

  async ajouterMouvement(m: NouveauMouvement): Promise<Mouvement> {
    const cree: Mouvement = { ...m, id: this.id("m"), horodatageISO: new Date().toISOString() };
    this.mouvements.push(cree);
    return cree;
  }
  async listerMouvements(f: FiltreMouvements): Promise<PageMouvements> {
    const tous = this.mouvements
      .filter((m) => !f.agenceCode || m.agenceCode === f.agenceCode)
      .filter((m) => !f.trousseauId || m.trousseauId === f.trousseauId)
      .filter((m) => !f.entrepriseId || m.entrepriseId === f.entrepriseId)
      .filter((m) => !f.types || f.types.length === 0 || f.types.includes(m.type))
      .filter((m) => !f.deISO || m.horodatageISO >= `${f.deISO}T00:00:00Z`)
      .filter((m) => !f.aISO || m.horodatageISO <= `${f.aISO}T23:59:59Z`)
      .filter((m) => !f.par || m.parNom.toLowerCase().includes(f.par.toLowerCase()))
      .sort((a, b) => b.horodatageISO.localeCompare(a.horodatageISO));
    const debut = (f.page - 1) * f.parPage;
    return { lignes: tous.slice(debut, debut + f.parPage), total: tous.length };
  }
}

export class MockClesEntrepriseRepository implements ClesEntrepriseRepository {
  entreprises: Entreprise[] = [];
  private seq = 0;
  constructor(readonly nomsEntreprises?: Map<string, string>) {}

  async lister(): Promise<Entreprise[]> {
    return [...this.entreprises].sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  }
  async listerParMetier(metier: MetierPrestataire): Promise<Entreprise[]> {
    return (await this.lister()).filter((e) => (e.metiers ?? []).includes(metier));
  }
  async get(id: string): Promise<Entreprise | null> {
    return this.entreprises.find((e) => e.id === id) ?? null;
  }
  async getParNomNormalise(nomNormalise: string): Promise<Entreprise | null> {
    return this.entreprises.find((e) => e.nomNormalise === nomNormalise) ?? null;
  }
  async creer(e: NouvelleEntreprise): Promise<Entreprise> {
    if (this.entreprises.some((x) => x.nomNormalise === e.nomNormalise)) throw new Error(`L'entreprise « ${e.nom} » existe déjà.`);
    this.seq += 1;
    const { creeParNom: _cree, ...champs } = e;
    void _cree;
    const cree: Entreprise = { ...champs, id: `e-${this.seq}`, creeLeISO: new Date().toISOString() };
    this.entreprises.push(cree);
    this.nomsEntreprises?.set(cree.id, cree.nom);
    return cree;
  }
  async sauver(e: Entreprise): Promise<void> {
    const i = this.entreprises.findIndex((x) => x.id === e.id);
    if (i >= 0) this.entreprises[i] = e;
    this.nomsEntreprises?.set(e.id, e.nom);
  }
}

export class MockClesPhotoStore implements ClesPhotoStore {
  async urlSignee(): Promise<string | null> {
    return null;
  }
  async televerser(): Promise<void> {}
}

/**
 * Le jeu du referentiel d'entreprises du cabinet (decision 4 du 16/10/2026) : memes id que
 * ceux du mock « Contrats & controles » (ent-ascenseurs-martin, ent-verdier-courtage,
 * ent-vmc-services) pour que les prestataires des copros retombent sur ces fiches.
 */
export function peuplerMockClesEntreprises(repo: MockClesEntrepriseRepository): void {
  const commun = { contacts: [], statut: "active" as const, relances: true, source: "intranet" as const, creeLeISO: "2026-10-01T08:00:00.000Z" };
  const jeu: Entreprise[] = [
    { ...commun, id: "ent-ascenseurs-martin", nom: "Ascenseurs Martin", nomNormalise: "ascenseurs martin", email: "contact@ascenseurs-martin.fr", telephone: "01 47 00 00 10", metiers: ["ascensoriste"], courtierPartenaire: false },
    { ...commun, id: "ent-verdier-courtage", nom: "Cabinet Verdier Courtage", nomNormalise: "cabinet verdier courtage", email: "copro@verdier-courtage.fr", metiers: ["courtier"], courtierPartenaire: true },
    { ...commun, id: "ent-vmc-services", nom: "VMC Services", nomNormalise: "vmc services", metiers: ["societe_vmc"], courtierPartenaire: false },
    { ...commun, id: "ent-engie", nom: "Engie", nomNormalise: "engie", email: "copropriete@engie.com", metiers: ["fournisseur_gaz"], courtierPartenaire: false },
  ];
  for (const e of jeu) {
    if (repo.entreprises.some((x) => x.nomNormalise === e.nomNormalise)) continue;
    repo.entreprises.push(e);
    repo.nomsEntreprises?.set(e.id, e.nom);
  }
}

/** Instances partagees du mode mock (un seul jeu par process). */
const REPO = new MockClesRepository();
const ENTREPRISES = new MockClesEntrepriseRepository(REPO.nomsEntreprises);
peuplerMockClesEntreprises(ENTREPRISES);
const PHOTOS = new MockClesPhotoStore();

export function mockCles(): { repo: MockClesRepository; entreprises: MockClesEntrepriseRepository; photos: MockClesPhotoStore } {
  return { repo: REPO, entreprises: ENTREPRISES, photos: PHOTOS };
}
