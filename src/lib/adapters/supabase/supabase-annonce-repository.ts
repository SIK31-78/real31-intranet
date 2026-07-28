// Adapter Supabase des annonces (table native intranet_annonces, service_role).
// Table absente (SQL pas passe) -> AnnoncesNonConfigureError : l'accueil retombe sur
// un etat vide, le panneau admin affiche un bandeau "SQL a passer", jamais un crash.

import type { Annonce, NiveauAnnonce } from "@/lib/domain/annonce";
import { AnnoncesNonConfigureError } from "@/lib/domain/annonce";
import type { AnnonceRepository, PatchAnnonce, SaisieAnnonce } from "@/lib/ports/annonce-repository";
import { createSupabasePublicClient } from "./public-client";

const TABLE = "intranet_annonces";
const COLS =
  "id, titre, corps, niveau, actif, agences, emails, auteur_email, auteur_initiales, created_at, updated_at";

type Row = {
  id: string;
  titre: string;
  corps: string | null;
  niveau: string;
  actif: boolean;
  agences: string[] | null;
  emails: string[] | null;
  auteur_email: string | null;
  auteur_initiales: string | null;
  created_at: string;
  updated_at: string | null;
};

function tableAbsente(error: { code?: string; message: string }): boolean {
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /schema cache|could not find the table/i.test(error.message)
  );
}

function map(r: Row): Annonce {
  return {
    id: r.id,
    titre: r.titre,
    niveau: r.niveau as NiveauAnnonce,
    actif: r.actif,
    createdAt: r.created_at,
    ...(r.corps ? { corps: r.corps } : {}),
    ...(r.agences && r.agences.length > 0 ? { agences: r.agences } : {}),
    ...(r.emails && r.emails.length > 0 ? { emails: r.emails } : {}),
    ...(r.auteur_email ? { auteurEmail: r.auteur_email } : {}),
    ...(r.auteur_initiales ? { auteurInitiales: r.auteur_initiales } : {}),
    ...(r.updated_at ? { updatedAt: r.updated_at } : {}),
  };
}

export class SupabaseAnnonceRepository implements AnnonceRepository {
  async listerActives(): Promise<Annonce[]> {
    const sb = createSupabasePublicClient();
    const { data, error } = await sb
      .from(TABLE)
      .select(COLS)
      .eq("actif", true)
      .order("created_at", { ascending: false });
    if (error) {
      if (tableAbsente(error)) throw new AnnoncesNonConfigureError();
      throw new Error(`lister annonces actives : ${error.message}`);
    }
    return (data as Row[]).map(map);
  }

  async listerToutes(): Promise<Annonce[]> {
    const sb = createSupabasePublicClient();
    const { data, error } = await sb.from(TABLE).select(COLS).order("created_at", { ascending: false });
    if (error) {
      if (tableAbsente(error)) throw new AnnoncesNonConfigureError();
      throw new Error(`lister annonces : ${error.message}`);
    }
    return (data as Row[]).map(map);
  }

  async creer(saisie: SaisieAnnonce): Promise<Annonce> {
    const sb = createSupabasePublicClient();
    const { data, error } = await sb
      .from(TABLE)
      .insert({
        titre: saisie.titre,
        corps: saisie.corps ?? null,
        niveau: saisie.niveau,
        actif: saisie.actif,
        agences: saisie.agences && saisie.agences.length > 0 ? saisie.agences : null,
        emails: saisie.emails && saisie.emails.length > 0 ? saisie.emails : null,
        auteur_email: saisie.auteurEmail ?? null,
        auteur_initiales: saisie.auteurInitiales ?? null,
      })
      .select(COLS)
      .single();
    if (error) {
      if (tableAbsente(error)) throw new AnnoncesNonConfigureError();
      throw new Error(`creer annonce : ${error.message}`);
    }
    return map(data as Row);
  }

  async patch(id: string, patch: PatchAnnonce): Promise<Annonce | null> {
    const sb = createSupabasePublicClient();
    const maj: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.titre !== undefined) maj.titre = patch.titre;
    if (patch.niveau !== undefined) maj.niveau = patch.niveau;
    if (patch.actif !== undefined) maj.actif = patch.actif;
    if (patch.corps !== undefined) maj.corps = patch.corps === "" ? null : patch.corps; // null efface
    const { data, error } = await sb.from(TABLE).update(maj).eq("id", id).select(COLS).maybeSingle();
    if (error) {
      if (tableAbsente(error)) throw new AnnoncesNonConfigureError();
      throw new Error(`editer annonce : ${error.message}`);
    }
    return data ? map(data as Row) : null;
  }

  async supprimer(id: string): Promise<boolean> {
    const sb = createSupabasePublicClient();
    const { data, error } = await sb.from(TABLE).delete().eq("id", id).select("id").maybeSingle();
    if (error) {
      if (tableAbsente(error)) throw new AnnoncesNonConfigureError();
      throw new Error(`supprimer annonce : ${error.message}`);
    }
    return Boolean(data);
  }
}
