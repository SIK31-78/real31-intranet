// Persistance EN MEMOIRE du tri des e-mails (COPRO_SOURCE != supabase, tests). Perdue au
// redemarrage. Aucune donnee reelle.
//
// Journal transactionnel comme en base (REA-420) : lignes « en_cours » actives 2 min, un seul
// rangement reel actif par mail (l'index unique partiel : DejaRangeErreur).

import { DELAI_RANGEMENT_EN_COURS_MS, type Binome, type BinomesTri, type DossierConnu, type EntreeJournalTri } from "@/lib/domain/tri-emails";
import { DejaRangeErreur, type NouvelleEntreeJournal, type OptionsDejaRange, type TriRepository } from "@/lib/ports/tri-repository";

/** Le filtre des lignes actives de l'adaptateur Supabase (lignesActives). */
const active = (e: EntreeJournalTri) => e.etat !== "en_cours" || Date.now() - Date.parse(e.faitLe) < DELAI_RANGEMENT_EN_COURS_MS;

export class MockTriRepository implements TriRepository {
  private journal: EntreeJournalTri[] = [];
  private dossiersParCle = new Map<string, { folderId: string; nom: string }>();
  private lesBinomes: Binome[];
  private parCopro: Record<string, string> = {};
  constructor(b: BinomesTri = { binomes: [], parCopro: {} }) {
    this.lesBinomes = [...b.binomes];
    this.parCopro = { ...b.parCopro };
  }

  async binomes(): Promise<BinomesTri> {
    return { binomes: [...this.lesBinomes], parCopro: { ...this.parCopro } };
  }
  async enregistrerBinome(b: Omit<Binome, "id"> & { id?: string }): Promise<string> {
    const id = b.id ?? `b-${this.lesBinomes.length + 1}-${b.assistant.email}`;
    this.lesBinomes = [...this.lesBinomes.filter((x) => x.id !== id), { ...b, id }];
    return id;
  }
  async supprimerBinome(id: string) {
    this.lesBinomes = this.lesBinomes.filter((x) => x.id !== id);
    for (const [ref, bid] of Object.entries(this.parCopro)) if (bid === id) delete this.parCopro[ref];
  }
  async affecterCopro(reference: string, binomeId: string | null) {
    if (binomeId) this.parCopro[reference] = binomeId;
    else delete this.parCopro[reference];
  }
  async dossier(boite: string, cle: string) {
    return this.dossiersParCle.get(`${boite}|${cle}`) ?? null;
  }
  async enregistrerDossier(boite: string, cle: string, d: { folderId: string; nom: string }) {
    this.dossiersParCle.set(`${boite}|${cle}`, d);
  }
  async dossiers(boite: string): Promise<DossierConnu[]> {
    return [...this.dossiersParCle.entries()]
      .filter(([k]) => k.startsWith(`${boite}|`))
      .map(([k, d]) => ({ cle: k.slice(boite.length + 1), ...d }));
  }
  async majCopro(id: string, reference: string | null) {
    const e = this.journal.find((x) => x.id === id);
    if (e) {
      e.coproReference = reference;
      e.copros = reference ? [reference] : [];
    }
  }
  async journaliser(e: NouvelleEntreeJournal): Promise<string> {
    return this.inserer(e, "fait");
  }
  async ouvrirRangement(e: NouvelleEntreeJournal): Promise<string | null> {
    return this.inserer(e, "en_cours");
  }
  private inserer(e: NouvelleEntreeJournal, etat: "en_cours" | "fait"): string {
    const doublon = this.journal.some(
      (x) => !e.simulation && !x.simulation && x.annuleLe === null && x.boite === e.boite && x.internetMessageId === e.internetMessageId,
    );
    if (doublon) throw new DejaRangeErreur();
    const id = `j-${this.journal.length + 1}`;
    this.journal.unshift({ ...e, id, faitLe: new Date().toISOString(), annuleLe: null, etat });
    return id;
  }
  async confirmerRangement(id: string, messageId: string) {
    const e = this.journal.find((x) => x.id === id);
    if (e) Object.assign(e, { etat: "fait", messageId });
  }
  async enCoursAReprendre(boite: string, avantISO: string, max: number) {
    return this.journal
      .filter((e) => e.boite === boite && e.etat === "en_cours" && !e.simulation && e.annuleLe === null && e.faitLe < avantISO)
      .sort((a, b) => a.faitLe.localeCompare(b.faitLe))
      .slice(0, max);
  }
  /** Tests : vieillit une ligne (rangement interrompu il y a `ms`). */
  vieillir(id: string, ms: number) {
    const e = this.journal.find((x) => x.id === id);
    if (e) e.faitLe = new Date(Date.parse(e.faitLe) - ms).toISOString();
  }
  async entree(id: string) {
    return this.journal.find((e) => e.id === id) ?? null;
  }
  async journalDepuis(boite: string, depuisISO: string) {
    return this.journal.filter((e) => e.boite === boite && e.annuleLe === null && e.faitLe >= depuisISO && active(e));
  }
  async journalPourCles(boite: string, depuisISO: string, cles: string[]) {
    const voulues = new Set(cles);
    return this.journal.filter((e) => e.boite === boite && e.annuleLe === null && e.faitLe >= depuisISO && e.dossierCle !== null && voulues.has(e.dossierCle) && active(e));
  }
  async rangementActif(boite: string, internetMessageId: string, depuisISO: string) {
    // Le journal garde les plus recents d'abord : le premier trouve est le rangement en cours.
    return this.journal.find((e) => e.boite === boite && e.internetMessageId === internetMessageId && e.annuleLe === null && e.faitLe >= depuisISO && active(e)) ?? null;
  }
  async dejaJournalises(boite: string, ids: string[], opts: OptionsDejaRange) {
    return new Set(
      this.journal
        .filter((e) => e.boite === boite && ids.includes(e.internetMessageId) && !(opts.reellesSeulement && e.simulation) && active(e))
        .map((e) => e.internetMessageId),
    );
  }
  async dejaRanges(boite: string, ids: string[], opts: OptionsDejaRange) {
    return new Set(
      this.journal
        .filter((e) => e.boite === boite && e.annuleLe === null && ids.includes(e.internetMessageId) && !(opts.reellesSeulement && e.simulation) && active(e))
        .map((e) => e.internetMessageId),
    );
  }
  async coprosDesConversations(boite: string, ids: string[]) {
    const out = new Map<string, string>();
    // Le journal garde les plus recents d'abord : le premier vu est le dernier rangement.
    for (const e of this.journal) {
      if (e.boite !== boite || e.annuleLe !== null || !e.coproReference || !e.conversationId || !active(e)) continue;
      if (ids.includes(e.conversationId) && !out.has(e.conversationId)) out.set(e.conversationId, e.coproReference);
    }
    return out;
  }
  async historiqueExpediteurs(boite: string, expediteurs: string[], depuisISO: string) {
    const cles = new Set(expediteurs.map((e) => e.trim().toLowerCase()));
    return this.journal.filter((e) => e.boite === boite && e.annuleLe === null && e.faitLe >= depuisISO && cles.has(e.expediteur.trim().toLowerCase()) && active(e));
  }
  async marquerAnnule(id: string): Promise<boolean> {
    const e = this.journal.find((x) => x.id === id);
    if (!e || e.annuleLe) return false;
    e.annuleLe = new Date().toISOString();
    return true;
  }
}
