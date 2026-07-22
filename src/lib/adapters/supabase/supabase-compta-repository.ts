// Adapter Supabase du pole compta (base patron, service_role).
//  - Notes : table native public.intranet_compta_notes (1 ligne / note).
//  - Flags : public.intranet_odj_champs (cle/valeur), champ_id "compta.*".

import type { ComptaRepository, FlagCompta } from "@/lib/ports/compta-repository";
import type { AuteurNote, EtatCompta, NoteCompta, StatutPoste } from "@/lib/domain/compta";
import {
  FLAG_COMPTES_VERIFIES,
  FLAG_ENVOYER_AVANT,
  champIdPoste,
  estStatutPoste,
  posteDepuisChampId,
} from "@/lib/domain/compta";
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
/** Range une ligne champ dans l'etat cible : flag connu ou poste de checklist valide. */
function appliquerChamp(e: EtatCompta, champId: string, valeur: string | null): void {
  if (champId === FLAG_COMPTES_VERIFIES) {
    e.comptesVerifies = Boolean(valeur);
  } else if (champId === FLAG_ENVOYER_AVANT) {
    e.envoyerAvant = Boolean(valeur);
  } else {
    const slug = posteDepuisChampId(champId);
    if (slug && estStatutPoste(valeur)) e.checks[slug] = valeur;
  }
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
        // Namespace "compta.*" : les 2 flags ET les postes de checklist (compta.check.*),
        // sans ramener les champs ODJ (lieu, point.*...) de la meme table.
        .eq("copropriete_id", coproCode)
        .eq("ag_date", agDateISO)
        .like("champ_id", "compta.%"),
    ]);
    if (notesRes.error) throw new Error(`Lecture intranet_compta_notes : ${notesRes.error.message}`);
    if (champsRes.error) throw new Error(`Lecture flags compta : ${champsRes.error.message}`);
    const etat: EtatCompta = {
      comptesVerifies: false,
      envoyerAvant: false,
      checks: {},
      notes: ((notesRes.data as NoteRow[] | null) ?? []).map(toNote),
    };
    for (const c of (champsRes.data as ChampRow[] | null) ?? []) {
      appliquerChamp(etat, c.champ_id, c.valeur);
    }
    return etat;
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

  async marquerNote(
    coproCode: string,
    agDateISO: string,
    noteId: string,
    resolu: boolean,
    par: string,
  ): Promise<void> {
    const supabase = createSupabasePublicClient();
    // L'UPDATE est borne a la copro + AG ciblees : un noteId d'une autre copro ne
    // matche pas (anti-IDOR), en complement de la garde d'appartenance cote action.
    const { error } = await supabase
      .from("intranet_compta_notes")
      .update({ resolu, marque_par: par })
      .eq("id", noteId)
      .eq("copropriete_id", coproCode)
      .eq("ag_date", agDateISO);
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

  async setCheck(
    coproCode: string,
    agDateISO: string,
    slug: string,
    statut: StatutPoste,
    par: string,
  ): Promise<void> {
    const supabase = createSupabasePublicClient();
    const champId = champIdPoste(slug);
    // "a_verifier" = defaut : on efface l'entree (comme le retrait d'un flag).
    if (statut === "a_verifier") {
      const { error } = await supabase
        .from("intranet_odj_champs")
        .delete()
        .eq("copropriete_id", coproCode)
        .eq("ag_date", agDateISO)
        .eq("champ_id", champId);
      if (error) throw new Error(`Retrait poste compta : ${error.message}`);
      return;
    }
    const { error } = await supabase.from("intranet_odj_champs").upsert(
      {
        copropriete_id: coproCode,
        ag_date: agDateISO,
        champ_id: champId,
        valeur: statut,
        marque_par: par,
        marque_at: new Date().toISOString(),
      },
      { onConflict: "copropriete_id,ag_date,champ_id" },
    );
    if (error) throw new Error(`Pose poste compta : ${error.message}`);
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
        .like("champ_id", "compta.%"),
    ]);
    if (notesRes.error) throw new Error(`Lecture notes compta : ${notesRes.error.message}`);
    if (champsRes.error) throw new Error(`Lecture flags compta : ${champsRes.error.message}`);

    for (const { coproCode, agDateISO } of cles) {
      resultat.set(`${coproCode}|${agDateISO}`, { comptesVerifies: false, envoyerAvant: false, checks: {}, notes: [] });
    }
    for (const r of (notesRes.data as NoteRow[] | null) ?? []) {
      const k = `${r.copropriete_id}|${r.ag_date}`;
      resultat.get(k)?.notes.push(toNote(r));
    }
    for (const c of (champsRes.data as ChampRow[] | null) ?? []) {
      const e = resultat.get(`${c.copropriete_id}|${c.ag_date}`);
      if (e) appliquerChamp(e, c.champ_id, c.valeur);
    }
    for (const e of resultat.values()) {
      e.notes.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }
    return resultat;
  }
}
