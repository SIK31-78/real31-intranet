// Adapter Supabase des modèles de mail (table native intranet_mail_modeles, service_role).
// Table absente (SQL pas passé) -> ModelesMailNonConfigureError : le compositeur retombe
// sur les modèles de secours du code, l'écran d'admin affiche un bandeau, jamais un crash.

import { ModelesMailNonConfigureError, type ModeleMailStocke } from "@/lib/domain/modeles-mail";
import type { ModeleMailRepository, SaisieModeleMail } from "@/lib/ports/modele-mail-repository";
import { createSupabasePublicClient } from "./public-client";

const TABLE = "intranet_mail_modeles";
const COLS = "id, titre, objet, corps, agence, actif, auteur_email, created_at, updated_at";

type Row = {
  id: string;
  titre: string;
  objet: string;
  corps: string;
  agence: string | null;
  actif: boolean;
  auteur_email: string | null;
  created_at: string;
  updated_at: string | null;
};

function tableAbsente(error: { code?: string; message: string }): boolean {
  return error.code === "42P01" || error.code === "PGRST205" || /schema cache|could not find the table/i.test(error.message);
}

function echec(error: { code?: string; message: string }, quoi: string): never {
  if (tableAbsente(error)) throw new ModelesMailNonConfigureError();
  throw new Error(`${quoi} modèle de mail : ${error.message}`);
}

function map(r: Row): ModeleMailStocke {
  return {
    id: r.id,
    titre: r.titre,
    sujet: r.objet,
    corps: r.corps,
    agence: r.agence,
    actif: r.actif,
    ...(r.auteur_email ? { auteurEmail: r.auteur_email } : {}),
    majLe: r.updated_at ?? r.created_at,
  };
}

const versLigne = (s: SaisieModeleMail) => ({
  titre: s.titre,
  objet: s.sujet,
  corps: s.corps,
  agence: s.agence,
  actif: s.actif,
  ...(s.auteurEmail ? { auteur_email: s.auteurEmail } : {}),
});

export class SupabaseModeleMailRepository implements ModeleMailRepository {
  async listerTous(): Promise<ModeleMailStocke[]> {
    const { data, error } = await createSupabasePublicClient().from(TABLE).select(COLS).order("titre");
    if (error) echec(error, "lister");
    return (data as Row[]).map(map);
  }

  async trouver(id: string): Promise<ModeleMailStocke | null> {
    const { data, error } = await createSupabasePublicClient().from(TABLE).select(COLS).eq("id", id).maybeSingle();
    if (error) echec(error, "lire");
    return data ? map(data as Row) : null;
  }

  async creer(s: SaisieModeleMail): Promise<ModeleMailStocke> {
    const { data, error } = await createSupabasePublicClient().from(TABLE).insert(versLigne(s)).select(COLS).single();
    if (error) echec(error, "créer");
    return map(data as Row);
  }

  async modifier(id: string, s: SaisieModeleMail): Promise<ModeleMailStocke | null> {
    const { data, error } = await createSupabasePublicClient()
      .from(TABLE)
      .update({ ...versLigne(s), updated_at: new Date().toISOString() })
      .eq("id", id)
      .select(COLS)
      .maybeSingle();
    if (error) echec(error, "modifier");
    return data ? map(data as Row) : null;
  }

  async supprimer(id: string): Promise<boolean> {
    const { data, error } = await createSupabasePublicClient().from(TABLE).delete().eq("id", id).select("id").maybeSingle();
    if (error) echec(error, "supprimer");
    return Boolean(data);
  }
}
