// Adapter Supabase des remontees (table native intranet_feedback, service_role).
// Table absente (SQL pas encore passe) -> FeedbackNonConfigureError : la vitrine
// /nouveautes retombe sur un etat vide, le panneau admin affiche un bandeau "SQL a
// passer", jamais un crash.

import type { Feedback, StatutFeedback } from "@/lib/domain/feedback";
import { FeedbackNonConfigureError } from "@/lib/domain/feedback";
import { STATUTS_PUBLICS } from "@/lib/domain/feedback";
import type {
  ChangementStatut,
  EntreeAdmin,
  FeedbackRepository,
  FiltreFeedback,
  PatchFeedback,
  RemonteeFeedback,
} from "@/lib/ports/feedback-repository";
import { createSupabasePublicClient } from "./public-client";

const TABLE = "intranet_feedback";
const COLS =
  "id, type, titre, description, page, auteur_email, auteur_initiales, severite, statut, priorite, note_interne, raison_ecart, created_at, updated_at, livre_at";

type Row = {
  id: string;
  type: string;
  titre: string;
  description: string;
  page: string | null;
  auteur_email: string | null;
  auteur_initiales: string | null;
  severite: string | null;
  statut: string;
  priorite: number | null;
  note_interne: string | null;
  raison_ecart: string | null;
  created_at: string;
  updated_at: string | null;
  livre_at: string | null;
};

function tableAbsente(error: { code?: string; message: string }): boolean {
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /schema cache|could not find the table/i.test(error.message)
  );
}

function map(r: Row): Feedback {
  return {
    id: r.id,
    type: r.type as Feedback["type"],
    titre: r.titre,
    description: r.description,
    statut: r.statut as StatutFeedback,
    createdAt: r.created_at,
    ...(r.severite ? { severite: r.severite as Feedback["severite"] } : {}),
    ...(r.page ? { page: r.page } : {}),
    ...(r.auteur_email ? { auteurEmail: r.auteur_email } : {}),
    ...(r.auteur_initiales ? { auteurInitiales: r.auteur_initiales } : {}),
    ...(r.priorite !== null ? { priorite: r.priorite } : {}),
    ...(r.note_interne ? { noteInterne: r.note_interne } : {}),
    ...(r.raison_ecart ? { raisonEcart: r.raison_ecart } : {}),
    ...(r.updated_at ? { updatedAt: r.updated_at } : {}),
    ...(r.livre_at ? { livreAt: r.livre_at } : {}),
  };
}

export class SupabaseFeedbackRepository implements FeedbackRepository {
  async creer(remontee: RemonteeFeedback): Promise<Feedback> {
    const sb = createSupabasePublicClient();
    const { data, error } = await sb
      .from(TABLE)
      .insert({
        type: remontee.type,
        titre: remontee.titre,
        description: remontee.description,
        severite: remontee.severite,
        page: remontee.page ?? null,
        auteur_email: remontee.auteurEmail ?? null,
        auteur_initiales: remontee.auteurInitiales ?? null,
      })
      .select(COLS)
      .single();
    if (error) {
      if (tableAbsente(error)) throw new FeedbackNonConfigureError();
      throw new Error(`creer feedback : ${error.message}`);
    }
    return map(data as Row);
  }

  async creerEntree(entree: EntreeAdmin): Promise<Feedback> {
    const sb = createSupabasePublicClient();
    const { data, error } = await sb
      .from(TABLE)
      .insert({
        type: entree.type,
        titre: entree.titre,
        // description NOT NULL en base : une entree « maison » sans texte -> chaine vide.
        description: entree.description ?? "",
        statut: entree.statut,
        severite: entree.severite ?? null,
        priorite: entree.priorite ?? null,
        auteur_email: entree.auteurEmail ?? null,
        auteur_initiales: entree.auteurInitiales ?? null,
        livre_at: entree.livreAt ?? null,
      })
      .select(COLS)
      .single();
    if (error) {
      if (tableAbsente(error)) throw new FeedbackNonConfigureError();
      throw new Error(`creer entrée feedback : ${error.message}`);
    }
    return map(data as Row);
  }

  async lister(filtre?: FiltreFeedback): Promise<Feedback[]> {
    const sb = createSupabasePublicClient();
    let q = sb.from(TABLE).select(COLS).order("created_at", { ascending: false });
    if (filtre?.statut) q = q.eq("statut", filtre.statut);
    if (filtre?.type) q = q.eq("type", filtre.type);
    if (filtre?.severite) q = q.eq("severite", filtre.severite);
    const { data, error } = await q;
    if (error) {
      if (tableAbsente(error)) throw new FeedbackNonConfigureError();
      throw new Error(`lister feedback : ${error.message}`);
    }
    return (data as Row[]).map(map);
  }

  async get(id: string): Promise<Feedback | null> {
    const sb = createSupabasePublicClient();
    const { data, error } = await sb.from(TABLE).select(COLS).eq("id", id).maybeSingle();
    if (error) {
      if (tableAbsente(error)) throw new FeedbackNonConfigureError();
      throw new Error(`get feedback : ${error.message}`);
    }
    return data ? map(data as Row) : null;
  }

  async changerStatut(id: string, statut: StatutFeedback, opts: ChangementStatut): Promise<Feedback | null> {
    const sb = createSupabasePublicClient();
    const patch: Record<string, unknown> = {
      statut,
      updated_at: new Date().toISOString(),
    };
    // raison_ecart : posee si fournie, effacee si on quitte l'etat ecarte.
    patch.raison_ecart = statut === "ecarte" ? (opts.raisonEcart ?? null) : null;
    if (opts.livreAt) patch.livre_at = opts.livreAt;
    const { data, error } = await sb.from(TABLE).update(patch).eq("id", id).select(COLS).maybeSingle();
    if (error) {
      if (tableAbsente(error)) throw new FeedbackNonConfigureError();
      throw new Error(`changer statut feedback : ${error.message}`);
    }
    return data ? map(data as Row) : null;
  }

  async patch(id: string, patch: PatchFeedback): Promise<Feedback | null> {
    const sb = createSupabasePublicClient();
    const maj: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.titre !== undefined) maj.titre = patch.titre;
    if (patch.noteInterne !== undefined) maj.note_interne = patch.noteInterne;
    if (patch.priorite !== undefined) maj.priorite = patch.priorite; // null efface
    const { data, error } = await sb.from(TABLE).update(maj).eq("id", id).select(COLS).maybeSingle();
    if (error) {
      if (tableAbsente(error)) throw new FeedbackNonConfigureError();
      throw new Error(`editer feedback : ${error.message}`);
    }
    return data ? map(data as Row) : null;
  }

  async listerPublic(): Promise<Feedback[]> {
    const sb = createSupabasePublicClient();
    const { data, error } = await sb
      .from(TABLE)
      .select(COLS)
      .in("statut", STATUTS_PUBLICS as unknown as string[])
      .order("created_at", { ascending: false });
    if (error) {
      if (tableAbsente(error)) throw new FeedbackNonConfigureError();
      throw new Error(`lister feedback public : ${error.message}`);
    }
    return (data as Row[]).map(map);
  }
}
