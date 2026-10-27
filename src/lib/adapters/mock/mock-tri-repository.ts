// Persistance EN MEMOIRE du tri des e-mails (COPRO_SOURCE != supabase, tests). Perdue au
// redemarrage. Aucune donnee reelle.

import type { Binome, BinomesTri, DossierConnu, EntreeJournalTri } from "@/lib/domain/tri-emails";
import type { NouvelleEntreeJournal, OptionsDejaRange, TriRepository } from "@/lib/ports/tri-repository";

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
    const id = `j-${this.journal.length + 1}`;
    this.journal.unshift({ ...e, id, faitLe: new Date().toISOString(), annuleLe: null });
    return id;
  }
  async entree(id: string) {
    return this.journal.find((e) => e.id === id) ?? null;
  }
  async journalDepuis(boite: string, depuisISO: string) {
    return this.journal.filter((e) => e.boite === boite && e.annuleLe === null && e.faitLe >= depuisISO);
  }
  async dejaJournalises(boite: string, ids: string[], opts: OptionsDejaRange) {
    return new Set(
      this.journal
        .filter((e) => e.boite === boite && ids.includes(e.internetMessageId) && !(opts.reellesSeulement && e.simulation))
        .map((e) => e.internetMessageId),
    );
  }
  async dejaRanges(boite: string, ids: string[], opts: OptionsDejaRange) {
    return new Set(
      this.journal
        .filter((e) => e.boite === boite && e.annuleLe === null && ids.includes(e.internetMessageId) && !(opts.reellesSeulement && e.simulation))
        .map((e) => e.internetMessageId),
    );
  }
  async coprosDesConversations(boite: string, ids: string[]) {
    const out = new Map<string, string>();
    // Le journal garde les plus recents d'abord : le premier vu est le dernier rangement.
    for (const e of this.journal) {
      if (e.boite !== boite || e.annuleLe !== null || !e.coproReference || !e.conversationId) continue;
      if (ids.includes(e.conversationId) && !out.has(e.conversationId)) out.set(e.conversationId, e.coproReference);
    }
    return out;
  }
  async historiqueExpediteurs(boite: string, expediteurs: string[], depuisISO: string) {
    const cles = new Set(expediteurs.map((e) => e.trim().toLowerCase()));
    return this.journal.filter((e) => e.boite === boite && e.annuleLe === null && e.faitLe >= depuisISO && cles.has(e.expediteur.trim().toLowerCase()));
  }
  async marquerAnnule(id: string): Promise<boolean> {
    const e = this.journal.find((x) => x.id === id);
    if (!e || e.annuleLe) return false;
    e.annuleLe = new Date().toISOString();
    return true;
  }
}
