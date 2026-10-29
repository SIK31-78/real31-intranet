// Adapter Supabase de la boîte d'équipe de l'écran E-mails (ADR-053) : tables
// intranet_mail_attribution (+ _historique), intranet_mail_note, intranet_mail_attente
// (supabase/sql/intranet_mail_equipe.sql).
// Tables absentes (SQL pas encore passé) : les lectures rendent null, les écritures lèvent
// BoiteEquipeInactive, et c'est signalé une fois par instance. Le texte d'une note n'apparaît
// jamais dans un message d'erreur ni dans un journal : seul le message PostgREST est repris.

import type { Attente, Attribution, CleMail, LigneHistoriqueAttribution, NoteInterne } from "@/lib/domain/boite-equipe";
import { BoiteEquipeInactive, type BoiteEquipeRepository, type NouvelleNote } from "@/lib/ports/boite-equipe-repository";
import { createSupabasePublicClient } from "./public-client";

export const SQL_BOITE_EQUIPE = "supabase/sql/intranet_mail_equipe.sql";
const ATTRIBUTION = "intranet_mail_attribution";
const HISTORIQUE = "intranet_mail_attribution_historique";
const NOTE = "intranet_mail_note";
const ATTENTE = "intranet_mail_attente";

/** Des identifiants par requête : un internetMessageId fait 60 à 120 caractères dans l'URL. */
const LOT = 50;

type ErreurPg = { code?: string; message: string } | null;

function tableAbsente(error: ErreurPg): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

let absenceSignalee = false;
function signalerAbsence(): void {
  if (absenceSignalee) return;
  absenceSignalee = true;
  console.warn(`[boite-equipe] tables absentes : attribution, notes et attente inactives (SQL à passer : ${SQL_BOITE_EQUIPE})`);
}

/** Erreur d'écriture : table absente => message métier ; sinon le message PostgREST seul. */
function echecEcriture(quoi: string, error: NonNullable<ErreurPg>): Error {
  if (tableAbsente(error)) {
    signalerAbsence();
    return new BoiteEquipeInactive();
  }
  return new Error(`Boîte d'équipe (${quoi}) : ${error.message}`);
}

function lotsDe<T>(valeurs: T[]): T[][] {
  const uniques = [...new Set(valeurs)].filter(Boolean);
  const lots: T[][] = [];
  for (let i = 0; i < uniques.length; i += LOT) lots.push(uniques.slice(i, i + LOT));
  return lots;
}

const db = () => createSupabasePublicClient();

interface RowAttribution {
  internet_message_id: string;
  boite: string;
  dossier_cle: string | null;
  attributaire_email: string;
  attributaire_nom: string;
  attributaire_initiales: string;
  par_email: string;
  par_initiales: string;
  geste: Attribution["geste"];
  le: string;
}

interface RowNote {
  id: string;
  internet_message_id: string;
  boite: string;
  auteur_id: string;
  auteur_email: string;
  auteur_nom: string;
  auteur_initiales: string;
  texte: string;
  cree_le: string;
  modifie_le: string | null;
}

interface RowAttente {
  internet_message_id: string;
  boite: string;
  nature: Attente["nature"];
  jusqu_au: string | null;
  conversation_id: string | null;
  dossier_cle: string | null;
  depuis: string;
  par_email: string;
  par_initiales: string;
  pose_le: string;
}

const versAttribution = (r: RowAttribution): Attribution => ({
  internetMessageId: r.internet_message_id,
  boite: r.boite,
  dossierCle: r.dossier_cle,
  attributaire: { email: r.attributaire_email, nomComplet: r.attributaire_nom, initiales: r.attributaire_initiales },
  parEmail: r.par_email,
  parInitiales: r.par_initiales,
  le: r.le,
  geste: r.geste,
});

const ligneAttribution = (a: Attribution): RowAttribution => ({
  internet_message_id: a.internetMessageId,
  boite: a.boite,
  dossier_cle: a.dossierCle,
  attributaire_email: a.attributaire.email,
  attributaire_nom: a.attributaire.nomComplet,
  attributaire_initiales: a.attributaire.initiales,
  par_email: a.parEmail,
  par_initiales: a.parInitiales,
  geste: a.geste,
  le: a.le,
});

const versNote = (r: RowNote): NoteInterne => ({
  id: r.id,
  internetMessageId: r.internet_message_id,
  boite: r.boite,
  auteurId: r.auteur_id,
  auteurEmail: r.auteur_email,
  auteurNom: r.auteur_nom,
  auteurInitiales: r.auteur_initiales,
  texte: r.texte,
  creeLe: r.cree_le,
  modifieLe: r.modifie_le,
});

const versAttente = (r: RowAttente): Attente => ({
  internetMessageId: r.internet_message_id,
  boite: r.boite,
  nature: r.nature,
  jusquAu: r.jusqu_au,
  conversationId: r.conversation_id,
  dossierCle: r.dossier_cle,
  depuis: r.depuis,
  parEmail: r.par_email,
  parInitiales: r.par_initiales,
  poseLe: r.pose_le,
});

/** Lecture par lots d'identifiants ; null si la table manque. */
async function lireParIds<R, T>(table: string, colonnes: string, ids: string[], vers: (r: R) => T): Promise<T[] | null> {
  const out: T[] = [];
  for (const lot of lotsDe(ids)) {
    const { data, error } = await db().from(table).select(colonnes).in("internet_message_id", lot);
    if (error) {
      if (tableAbsente(error)) {
        signalerAbsence();
        return null;
      }
      throw new Error(`Boîte d'équipe (lecture ${table}) : ${error.message}`);
    }
    for (const r of (data ?? []) as unknown as R[]) out.push(vers(r));
  }
  return out;
}

export class SupabaseBoiteEquipeRepository implements BoiteEquipeRepository {
  async attributions(ids: string[]): Promise<Attribution[] | null> {
    return lireParIds<RowAttribution, Attribution>(ATTRIBUTION, "*", ids, versAttribution);
  }

  private async historiser(h: LigneHistoriqueAttribution): Promise<void> {
    const { error } = await db().from(HISTORIQUE).insert({
      internet_message_id: h.internetMessageId,
      boite: h.boite,
      dossier_cle: h.dossierCle,
      geste: h.geste,
      attributaire_email: h.attributaireEmail,
      par_email: h.parEmail,
      le: h.le,
    });
    if (error) throw echecEcriture("historique", error);
  }

  private historiqueDe(a: Attribution): LigneHistoriqueAttribution {
    return { internetMessageId: a.internetMessageId, boite: a.boite, dossierCle: a.dossierCle, geste: a.geste, attributaireEmail: a.attributaire.email, parEmail: a.parEmail, le: a.le };
  }

  async attribuer(a: Attribution): Promise<void> {
    const { error } = await db().from(ATTRIBUTION).upsert(ligneAttribution(a), { onConflict: "internet_message_id,boite" });
    if (error) throw echecEcriture("attribution", error);
    await this.historiser(this.historiqueDe(a));
  }

  async attribuerSiLibre(a: Attribution): Promise<boolean> {
    const { data, error } = await db()
      .from(ATTRIBUTION)
      .upsert(ligneAttribution(a), { onConflict: "internet_message_id,boite", ignoreDuplicates: true })
      .select("internet_message_id");
    if (error) throw echecEcriture("attribution", error);
    if (!data?.length) return false;
    await this.historiser(this.historiqueDe(a));
    return true;
  }

  async retirerAttribution(c: CleMail, h: { dossierCle: string | null; parEmail: string; le: string }): Promise<void> {
    const { error } = await db().from(ATTRIBUTION).delete().eq("internet_message_id", c.internetMessageId).eq("boite", c.boite);
    if (error) throw echecEcriture("retrait", error);
    await this.historiser({ ...c, dossierCle: h.dossierCle, geste: "retirer", attributaireEmail: null, parEmail: h.parEmail, le: h.le });
  }

  async historiqueAttribution(c: CleMail, max: number): Promise<LigneHistoriqueAttribution[] | null> {
    const { data, error } = await db()
      .from(HISTORIQUE)
      .select("internet_message_id, boite, dossier_cle, geste, attributaire_email, par_email, le")
      .eq("boite", c.boite)
      .eq("internet_message_id", c.internetMessageId)
      .order("le", { ascending: false })
      .limit(max);
    if (error) {
      if (tableAbsente(error)) {
        signalerAbsence();
        return null;
      }
      throw new Error(`Boîte d'équipe (historique) : ${error.message}`);
    }
    return (data ?? []).map((r) => ({
      internetMessageId: r.internet_message_id as string,
      boite: r.boite as string,
      dossierCle: (r.dossier_cle as string | null) ?? null,
      geste: r.geste as LigneHistoriqueAttribution["geste"],
      attributaireEmail: (r.attributaire_email as string | null) ?? null,
      parEmail: r.par_email as string,
      le: r.le as string,
    }));
  }

  async notes(internetMessageId: string): Promise<NoteInterne[] | null> {
    return lireParIds<RowNote, NoteInterne>(NOTE, "*", [internetMessageId], versNote);
  }

  async compterNotes(ids: string[]): Promise<Map<string, number> | null> {
    // Seulement l'identifiant du mail : le texte des notes ne quitte pas la base pour un compte.
    const lignes = await lireParIds<{ internet_message_id: string }, string>(NOTE, "internet_message_id", ids, (r) => r.internet_message_id);
    if (!lignes) return null;
    const out = new Map<string, number>();
    for (const id of lignes) out.set(id, (out.get(id) ?? 0) + 1);
    return out;
  }

  async note(id: string): Promise<NoteInterne | null> {
    const { data, error } = await db().from(NOTE).select("*").eq("id", id).maybeSingle();
    if (error) {
      if (tableAbsente(error)) {
        signalerAbsence();
        return null;
      }
      // Un id qui n'est pas un uuid : pas de note, pas une panne.
      if (error.code === "22P02") return null;
      throw new Error(`Boîte d'équipe (note) : ${error.message}`);
    }
    return data ? versNote(data as RowNote) : null;
  }

  async ajouterNote(n: NouvelleNote): Promise<NoteInterne> {
    const { data, error } = await db()
      .from(NOTE)
      .insert({
        internet_message_id: n.internetMessageId,
        boite: n.boite,
        auteur_id: n.auteurId,
        auteur_email: n.auteurEmail,
        auteur_nom: n.auteurNom,
        auteur_initiales: n.auteurInitiales,
        texte: n.texte,
      })
      .select("*")
      .single();
    if (error) throw echecEcriture("note", error);
    return versNote(data as RowNote);
  }

  async modifierNote(id: string, texte: string, le: string): Promise<void> {
    const { error } = await db().from(NOTE).update({ texte, modifie_le: le }).eq("id", id);
    if (error) throw echecEcriture("note", error);
  }

  async supprimerNote(id: string): Promise<void> {
    const { error } = await db().from(NOTE).delete().eq("id", id);
    if (error) throw echecEcriture("note", error);
  }

  async attentes(ids: string[]): Promise<Attente[] | null> {
    return lireParIds<RowAttente, Attente>(ATTENTE, "*", ids, versAttente);
  }

  async relances(boites: string[]): Promise<Attente[] | null> {
    if (!boites.length) return [];
    const { data, error } = await db().from(ATTENTE).select("*").eq("nature", "relance").in("boite", [...new Set(boites)]).limit(1000);
    if (error) {
      if (tableAbsente(error)) {
        signalerAbsence();
        return null;
      }
      throw new Error(`Boîte d'équipe (relances) : ${error.message}`);
    }
    return ((data ?? []) as RowAttente[]).map(versAttente);
  }

  async poserAttente(a: Attente): Promise<void> {
    const ligne: RowAttente = {
      internet_message_id: a.internetMessageId,
      boite: a.boite,
      nature: a.nature,
      jusqu_au: a.jusquAu,
      conversation_id: a.conversationId,
      dossier_cle: a.dossierCle,
      depuis: a.depuis,
      par_email: a.parEmail,
      par_initiales: a.parInitiales,
      pose_le: a.poseLe,
    };
    const { error } = await db().from(ATTENTE).upsert(ligne, { onConflict: "internet_message_id,boite" });
    if (error) throw echecEcriture("attente", error);
  }

  async leverAttente(c: CleMail): Promise<void> {
    const { error } = await db().from(ATTENTE).delete().eq("internet_message_id", c.internetMessageId).eq("boite", c.boite);
    if (error) throw echecEcriture("attente", error);
  }
}
