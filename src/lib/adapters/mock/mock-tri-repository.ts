// Persistance EN MEMOIRE du tri des e-mails (COPRO_SOURCE != supabase, tests). Perdue au
// redemarrage. Aucune donnee reelle.

import type { EntreeJournalTri, MembreTri } from "@/lib/domain/tri-emails";
import type { NouvelleEntreeJournal, TriRepository } from "@/lib/ports/tri-repository";

export class MockTriRepository implements TriRepository {
  private journal: EntreeJournalTri[] = [];
  private dossiers = new Map<string, { folderId: string; nom: string }>();
  private readonly lesBinomes: Record<string, MembreTri>;
  constructor(binomesInitiaux: Record<string, MembreTri> = {}) {
    this.lesBinomes = { ...binomesInitiaux };
  }

  async binomes(): Promise<Record<string, MembreTri>> {
    return { ...this.lesBinomes };
  }
  async definirBinome(emailGestionnaire: string, assistant: MembreTri) {
    this.lesBinomes[emailGestionnaire.toLowerCase()] = assistant;
  }
  async retirerBinome(emailGestionnaire: string) {
    delete this.lesBinomes[emailGestionnaire.toLowerCase()];
  }
  async dossier(boite: string, cle: string) {
    return this.dossiers.get(`${boite}|${cle}`) ?? null;
  }
  async enregistrerDossier(boite: string, cle: string, d: { folderId: string; nom: string }) {
    this.dossiers.set(`${boite}|${cle}`, d);
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
  async dejaRanges(boite: string, ids: string[]) {
    return new Set(
      this.journal.filter((e) => e.boite === boite && e.annuleLe === null && ids.includes(e.internetMessageId)).map((e) => e.internetMessageId),
    );
  }
  async marquerAnnule(id: string) {
    const e = this.journal.find((x) => x.id === id);
    if (e) e.annuleLe = new Date().toISOString();
  }
}
