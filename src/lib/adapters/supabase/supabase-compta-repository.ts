// Adapter Supabase du pole compta (base patron, service_role).
//  - Notes : table native public.intranet_compta_notes (1 ligne / note).
//  - Flags : public.intranet_odj_champs (cle/valeur), champ_id "compta.*".

import type { ComptaRepository, FlagCompta } from "@/lib/ports/compta-repository";
import type { AuteurNote, EtatCompta, NoteCompta } from "@/lib/domain/compta";
import { FLAG_COMPTES_VERIFIES, FLAG_ENVOYER_AVANT } from "@/lib/domain/compta";
import { createSupabasePublicClient } from "./public-client";

type NoteRow = {
  id: string;
  copropriete_id: string;
  ag_date: string;
  auteur: string;
  texte: string;
  resolu: boolean;
  marque_par: string | null;
  created_at: string;
};
type ChampRow = { copropriete_id: string; ag_date: string; champ_id: string; valeur: string | null };

function champFlag(flag: FlagCompta): string {
  return flag === "verifies" ? FLAG_COMPTES_VERIFIES : FLAG_ENVOYER_AVANT;
}
function toNote(r: NoteRow): NoteCompta {
  return {
    id: r.id,
    auteur: (r.auteur === "comptable" ? "comptable" : "gestionnaire") as AuteurNote,
    texte: r.texte,
    resolu: r.resolu,
    createdAt: r.created_at,
    ...(r.marque_par ? { marquePar: r.marque_par } : {}),
  };
}

export class SupabaseComptaRepository implements ComptaRepository {
  async getEtat(coproCode: string, agDateISO: string): Promise<EtatCompta> {
    const supabase = createSupabasePublicClient();
    const [notesRes, champsRes] = await Promise.all([
      supabase
        .from("intranet_compta_notes")
        .select("id, auteur, texte, resolu, marque_par, created_at")
        .eq("copropriete_id", coproCode)
        .eq("ag_date", agDateISO)
        .order("created_at", { ascending: true }),
      supabase
        .from("intranet_odj_champs")
        .select("champ_id, valeur")
        .eq("copropriete_id", coproCode)
        .eq("ag_date", agDateISO)
        .in("champ_id", [FLAG_COMPTES_VERIFIES, FLAG_ENVOYER_AVANT]),
    ]);
    if (notesRes.error) throw new Error(`Lecture intranet_compta_notes : ${notesRes.error.message}`);
    if (champsRes.error) throw new Error(`Lecture flags compta : ${champsRes.error.message}`);
    const flags = new Map((champsRes.data as ChampRow[] | null)?.map((c) => [c.champ_id, c.valeur]) ?? []);
    return {
      comptesVerifies: Boolean(flags.get(FLAG_COMPTES_VERIFIES)),
      envoyerAvant: Boolean(flags.get(FLAG_ENVOYER_AVANT)),
      notes: ((notesRes.data as NoteRow[] | null) ?? []).map(toNote),
    };
  }

  async ajouterNote(
    coproCode: string,
    agDateISO: string,
    auteur: AuteurNote,
    texte: string,
    par: string,
  ): Promise<void> {
    const supabase = createSupabasePublicClient();
    const { error } = await supabase.from("intranet_compta_notes").insert({
      copropriete_id: coproCode,
      ag_date: agDateISO,
      auteur,
      texte,
      marque_par: par,
    });
    if (error) throw new Error(`Ajout note compta : ${error.message}`);
  }

  async marquerNote(noteId: string, resolu: boolean, par: string): Promise<void> {
    const supabase = createSupabasePublicClient();
    const { error } = await supabase
      .from("intranet_compta_notes")
      .update({ resolu, marque_par: par })
      .eq("id", noteId);
    if (error) throw new Error(`Maj note compta : ${error.message}`);
  }

  async setFlag(
    coproCode: string,
    agDateISO: string,
    flag: FlagCompta,
    valeur: boolean,
    par: string,
  ): Promise<void> {
    const supabase = createSupabasePublicClient();
    const champId = champFlag(flag);
    if (!valeur) {
      const { error } = await supabase
        .from("intranet_odj_champs")
        .delete()
        .eq("copropriete_id", coproCode)
        .eq("ag_date", agDateISO)
        .eq("champ_id", champId);
      if (error) throw new Error(`Retrait flag compta : ${error.message}`);
      return;
    }
    const { error } = await supabase.from("intranet_odj_champs").upsert(
      {
        copropriete_id: coproCode,
        ag_date: agDateISO,
        champ_id: champId,
        valeur: "1",
        marque_par: par,
        marque_at: new Date().toISOString(),
      },
      { onConflict: "copropriete_id,ag_date,champ_id" },
    );
    if (error) throw new Error(`Pose flag compta : ${error.message}`);
  }

  async getEtats(
    cles: { coproCode: string; agDateISO: string }[],
  ): Promise<Map<string, EtatCompta>> {
    const resultat = new Map<string, EtatCompta>();
    if (cles.length === 0) return resultat;
    const supabase = createSupabasePublicClient();
    const codes = [...new Set(cles.map((c) => c.coproCode))];
    const dates = [...new Set(cles.map((c) => c.agDateISO))];
    const [notesRes, champsRes] = await Promise.all([
      supabase
        .from("intranet_compta_notes")
        .select("id, copropriete_id, ag_date, auteur, texte, resolu, marque_par, created_at")
        .in("copropriete_id", codes)
        .in("ag_date", dates),
      supabase
        .from("intranet_odj_champs")
        .select("copropriete_id, ag_date, champ_id, valeur")
        .in("copropriete_id", codes)
        .in("ag_date", dates)
        .in("champ_id", [FLAG_COMPTES_VERIFIES, FLAG_ENVOYER_AVANT]),
    ]);
    if (notesRes.error) throw new Error(`Lecture notes compta : ${notesRes.error.message}`);
    if (champsRes.error) throw new Error(`Lecture flags compta : ${champsRes.error.message}`);

    for (const { coproCode, agDateISO } of cles) {
      resultat.set(`${coproCode}|${agDateISO}`, { comptesVerifies: false, envoyerAvant: false, notes: [] });
    }
    for (const r of (notesRes.data as NoteRow[] | null) ?? []) {
      const k = `${r.copropriete_id}|${r.ag_date}`;
      resultat.get(k)?.notes.push(toNote(r));
    }
    for (const c of (champsRes.data as ChampRow[] | null) ?? []) {
      const e = resultat.get(`${c.copropriete_id}|${c.ag_date}`);
      if (!e || !c.valeur) continue;
      if (c.champ_id === FLAG_COMPTES_VERIFIES) e.comptesVerifies = true;
      if (c.champ_id === FLAG_ENVOYER_AVANT) e.envoyerAvant = true;
    }
    for (const e of resultat.values()) {
      e.notes.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }
    return resultat;
  }
}
