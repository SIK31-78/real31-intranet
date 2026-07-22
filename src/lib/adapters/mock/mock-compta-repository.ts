// Adapter mock du pole compta : store module-level en memoire (dev hors supabase).

import type { ComptaRepository, FlagCompta } from "@/lib/ports/compta-repository";
import type { AuteurNote, EtatCompta, NoteCompta, StatutPoste } from "@/lib/domain/compta";

const ETATS = new Map<string, EtatCompta>();
let seq = 0;

function cle(coproCode: string, agDateISO: string): string {
  return `${coproCode}|${agDateISO}`;
}
function etat(k: string): EtatCompta {
  return ETATS.get(k) ?? { comptesVerifies: false, envoyerAvant: false, checks: {}, notes: [] };
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
  async marquerNote(
    coproCode: string,
    agDateISO: string,
    noteId: string,
    resolu: boolean,
    par: string,
  ): Promise<void> {
    // Cloisonnement : on ne touche la note que dans l'etat de la copro + AG ciblees ;
    // un noteId d'une autre copro reste hors de portee (coherent avec l'adapter Supabase).
    const k = cle(coproCode, agDateISO);
    const e = ETATS.get(k);
    if (!e || !e.notes.some((n) => n.id === noteId)) return;
    ETATS.set(k, {
      ...e,
      notes: e.notes.map((n) => (n.id === noteId ? { ...n, resolu, marquePar: par } : n)),
    });
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
  async setCheck(
    coproCode: string,
    agDateISO: string,
    slug: string,
    statut: StatutPoste,
  ): Promise<void> {
    const k = cle(coproCode, agDateISO);
    const e = etat(k);
    const checks = { ...e.checks };
    // "a_verifier" = defaut : on efface l'entree (coherent avec l'absence en base).
    if (statut === "a_verifier") delete checks[slug];
    else checks[slug] = statut;
    ETATS.set(k, { ...e, checks });
  }
  async getEtats(
    cles: { coproCode: string; agDateISO: string }[],
  ): Promise<Map<string, EtatCompta>> {
    const m = new Map<string, EtatCompta>();
    for (const { coproCode, agDateISO } of cles) {
      const k = cle(coproCode, agDateISO);
      m.set(k, etat(k));
    }
    return m;
  }
}
