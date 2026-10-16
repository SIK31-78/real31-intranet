// Doublure EN MÉMOIRE du port ContratsCoproRepository pour les tests des services d'écriture.
// Pas un mock « qui enregistre des appels » : une petite base qui se comporte comme la vraie
// (identifiants, suppression logique, clôture = clos puis suivant), pour que les tests lisent
// l'état final plutôt que la séquence d'appels. Hors du include vitest (pas un *.test.ts).

import type {
  Ascenseur,
  ContratCourant,
  Cycle,
  DevisCtq,
  DocumentContrat,
  EntreeJournalContrats,
  NouveauCycle,
  NouveauDevisCtq,
  NouveauDocumentContrat,
  NouvelAscenseur,
  NouvelleEntreeJournal,
  NouvelleOffreAssurance,
  NouvelleOffreGaz,
  OffreAssurance,
  OffreGaz,
  PatchContratCourant,
  RattachementDocument,
  RegleRelance,
  SujetCtq,
  SujetSuivi,
} from "@/lib/domain/contrats-copro/types";
import { REGLES_RELANCE_DEFAUT } from "@/lib/domain/contrats-copro/types";
import type { ClotureCycle, ContratsCoproRepository, FiltreCycles } from "@/lib/ports/contrats-copro-repository";

export function contratVide(coproCode: string): ContratCourant {
  return {
    coproCode,
    assurance: { compagnie: null, numeroContrat: null, courtier: null, souscriptionISO: null, echeanceISO: null, prime: null },
    gaz: { fournisseur: null, typePrix: null, montant: null, echeanceISO: null },
    vmc: { societe: null, reference: null, dernierCtqISO: null },
    compteurs: { ascenseurs: null, chaudieres: null, vmcGaz: null },
    energieChauffage: null,
    immatriculation: { numero: null, nonApplicable: null },
    devisRetenu: { ctq_ascenseur: null, ctq_vmc: null },
  };
}

function fusionner<T extends object>(cible: T, patch: Partial<T> | undefined): T {
  if (!patch) return cible;
  const out = { ...cible } as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch)) if (v !== undefined) out[k] = v;
  return out as T;
}

export class FausseBaseContrats implements ContratsCoproRepository {
  cycles: Cycle[] = [];
  ascenseurs: Ascenseur[] = [];
  offresAssurance: OffreAssurance[] = [];
  offresGaz: OffreGaz[] = [];
  devis: DevisCtq[] = [];
  contrats = new Map<string, ContratCourant>();
  documents: DocumentContrat[] = [];
  journal: EntreeJournalContrats[] = [];
  /** Simule une table de journal absente. */
  journalEnPanne = false;
  private compteur = 0;
  private horloge = 0;

  id(prefixe: string): string {
    this.compteur += 1;
    return `${prefixe}-${this.compteur}`;
  }

  /** Un horodatage de création strictement croissant (l'ordre des cycles en dépend). */
  private creeLe(): string {
    this.horloge += 1;
    return new Date(Date.UTC(2026, 0, 1, 0, 0, this.horloge)).toISOString();
  }

  // --- Jeu de données ---------------------------------------------------------------------

  ajouterCycle(c: Partial<Cycle> & Pick<Cycle, "sujet" | "coproCode">): Cycle {
    const cycle: Cycle = {
      id: this.id("cyc"),
      statut: "en_cours",
      echeanceISO: null,
      etapes: {},
      demarreManuellement: null,
      offreRetenueId: null,
      notes: null,
      creeLeISO: this.creeLe(),
      ...c,
    };
    this.cycles.push(cycle);
    return cycle;
  }

  ajouterContrat(coproCode: string, patch: PatchContratCourant = {}): ContratCourant {
    const base = contratVide(coproCode);
    const c: ContratCourant = {
      ...base,
      assurance: fusionner(base.assurance, patch.assurance),
      gaz: fusionner(base.gaz, patch.gaz),
      vmc: fusionner(base.vmc, patch.vmc),
      compteurs: fusionner(base.compteurs, patch.compteurs),
      immatriculation: fusionner(base.immatriculation, patch.immatriculation),
    };
    this.contrats.set(coproCode, c);
    return c;
  }

  // --- Cycles -----------------------------------------------------------------------------

  async listerCycles(f: FiltreCycles): Promise<Cycle[]> {
    return this.cycles.filter(
      (c) => (!f.coproCodes || f.coproCodes.includes(c.coproCode)) && (!f.sujets || f.sujets.includes(c.sujet)) && (!f.statuts || f.statuts.includes(c.statut)),
    );
  }
  async getCycle(sujet: SujetSuivi, id: string): Promise<Cycle | null> {
    return this.cycles.find((c) => c.sujet === sujet && c.id === id) ?? null;
  }
  async creerCycle(c: NouveauCycle): Promise<Cycle> {
    if (c.sujet === "ctq_ascenseur" && !c.ascenseurId) throw new Error("un cycle CTQ ascenseur doit désigner un appareil.");
    const cycle: Cycle = { ...c, id: this.id("cyc"), creeLeISO: this.creeLe() };
    this.cycles.push(cycle);
    return cycle;
  }
  async sauverCycle(c: Cycle): Promise<void> {
    const i = this.cycles.findIndex((x) => x.id === c.id);
    if (i < 0) throw new Error(`cycle ${c.id} inconnu`);
    this.cycles[i] = { ...c };
  }
  async cloturer(c: ClotureCycle): Promise<Cycle | null> {
    await this.sauverCycle(c.clos);
    if (c.suivant) return this.creerCycle(c.suivant);
    if (c.suivantAjuste) {
      const s = this.cycles.find((x) => x.id === c.suivantAjuste!.id);
      if (!s) throw new Error("suivant inconnu");
      s.echeanceISO = c.suivantAjuste.echeanceISO;
      return s;
    }
    return null;
  }

  // --- Appareils --------------------------------------------------------------------------

  async listerAscenseurs(coproCodes?: readonly string[]): Promise<Ascenseur[]> {
    return this.ascenseurs.filter((a) => !coproCodes || coproCodes.includes(a.coproCode));
  }
  async getAscenseur(id: string): Promise<Ascenseur | null> {
    return this.ascenseurs.find((a) => a.id === id) ?? null;
  }
  async creerAscenseur(a: NouvelAscenseur): Promise<Ascenseur> {
    const n: Ascenseur = { ...a, id: this.id("asc") };
    this.ascenseurs.push(n);
    return n;
  }
  async sauverAscenseur(a: Ascenseur): Promise<void> {
    const i = this.ascenseurs.findIndex((x) => x.id === a.id);
    if (i < 0) throw new Error("appareil inconnu");
    this.ascenseurs[i] = { ...a };
  }

  // --- Offres et devis --------------------------------------------------------------------

  async listerOffresAssurance(cycleIds: readonly string[]): Promise<OffreAssurance[]> {
    return this.offresAssurance.filter((o) => cycleIds.includes(o.cycleId) && !o.supprimeeLeISO);
  }
  async creerOffreAssurance(o: NouvelleOffreAssurance): Promise<OffreAssurance> {
    const n: OffreAssurance = { ...o, id: this.id("offa") };
    this.offresAssurance.push(n);
    return n;
  }
  async supprimerOffreAssurance(id: string): Promise<void> {
    const o = this.offresAssurance.find((x) => x.id === id);
    if (o) o.supprimeeLeISO = "2026-10-16";
  }
  async listerOffresGaz(cycleIds: readonly string[]): Promise<OffreGaz[]> {
    return this.offresGaz.filter((o) => cycleIds.includes(o.cycleId) && !o.supprimeeLeISO);
  }
  async creerOffreGaz(o: NouvelleOffreGaz): Promise<OffreGaz> {
    const n: OffreGaz = { ...o, id: this.id("offg") };
    this.offresGaz.push(n);
    return n;
  }
  async supprimerOffreGaz(id: string): Promise<void> {
    const o = this.offresGaz.find((x) => x.id === id);
    if (o) o.supprimeeLeISO = "2026-10-16";
  }
  async listerDevisCtq(coproCodes: readonly string[]): Promise<DevisCtq[]> {
    return this.devis.filter((d) => coproCodes.includes(d.coproCode) && !d.supprimeeLeISO);
  }
  async creerDevisCtq(d: NouveauDevisCtq): Promise<DevisCtq> {
    const n: DevisCtq = { ...d, id: this.id("dev") };
    this.devis.push(n);
    return n;
  }
  async supprimerDevisCtq(id: string): Promise<void> {
    const d = this.devis.find((x) => x.id === id);
    if (d) d.supprimeeLeISO = "2026-10-16";
  }
  async setDevisRetenu(coproCode: string, sujet: SujetCtq, devisId: string | null): Promise<void> {
    const c = this.contrats.get(coproCode) ?? this.ajouterContrat(coproCode);
    c.devisRetenu = { ...c.devisRetenu, [sujet]: devisId };
  }

  // --- Contrat courant --------------------------------------------------------------------

  async getContratCourant(coproCode: string): Promise<ContratCourant | null> {
    return this.contrats.get(coproCode) ?? null;
  }
  async listerContratsCourants(coproCodes?: readonly string[]): Promise<Map<string, ContratCourant>> {
    return new Map([...this.contrats].filter(([code]) => !coproCodes || coproCodes.includes(code)));
  }
  async setContratCourant(coproCode: string, patch: PatchContratCourant): Promise<void> {
    const c = this.contrats.get(coproCode);
    if (!c) throw new Error(`copro ${coproCode} inconnue`);
    this.contrats.set(coproCode, {
      ...c,
      assurance: fusionner(c.assurance, patch.assurance),
      gaz: fusionner(c.gaz, patch.gaz),
      vmc: fusionner(c.vmc, patch.vmc),
      compteurs: fusionner(c.compteurs, patch.compteurs),
      immatriculation: fusionner(c.immatriculation, patch.immatriculation),
    });
  }

  // --- Documents --------------------------------------------------------------------------

  async listerDocuments(cible: RattachementDocument | { type: "toute_copro"; coproCode: string }): Promise<DocumentContrat[]> {
    const vivants = this.documents.filter((d) => !d.supprimeLeISO);
    if (cible.type === "toute_copro") return vivants; // la doublure ne connaît qu'une copro par test
    return vivants.filter((d) => JSON.stringify(d.rattachement) === JSON.stringify(cible));
  }
  async getDocument(id: string): Promise<DocumentContrat | null> {
    return this.documents.find((d) => d.id === id) ?? null;
  }
  async creerDocument(d: NouveauDocumentContrat): Promise<DocumentContrat> {
    const n: DocumentContrat = { ...d, id: this.id("doc") };
    this.documents.push(n);
    return n;
  }
  async supprimerDocument(id: string): Promise<void> {
    const d = this.documents.find((x) => x.id === id);
    if (!d || d.supprimeLeISO) throw new Error("document inconnu");
    d.supprimeLeISO = "2026-10-16";
  }

  // --- Prestataires, règles, fiche immeuble : hors des services d'écriture testés ici ------

  async listerPrestataires() {
    return [];
  }
  async lierPrestataire(): Promise<void> {
    throw new Error("non simulé");
  }
  async delierPrestataire(): Promise<void> {
    throw new Error("non simulé");
  }
  async listerReglesRelance(): Promise<Record<SujetSuivi, RegleRelance>> {
    return REGLES_RELANCE_DEFAUT;
  }
  async sauverRegleRelance(): Promise<void> {
    throw new Error("non simulé");
  }
  async getFicheImmeuble() {
    return null;
  }
  async listerFichesImmeuble() {
    return new Map();
  }
  async sauverFicheImmeuble(): Promise<void> {
    throw new Error("non simulé");
  }
  async creerBatiment(): Promise<never> {
    throw new Error("non simulé");
  }
  async sauverBatiment(): Promise<void> {
    throw new Error("non simulé");
  }
  async supprimerBatiment(): Promise<void> {
    throw new Error("non simulé");
  }

  // --- Journal ----------------------------------------------------------------------------

  async ajouterJournal(e: NouvelleEntreeJournal): Promise<EntreeJournalContrats> {
    if (this.journalEnPanne) throw new Error('relation "intranet_contrats_journal" does not exist');
    const n: EntreeJournalContrats = { ...e, id: this.id("jr"), horodatageISO: new Date().toISOString() };
    this.journal.push(n);
    return n;
  }
  async listerJournal(coproCode: string, limite = 30): Promise<EntreeJournalContrats[]> {
    return this.journal.filter((e) => e.coproCode === coproCode).slice(-limite).reverse();
  }
}

export const AUTEUR = { id: "user-1", nom: "Camille Test", email: "camille@real31.fr" };
