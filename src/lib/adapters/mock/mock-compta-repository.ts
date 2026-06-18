// Adapter mock du pole compta : store module-level en memoire (dev hors supabase).

import type { ComptaRepository, FlagCompta } from "@/lib/ports/compta-repository";
import type { AuteurNote, EtatCompta, NoteCompta } from "@/lib/domain/compta";

const ETATS = new Map<string, EtatCompta>();
let seq = 0;

function cle(coproCode: string, agDateISO: string): string {
  return `${coproCode}|${agDateISO}`;
}
function etat(k: string): EtatCompta {
  return ETATS.get(k) ?? { comptesVerifies: false, envoyerAvant: false, notes: [] };
}

export class MockComptaRepository implements ComptaRepository {
  async getEtat(coproCode: string, agDateISO: string): Promise<EtatCompta> {
    return etat(cle(coproCode, agDateISO));
  }
  async ajouterNote(
    coproCode: string,
    agDateISO: string,
    auteur: AuteurNote,
    texte: string,
    par: string,
  ): Promise<void> {
    const k = cle(coproCode, agDateISO);
    const e = etat(k);
    seq += 1;
    const note: NoteCompta = {
      id: `note-${seq}`,
      auteur,
      texte,
      resolu: false,
      createdAt: new Date().toISOString(),
      marquePar: par,
    };
    ETATS.set(k, { ...e, notes: [...e.notes, note] });
  }
  async marquerNote(noteId: string, resolu: boolean, par: string): Promise<void> {
    for (const [k, e] of ETATS) {
      if (e.notes.some((n) => n.id === noteId)) {
        ETATS.set(k, {
          ...e,
          notes: e.notes.map((n) => (n.id === noteId ? { ...n, resolu, marquePar: par } : n)),
        });
        return;
      }
    }
  }
  async setFlag(
    coproCode: string,
    agDateISO: string,
    flag: FlagCompta,
    valeur: boolean,
  ): Promise<void> {
    const k = cle(coproCode, agDateISO);
    const e = etat(k);
    ETATS.set(k, {
      ...e,
      ...(flag === "verifies" ? { comptesVerifies: valeur } : { envoyerAvant: valeur }),
    });
  }
  async getEtats(
    cles: { coproCode: string; agDateISO: string }[],
  ): Promise<Map<string, EtatCompta>> {
    const m = new Map<string, EtatCompta>();
    for (const { coproCode, agDateISO } of cles) {
      m.set(cle(coproCode, agDateISO), etat(cle(coproCode, agDateISO)));
    }
    return m;
  }
}
