// Mock en mémoire du module « Contrats & contrôles » (COPRO_SOURCE absent, et tests de service).
// Même contrat que l'adapter Supabase ; les écritures mutent le jeu. Les copros sont celles du
// mock copro (S104, S088, S045, S019, S121) et les dates se calculent par rapport à la date
// d'ancrage de l'intranet mock.

import type {
  Ascenseur,
  Batiment,
  ContratCourant,
  Cycle,
  DevisCtq,
  DocumentContrat,
  EntreeJournalContrats,
  FicheImmeuble,
  MetierPrestataire,
  NouveauBatiment,
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
  PatchFicheImmeuble,
  PrestataireCopro,
  RattachementDocument,
  RegleRelance,
  SujetCtq,
  SujetSuivi,
} from "@/lib/domain/contrats-copro/types";
import { REGLES_RELANCE_DEFAUT } from "@/lib/domain/contrats-copro/types";
import type { ClotureCycle, ContratsCoproRepository, FiltreCycles } from "@/lib/ports/contrats-copro-repository";

// Même valeur que ANCRE_MOCK de src/lib/services/date-du-jour.ts (un adapter n'importe pas un
// service, règle boundaries) : le jeu est cohérent avec « aujourd'hui » du mock.
const ANCRE = "2026-05-27";

/** Jour ISO à `n` jours de l'ancre (arithmétique UTC, pas de fuseau). */
function j(n: number): string {
  const d = new Date(`${ANCRE}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function ts(n: number, heure = "09:00:00"): string {
  return `${j(n)}T${heure}.000Z`;
}

const CODES = ["S104", "S088", "S045", "S019", "S121"] as const;

function contratVide(coproCode: string): ContratCourant {
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

export class MockContratsCoproRepository implements ContratsCoproRepository {
  cycles: Cycle[] = [];
  ascenseurs: Ascenseur[] = [];
  offresAssurance: OffreAssurance[] = [];
  offresGaz: OffreGaz[] = [];
  devis: DevisCtq[] = [];
  contrats = new Map<string, ContratCourant>();
  documents: DocumentContrat[] = [];
  prestataires: PrestataireCopro[] = [];
  /** Référentiel d'entreprises du mock (id -> nom, email), pour la jointure des prestataires. */
  entreprises = new Map<string, { nom: string; email: string | null }>();
  regles: Record<SujetSuivi, RegleRelance> = { ...REGLES_RELANCE_DEFAUT };
  journal: EntreeJournalContrats[] = [];
  fiches = new Map<string, FicheImmeuble>();
  private seq = 0;

  private id(prefixe: string): string {
    this.seq += 1;
    return `${prefixe}-${this.seq}`;
  }

  // --- Cycles -------------------------------------------------------------------------

  async listerCycles(f: FiltreCycles): Promise<Cycle[]> {
    return this.cycles
      .filter((c) => !f.coproCodes || f.coproCodes.includes(c.coproCode))
      .filter((c) => !f.sujets || f.sujets.length === 0 || f.sujets.includes(c.sujet))
      .filter((c) => !f.statuts || f.statuts.length === 0 || f.statuts.includes(c.statut))
      .map((c) => this.avecAppareil(c));
  }

  private avecAppareil(c: Cycle): Cycle {
    if (c.sujet !== "ctq_ascenseur" || !c.ascenseurId) return { ...c, etapes: { ...c.etapes } };
    const a = this.ascenseurs.find((x) => x.id === c.ascenseurId);
    return { ...c, etapes: { ...c.etapes }, ascenseurIdentifiant: a?.identifiant ?? null };
  }

  async getCycle(sujet: SujetSuivi, id: string): Promise<Cycle | null> {
    const c = this.cycles.find((x) => x.sujet === sujet && x.id === id);
    return c ? this.avecAppareil(c) : null;
  }

  async creerCycle(c: NouveauCycle): Promise<Cycle> {
    if (c.sujet === "ctq_ascenseur") {
      const a = this.ascenseurs.find((x) => x.id === c.ascenseurId);
      if (!a) throw new Error(`Création du cycle CTQ ascenseur : appareil ${c.ascenseurId ?? "(aucun)"} introuvable.`);
      if (a.coproCode !== c.coproCode) throw new Error(`Création du cycle CTQ ascenseur : l'appareil n'est pas un ascenseur de ${c.coproCode}.`);
    }
    const cree: Cycle = { ...c, etapes: { ...c.etapes }, id: this.id("cyc"), creeLeISO: new Date().toISOString() };
    this.cycles.push(cree);
    return this.avecAppareil(cree);
  }

  async sauverCycle(c: Cycle): Promise<void> {
    const i = this.cycles.findIndex((x) => x.sujet === c.sujet && x.id === c.id);
    if (i < 0) throw new Error(`Enregistrement du cycle ${c.sujet} ${c.id} : cycle inconnu.`);
    this.cycles[i] = { ...c, etapes: { ...c.etapes } };
  }

  async cloturer(c: ClotureCycle): Promise<Cycle | null> {
    await this.sauverCycle(c.clos);
    if (c.suivant) return this.creerCycle(c.suivant);
    if (c.suivantAjuste) {
      const suivant = this.cycles.find((x) => x.sujet === c.suivantAjuste!.sujet && x.id === c.suivantAjuste!.id);
      if (!suivant) throw new Error(`Ajustement de l'échéance : cycle ${c.suivantAjuste.id} inconnu.`);
      suivant.echeanceISO = c.suivantAjuste.echeanceISO;
      return this.avecAppareil(suivant);
    }
    return null;
  }

  // --- Appareils ----------------------------------------------------------------------

  async listerAscenseurs(coproCodes?: readonly string[]): Promise<Ascenseur[]> {
    return this.ascenseurs.filter((a) => !coproCodes || coproCodes.includes(a.coproCode)).map((a) => ({ ...a }));
  }
  async getAscenseur(id: string): Promise<Ascenseur | null> {
    const a = this.ascenseurs.find((x) => x.id === id);
    return a ? { ...a } : null;
  }
  async creerAscenseur(a: NouvelAscenseur): Promise<Ascenseur> {
    const cree: Ascenseur = { ...a, id: this.id("asc") };
    this.ascenseurs.push(cree);
    return { ...cree };
  }
  async sauverAscenseur(a: Ascenseur): Promise<void> {
    const i = this.ascenseurs.findIndex((x) => x.id === a.id);
    if (i < 0) throw new Error(`Enregistrement de l'ascenseur ${a.id} : appareil inconnu.`);
    this.ascenseurs[i] = { ...this.ascenseurs[i], identifiant: a.identifiant, dernierCtqISO: a.dernierCtqISO, notes: a.notes ?? null };
  }

  // --- Offres et devis ----------------------------------------------------------------

  async listerOffresAssurance(cycleIds: readonly string[]): Promise<OffreAssurance[]> {
    return this.offresAssurance.filter((o) => cycleIds.includes(o.cycleId) && !o.supprimeeLeISO).map((o) => ({ ...o }));
  }
  async creerOffreAssurance(o: NouvelleOffreAssurance): Promise<OffreAssurance> {
    const cree: OffreAssurance = { ...o, id: this.id("offa"), supprimeeLeISO: null };
    this.offresAssurance.push(cree);
    return { ...cree };
  }
  async supprimerOffreAssurance(id: string): Promise<void> {
    const o = this.offresAssurance.find((x) => x.id === id);
    if (!o) throw new Error(`Retrait de l'offre d'assurance ${id} : offre inconnue.`);
    o.supprimeeLeISO = new Date().toISOString();
  }

  async listerOffresGaz(cycleIds: readonly string[]): Promise<OffreGaz[]> {
    return this.offresGaz.filter((o) => cycleIds.includes(o.cycleId) && !o.supprimeeLeISO).map((o) => ({ ...o }));
  }
  async creerOffreGaz(o: NouvelleOffreGaz): Promise<OffreGaz> {
    const cree: OffreGaz = { ...o, id: this.id("offg"), supprimeeLeISO: null };
    this.offresGaz.push(cree);
    return { ...cree };
  }
  async supprimerOffreGaz(id: string): Promise<void> {
    const o = this.offresGaz.find((x) => x.id === id);
    if (!o) throw new Error(`Retrait de l'offre gaz ${id} : offre inconnue.`);
    o.supprimeeLeISO = new Date().toISOString();
  }

  async listerDevisCtq(coproCodes: readonly string[]): Promise<DevisCtq[]> {
    return this.devis.filter((d) => coproCodes.includes(d.coproCode) && !d.supprimeeLeISO).map((d) => ({ ...d }));
  }
  async creerDevisCtq(d: NouveauDevisCtq): Promise<DevisCtq> {
    const cree: DevisCtq = { ...d, id: this.id("dev"), supprimeeLeISO: null };
    this.devis.push(cree);
    return { ...cree };
  }
  async supprimerDevisCtq(id: string): Promise<void> {
    const d = this.devis.find((x) => x.id === id);
    if (!d) throw new Error(`Retrait du devis ${id} : devis inconnu.`);
    d.supprimeeLeISO = new Date().toISOString();
  }
  async setDevisRetenu(coproCode: string, sujet: SujetCtq, devisId: string | null): Promise<void> {
    const c = this.exigerContrat(coproCode, `Devis ${sujet} retenu pour ${coproCode}`);
    c.devisRetenu = { ...c.devisRetenu, [sujet]: devisId };
  }

  // --- Contrat courant ----------------------------------------------------------------

  private exigerContrat(coproCode: string, contexte: string): ContratCourant {
    const c = this.contrats.get(coproCode);
    if (!c) throw new Error(`${contexte} : copropriété ${coproCode} introuvable.`);
    return c;
  }

  async getContratCourant(coproCode: string): Promise<ContratCourant | null> {
    const c = this.contrats.get(coproCode);
    return c ? structuredClone(c) : null;
  }
  async listerContratsCourants(coproCodes?: readonly string[]): Promise<Map<string, ContratCourant>> {
    const out = new Map<string, ContratCourant>();
    for (const [code, c] of this.contrats) if (!coproCodes || coproCodes.includes(code)) out.set(code, structuredClone(c));
    return out;
  }
  async setContratCourant(coproCode: string, patch: PatchContratCourant): Promise<void> {
    const c = this.exigerContrat(coproCode, `Correction du contrat courant de ${coproCode}`);
    const defini = <T extends object>(p: Partial<T> | undefined): Partial<T> =>
      Object.fromEntries(Object.entries(p ?? {}).filter(([, v]) => v !== undefined)) as Partial<T>;
    c.assurance = { ...c.assurance, ...defini(patch.assurance) };
    c.gaz = { ...c.gaz, ...defini(patch.gaz) };
    c.vmc = { ...c.vmc, ...defini(patch.vmc) };
    c.compteurs = { ...c.compteurs, ...defini(patch.compteurs) };
    c.immatriculation = { ...c.immatriculation, ...defini(patch.immatriculation) };
    if (patch.assurance?.prime !== undefined) {
      const fiche = this.fiches.get(coproCode);
      if (fiche) fiche.primeAssuranceActuelle = patch.assurance.prime;
    }
  }

  // --- Documents ----------------------------------------------------------------------

  async listerDocuments(cible: RattachementDocument | { type: "toute_copro"; coproCode: string }): Promise<DocumentContrat[]> {
    const vivants = this.documents.filter((d) => !d.supprimeLeISO);
    if (cible.type === "toute_copro") {
      const cyclesAss = new Set(this.cycles.filter((c) => c.coproCode === cible.coproCode && c.sujet === "assurance").map((c) => c.id));
      const cyclesGaz = new Set(this.cycles.filter((c) => c.coproCode === cible.coproCode && c.sujet === "gaz").map((c) => c.id));
      const offresAss = new Set(this.offresAssurance.filter((o) => cyclesAss.has(o.cycleId)).map((o) => o.id));
      const offresGaz = new Set(this.offresGaz.filter((o) => cyclesGaz.has(o.cycleId)).map((o) => o.id));
      const devis = new Set(this.devis.filter((d) => d.coproCode === cible.coproCode).map((d) => d.id));
      return vivants
        .filter((d) => {
          const r = d.rattachement;
          switch (r.type) {
            case "copro": return r.coproCode === cible.coproCode;
            case "cycle_assurance": return cyclesAss.has(r.cycleId);
            case "offre_assurance": return offresAss.has(r.offreId);
            case "offre_gaz": return offresGaz.has(r.offreId);
            case "devis_ctq": return devis.has(r.devisId);
          }
        })
        .map((d) => ({ ...d }));
    }
    return vivants.filter((d) => JSON.stringify(d.rattachement) === JSON.stringify(cible)).map((d) => ({ ...d }));
  }
  async getDocument(id: string): Promise<DocumentContrat | null> {
    const d = this.documents.find((x) => x.id === id);
    return d ? { ...d } : null;
  }
  async creerDocument(d: NouveauDocumentContrat): Promise<DocumentContrat> {
    const cree: DocumentContrat = { ...d, id: this.id("doc"), supprimeLeISO: null };
    this.documents.push(cree);
    return { ...cree };
  }
  async supprimerDocument(id: string): Promise<void> {
    const d = this.documents.find((x) => x.id === id);
    if (!d) throw new Error(`Retrait du document ${id} : document inconnu.`);
    d.supprimeLeISO = new Date().toISOString();
  }

  // --- Prestataires -------------------------------------------------------------------

  async listerPrestataires(coproCodes?: readonly string[]): Promise<PrestataireCopro[]> {
    return this.prestataires
      .filter((p) => !coproCodes || coproCodes.includes(p.coproCode))
      .map((p) => {
        const e = this.entreprises.get(p.entrepriseId);
        return { ...p, entrepriseNom: e?.nom ?? p.entrepriseNom, email: e?.email ?? p.email };
      });
  }
  async lierPrestataire(p: { coproCode: string; entrepriseId: string; metier: MetierPrestataire; principal: boolean }): Promise<void> {
    if (p.principal) {
      for (const x of this.prestataires) if (x.coproCode === p.coproCode && x.metier === p.metier) x.principal = false;
    }
    const existant = this.prestataires.find((x) => x.coproCode === p.coproCode && x.entrepriseId === p.entrepriseId && x.metier === p.metier);
    if (existant) {
      existant.principal = p.principal;
      return;
    }
    const e = this.entreprises.get(p.entrepriseId);
    this.prestataires.push({ ...p, entrepriseNom: e?.nom ?? "(entreprise inconnue)", email: e?.email ?? null });
  }
  async delierPrestataire(coproCode: string, entrepriseId: string, metier: MetierPrestataire): Promise<void> {
    const i = this.prestataires.findIndex((x) => x.coproCode === coproCode && x.entrepriseId === entrepriseId && x.metier === metier);
    if (i < 0) throw new Error(`Détachement de l'entreprise ${entrepriseId} de ${coproCode} (${metier}) : ce rattachement n'existe pas.`);
    this.prestataires.splice(i, 1);
  }

  // --- Règles de relance --------------------------------------------------------------

  async listerReglesRelance(): Promise<Record<SujetSuivi, RegleRelance>> {
    return { ...this.regles };
  }
  async sauverRegleRelance(r: RegleRelance): Promise<void> {
    this.regles = { ...this.regles, [r.sujet]: { ...r } };
  }

  // --- Journal ------------------------------------------------------------------------

  async ajouterJournal(e: NouvelleEntreeJournal): Promise<EntreeJournalContrats> {
    const cree: EntreeJournalContrats = { ...e, id: this.id("j"), horodatageISO: new Date().toISOString() };
    this.journal.push(cree);
    return { ...cree };
  }
  async listerJournal(coproCode: string, limite = 200): Promise<EntreeJournalContrats[]> {
    return this.journal
      .filter((e) => e.coproCode === coproCode)
      .sort((a, b) => b.horodatageISO.localeCompare(a.horodatageISO))
      .slice(0, limite)
      .map((e) => ({ ...e }));
  }

  // --- Fiche immeuble -----------------------------------------------------------------

  async getFicheImmeuble(coproCode: string): Promise<FicheImmeuble | null> {
    const f = this.fiches.get(coproCode);
    return f ? structuredClone(f) : null;
  }
  async listerFichesImmeuble(coproCodes?: readonly string[]): Promise<Map<string, FicheImmeuble>> {
    const out = new Map<string, FicheImmeuble>();
    for (const [code, f] of this.fiches) if (!coproCodes || coproCodes.includes(code)) out.set(code, structuredClone(f));
    return out;
  }
  async sauverFicheImmeuble(coproCode: string, patch: PatchFicheImmeuble): Promise<void> {
    if (!(CODES as readonly string[]).includes(coproCode) && !this.contrats.has(coproCode)) {
      throw new Error(`Fiche immeuble de ${coproCode} : copropriété introuvable.`);
    }
    const existante = this.fiches.get(coproCode) ?? ficheVide(coproCode);
    const defini = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    this.fiches.set(coproCode, { ...existante, ...defini });
  }
  async creerBatiment(b: NouveauBatiment): Promise<Batiment> {
    const fiche = this.fiches.get(b.coproCode) ?? ficheVide(b.coproCode);
    const cree: Batiment = { ...b, id: this.id("bat") };
    fiche.batiments.push(cree);
    this.fiches.set(b.coproCode, fiche);
    return { ...cree };
  }
  async sauverBatiment(b: Batiment): Promise<void> {
    for (const f of this.fiches.values()) {
      const i = f.batiments.findIndex((x) => x.id === b.id);
      if (i >= 0) {
        f.batiments[i] = { ...b };
        return;
      }
    }
    throw new Error(`Enregistrement du bâtiment ${b.id} : bâtiment inconnu.`);
  }
  async supprimerBatiment(id: string): Promise<void> {
    for (const f of this.fiches.values()) {
      const i = f.batiments.findIndex((x) => x.id === id);
      if (i >= 0) {
        f.batiments.splice(i, 1);
        return;
      }
    }
    throw new Error(`Suppression du bâtiment ${id} : bâtiment inconnu.`);
  }
}

function ficheVide(coproCode: string): FicheImmeuble {
  return {
    coproCode,
    surfaceM2: null,
    anneeConstruction: null,
    periodeConstruction: null,
    nombreBatiments: null,
    chauffageType: null,
    chauffageEnergie: null,
    chauffageSysteme: null,
    ecsType: null,
    ecsSysteme: null,
    ecsMemeQueChauffage: null,
    ventilationType: null,
    ventilationSysteme: null,
    bornesRechargeVE: null,
    locauxVelos: null,
    dpeCollectifRealise: null,
    diagnosticStructureRealise: null,
    pptInscritAG: null,
    pptVote: null,
    pptAdoptionISO: null,
    primeAssuranceActuelle: null,
    notes: null,
    batiments: [],
  };
}

// --- Le jeu de données -----------------------------------------------------------------------

/** Le jeu de dev : S104 bien fournie, S088 archivée chez un courtier, le reste à compléter. */
export function peuplerMockContratsCopro(repo: MockContratsCoproRepository): void {
  for (const code of CODES) repo.contrats.set(code, contratVide(code));

  // Entreprises (mêmes id que ceux que le mock des clés attribuerait à un référentiel partagé).
  repo.entreprises.set("ent-ascenseurs-martin", { nom: "Ascenseurs Martin", email: "contact@ascenseurs-martin.fr" });
  repo.entreprises.set("ent-verdier-courtage", { nom: "Cabinet Verdier Courtage", email: "copro@verdier-courtage.fr" });
  repo.entreprises.set("ent-vmc-services", { nom: "VMC Services", email: null });

  // ----- S104 Les Marronniers : deux ascenseurs, un dossier par sujet -----
  const s104 = repo.contrats.get("S104")!;
  s104.assurance = { compagnie: "AXA", numeroContrat: "MRI-2021-48812", courtier: null, souscriptionISO: j(-1700), echeanceISO: j(120), prime: 4980 };
  s104.gaz = { fournisseur: "Engie", typePrix: "variable", montant: 17900, echeanceISO: j(45) };
  s104.vmc = { societe: "VMC Services", reference: "VMC-104-A", dernierCtqISO: j(-1500) };
  s104.compteurs = { ascenseurs: 2, chaudieres: 1, vmcGaz: 1 };
  s104.energieChauffage = "GAZ";

  const asc1: Ascenseur = { id: "asc-s104-1", coproCode: "S104", identifiant: "OTIS-1204-A", dernierCtqISO: j(60 - 5 * 365), notes: null };
  const asc2: Ascenseur = { id: "asc-s104-2", coproCode: "S104", identifiant: "OTIS-1204-B", dernierCtqISO: j(100 - 5 * 365), notes: "Cabine rénovée en 2024" };
  repo.ascenseurs.push(asc1, asc2);

  repo.cycles.push(
    // Rouge : la fenêtre (J-120) est ouverte depuis 60 jours et rien n'a bougé.
    { id: "cyc-ctq-s104-a", sujet: "ctq_ascenseur", coproCode: "S104", ascenseurId: asc1.id, statut: "en_cours", echeanceISO: j(60), etapes: {}, demarreManuellement: null, creeLeISO: ts(-400) },
    // Vert : devis demandé puis reçu il y a peu.
    { id: "cyc-ctq-s104-b", sujet: "ctq_ascenseur", coproCode: "S104", ascenseurId: asc2.id, statut: "en_cours", echeanceISO: j(100), etapes: { devis_demande: j(-10), devis_recu: j(-2) }, demarreManuellement: null, creeLeISO: ts(-400) },
    // Assurance : offres reçues, à présenter au conseil.
    { id: "cyc-ass-s104", sujet: "assurance", coproCode: "S104", statut: "en_cours", echeanceISO: j(120), etapes: { sinistralite_demandee: j(-20), sinistralite_recue: j(-12), offres_demandees: j(-10), offres_recues: j(-1) }, demarreManuellement: null, offreRetenueId: null, notes: "Le CS souhaite comparer les franchises dégât des eaux.", creeLeISO: ts(-300) },
    // Gaz : un devis reçu.
    { id: "cyc-gaz-s104", sujet: "gaz", coproCode: "S104", statut: "en_cours", echeanceISO: j(45), etapes: { devis_demande: j(-15), devis_recu: j(-5) }, demarreManuellement: true, offreRetenueId: null, creeLeISO: ts(-30) },
    // VMC : amorcé sans échéance (à compléter).
    { id: "cyc-vmc-s104", sujet: "ctq_vmc", coproCode: "S104", statut: "en_cours", echeanceISO: null, etapes: {}, demarreManuellement: null, creeLeISO: ts(-400) },
  );

  repo.offresAssurance.push(
    { id: "offa-s104-1", cycleId: "cyc-ass-s104", assureur: "AXA", prime: 4850, franchise: 500, garanties: "MRI + RC + dégât des eaux franchise 500", recueLeISO: j(-3), supprimeeLeISO: null },
    { id: "offa-s104-2", cycleId: "cyc-ass-s104", assureur: "Allianz", prime: 4520, franchise: 750, garanties: "MRI + RC, franchise 750", recueLeISO: j(-1), supprimeeLeISO: null },
  );
  repo.offresGaz.push(
    { id: "offg-s104-1", cycleId: "cyc-gaz-s104", fournisseur: "Engie", typePrix: "fixe", montant: 18600, dureeMois: 24, recueLeISO: j(-5), supprimeeLeISO: null },
  );
  repo.devis.push(
    { id: "dev-s104-1", coproCode: "S104", sujet: "ctq_ascenseur", prestataire: "Bureau Veritas", montant: 1250, recueLeISO: j(-2), supprimeeLeISO: null },
  );

  repo.documents.push({
    id: "doc-s104-1",
    sujet: "assurance",
    typeDocument: "conditions_particulieres",
    nomAffiche: "S104_CONDITIONS_PARTICULIERES_2021.pdf",
    nomFichier: "CP AXA Marronniers 2021.pdf",
    mime: "application/pdf",
    tailleOctets: 376526,
    driveId: "b!mock-drive",
    itemId: "01MOCKITEM0001",
    webUrl: null,
    deposeParId: "u-el",
    deposeLeISO: ts(-200),
    rattachement: { type: "copro", coproCode: "S104" },
    supprimeLeISO: null,
  });

  repo.prestataires.push(
    { coproCode: "S104", entrepriseId: "ent-ascenseurs-martin", entrepriseNom: "Ascenseurs Martin", metier: "ascensoriste", principal: true, email: "contact@ascenseurs-martin.fr" },
    { coproCode: "S104", entrepriseId: "ent-vmc-services", entrepriseNom: "VMC Services", metier: "societe_vmc", principal: true, email: null },
  );

  repo.journal.push(
    { id: "j-1", coproCode: "S104", sujet: "assurance", cycleId: "cyc-ass-s104", type: "etape_datee", horodatageISO: ts(-10, "10:12:00"), parUserId: "u-el", parNom: "Élise Lambert", details: { etape: "offres_demandees", date: j(-10) } },
    { id: "j-2", coproCode: "S104", sujet: "assurance", cycleId: "cyc-ass-s104", type: "offre_creee", horodatageISO: ts(-1, "15:40:00"), parUserId: "u-lm", parNom: "Léa Martin", details: { fournisseur: "Allianz", montant: 4520 } },
    { id: "j-3", coproCode: "S104", sujet: "ctq_ascenseur", cycleId: null, type: "devis_cree", horodatageISO: ts(-2, "11:05:00"), parUserId: "u-el", parNom: "Élise Lambert", details: { prestataire: "Bureau Veritas", montant: 1250 } },
  );

  repo.fiches.set("S104", {
    ...ficheVide("S104"),
    surfaceM2: 2340,
    anneeConstruction: 1974,
    periodeConstruction: "DE_1949_A_1974",
    nombreBatiments: 1,
    chauffageType: "COLLECTIF",
    chauffageEnergie: "GAZ",
    primeAssuranceActuelle: 4980,
    batiments: [{ id: "bat-s104-a", coproCode: "S104", nom: "Bâtiment A", anneeConstruction: 1974, nombreEtages: 6, nombreAscenseurs: 2, etiquetteEnergie: "D" }],
  });

  // ----- S088 Résidence Foch : assurance placée par un courtier partenaire, cycle archivé -----
  const s088 = repo.contrats.get("S088")!;
  s088.assurance = { compagnie: "Generali", numeroContrat: "GEN-88-20240", courtier: "Cabinet Verdier Courtage", souscriptionISO: j(-230), echeanceISO: j(135), prime: null };
  s088.compteurs = { ascenseurs: 0, chaudieres: 0, vmcGaz: 0 };
  repo.cycles.push({
    id: "cyc-ass-s088",
    sujet: "assurance",
    coproCode: "S088",
    statut: "archive",
    echeanceISO: j(-230),
    etapes: { validee: j(-240) },
    demarreManuellement: null,
    offreRetenueId: null,
    notes: "Suivi par le courtier, pas de mise en concurrence cabinet.",
    creeLeISO: ts(-600),
  });
  repo.prestataires.push({ coproCode: "S088", entrepriseId: "ent-verdier-courtage", entrepriseNom: "Cabinet Verdier Courtage", metier: "courtier", principal: true, email: "copro@verdier-courtage.fr" });
}

// Singleton module-level : le jeu survit entre deux requêtes du serveur de dev.
const REPO = new MockContratsCoproRepository();
peuplerMockContratsCopro(REPO);

export function mockContratsCopro(): ContratsCoproRepository {
  return REPO;
}
