// Index de la reception EN MEMOIRE (REA-419, 27/10/2026) : COPRO_SOURCE != supabase, et tests.
// Perdu au redemarrage. Meme contrat que l'adaptateur Supabase (supabase-reception-index.ts).

import type { RawMail } from "@/lib/domain/tri-mail/raw-mail";
import type { EtatDelta, ReceptionIndex } from "@/lib/ports/reception-index";

interface Ligne {
  mail: RawMail;
  majLe: string;
  sortiLe: string | null;
}

export class MemoireReceptionIndex implements ReceptionIndex {
  private lignes = new Map<string, Map<string, Ligne>>();
  private etats = new Map<string, EtatDelta>();
  constructor(private readonly maintenant: () => number = Date.now) {}

  private boite(boite: string): Map<string, Ligne> {
    let b = this.lignes.get(boite);
    if (!b) this.lignes.set(boite, (b = new Map()));
    return b;
  }

  private iso(): string {
    return new Date(this.maintenant()).toISOString();
  }

  async appliquer(boite: string, delta: { ajoutes: RawMail[]; retires: string[] }): Promise<{ sortis: string[] }> {
    const b = this.boite(boite);
    const t = this.iso();
    for (const m of delta.ajoutes) b.set(m.internetMessageId, { mail: { ...m }, majLe: t, sortiLe: null });
    const retires = new Set(delta.retires);
    const sortis: string[] = [];
    for (const [cle, l] of b) {
      if (l.sortiLe === null && retires.has(l.mail.id)) {
        l.sortiLe = t;
        l.majLe = t;
        sortis.push(cle);
      }
    }
    return { sortis };
  }

  private presents(boite: string, depuis?: string): Ligne[] {
    return [...this.boite(boite).values()].filter((l) => l.sortiLe === null && (!depuis || Date.parse(l.mail.receivedAt) >= Date.parse(depuis)));
  }

  async enReception(boite: string, opts: { depuis?: string } = {}): Promise<RawMail[]> {
    return this.presents(boite, opts.depuis)
      .map((l) => ({ ...l.mail }))
      .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
  }

  async compter(boite: string, opts: { depuis?: string } = {}): Promise<number> {
    return this.presents(boite, opts.depuis).length;
  }

  async jetonDelta(boite: string): Promise<EtatDelta | null> {
    const e = this.etats.get(boite);
    return e ? { ...e } : null;
  }

  async enregistrerJetonDelta(boite: string, etat: { jeton: string | null; erreur?: string | null; resynchroLe?: string | null }): Promise<void> {
    this.etats.set(boite, { jeton: etat.jeton, majLe: this.iso(), erreur: etat.erreur ?? null, resynchroLe: etat.resynchroLe ?? null });
  }

  async sortir(boite: string, internetMessageIds: string[]): Promise<void> {
    const b = this.boite(boite);
    const t = this.iso();
    for (const id of internetMessageIds) {
      const l = b.get(id);
      if (l && l.sortiLe === null) Object.assign(l, { sortiLe: t, majLe: t });
    }
  }

  async remettre(boite: string, internetMessageId: string, messageId?: string): Promise<void> {
    const l = this.boite(boite).get(internetMessageId);
    if (!l) return;
    l.sortiLe = null;
    l.majLe = this.iso();
    if (messageId) l.mail = { ...l.mail, id: messageId };
  }

  async sortirNonRevus(boite: string, avantISO: string): Promise<number> {
    let n = 0;
    const t = this.iso();
    for (const l of this.boite(boite).values()) {
      if (l.sortiLe === null && l.majLe < avantISO) {
        Object.assign(l, { sortiLe: t, majLe: t });
        n++;
      }
    }
    return n;
  }

  async purger(boite: string, sortisAvantISO: string): Promise<number> {
    const b = this.boite(boite);
    let n = 0;
    for (const [cle, l] of b) {
      if (l.sortiLe !== null && l.sortiLe < sortisAvantISO) {
        b.delete(cle);
        n++;
      }
    }
    return n;
  }
}
