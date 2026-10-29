// Boîte d'équipe en mémoire (dev local et tests) : même contrat que les tables
// intranet_mail_attribution / _note / _attente, perdu au redémarrage.

import type { Attente, Attribution, CleMail, LigneHistoriqueAttribution, NoteInterne } from "@/lib/domain/boite-equipe";
import type { BoiteEquipeRepository, NouvelleNote } from "@/lib/ports/boite-equipe-repository";

const cle = (c: CleMail) => `${c.boite}|${c.internetMessageId}`;

export class MemoireBoiteEquipeRepository implements BoiteEquipeRepository {
  readonly attributionsParCle = new Map<string, Attribution>();
  readonly historique: LigneHistoriqueAttribution[] = [];
  readonly notesParId = new Map<string, NoteInterne>();
  readonly attentesParCle = new Map<string, Attente>();
  private suivant = 1;

  async attributions(ids: string[]): Promise<Attribution[]> {
    const voulus = new Set(ids);
    return [...this.attributionsParCle.values()].filter((a) => voulus.has(a.internetMessageId));
  }

  async attribuer(a: Attribution): Promise<void> {
    this.attributionsParCle.set(cle(a), a);
    this.historique.push({ internetMessageId: a.internetMessageId, boite: a.boite, dossierCle: a.dossierCle, geste: a.geste, attributaireEmail: a.attributaire.email, parEmail: a.parEmail, le: a.le });
  }

  async attribuerSiLibre(a: Attribution): Promise<boolean> {
    if (this.attributionsParCle.has(cle(a))) return false;
    await this.attribuer(a);
    return true;
  }

  async retirerAttribution(c: CleMail, h: { dossierCle: string | null; parEmail: string; le: string }): Promise<void> {
    this.attributionsParCle.delete(cle(c));
    this.historique.push({ ...c, dossierCle: h.dossierCle, geste: "retirer", attributaireEmail: null, parEmail: h.parEmail, le: h.le });
  }

  async historiqueAttribution(c: CleMail, max: number): Promise<LigneHistoriqueAttribution[]> {
    return this.historique
      .filter((h) => h.boite === c.boite && h.internetMessageId === c.internetMessageId)
      .sort((a, b) => b.le.localeCompare(a.le))
      .slice(0, max);
  }

  async notes(internetMessageId: string): Promise<NoteInterne[]> {
    return [...this.notesParId.values()].filter((n) => n.internetMessageId === internetMessageId);
  }

  async compterNotes(ids: string[]): Promise<Map<string, number>> {
    const voulus = new Set(ids);
    const out = new Map<string, number>();
    for (const n of this.notesParId.values()) if (voulus.has(n.internetMessageId)) out.set(n.internetMessageId, (out.get(n.internetMessageId) ?? 0) + 1);
    return out;
  }

  async note(id: string): Promise<NoteInterne | null> {
    return this.notesParId.get(id) ?? null;
  }

  async ajouterNote(n: NouvelleNote): Promise<NoteInterne> {
    const note: NoteInterne = { ...n, id: `note-${this.suivant++}`, creeLe: new Date().toISOString(), modifieLe: null };
    this.notesParId.set(note.id, note);
    return note;
  }

  async modifierNote(id: string, texte: string, le: string): Promise<void> {
    const n = this.notesParId.get(id);
    if (n) this.notesParId.set(id, { ...n, texte, modifieLe: le });
  }

  async supprimerNote(id: string): Promise<void> {
    this.notesParId.delete(id);
  }

  async attentes(ids: string[]): Promise<Attente[]> {
    const voulus = new Set(ids);
    return [...this.attentesParCle.values()].filter((a) => voulus.has(a.internetMessageId));
  }

  async relances(boites: string[]): Promise<Attente[]> {
    const voulues = new Set(boites);
    return [...this.attentesParCle.values()].filter((a) => a.nature === "relance" && voulues.has(a.boite));
  }

  async poserAttente(a: Attente): Promise<void> {
    this.attentesParCle.set(cle(a), a);
  }

  async leverAttente(c: CleMail): Promise<void> {
    this.attentesParCle.delete(cle(c));
  }
}
