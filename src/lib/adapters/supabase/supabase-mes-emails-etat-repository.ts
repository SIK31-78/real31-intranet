// Adapter Supabase de l'etat "Mes emails" : etat persiste dans
// public.intranet_mes_emails_etat (base patron) via service_role, cle logique
// (gestionnaire_id, email_id). getEtats est deja cloisonne (on ne lit que les lignes
// du gestionnaire) ; l'ecriture est gardee en amont par la server action (coproAppartient).

import type {
  CleEtat,
  EtatMail,
  MajBrouillon,
  MajCopro,
  MajDossier,
  MajRattachement,
  MajStatut,
  MesEmailsEtatRepository,
  StatutEcrit,
} from "@/lib/ports/mes-emails-etat-provider";
import type { Rattachement, StatutTraitement } from "@/lib/domain/mes-emails";
import { createSupabasePublicClient } from "./public-client";

const TABLE = "intranet_mes_emails_etat";

type Row = {
  email_id: string;
  statut: string;
  etapes_faites: number[] | null;
  lu: boolean | null;
  brouillon: string | null;
  rattachement: Rattachement | null;
  copro_code?: string | null;
  copro_nom?: string | null;
  dossier_id?: string | null;
  dossier_nom?: string | null;
};

function versStatut(s: string): StatutTraitement {
  return s === "classe" || s === "repondu" ? s : "nouveau";
}

// Un `.in("email_id", …)` par lot de 100 : les internetMessageId font ~80 caracteres et
// PostgREST les passe dans l'URL.
const LOT = 100;

export class SupabaseMesEmailsEtatRepository implements MesEmailsEtatRepository {
  async getEtats(gestionnaireId: string, emailIds: string[]): Promise<EtatMail[]> {
    if (emailIds.length === 0) return [];
    const sb = createSupabasePublicClient();
    const lignes: Row[] = [];
    for (let i = 0; i < emailIds.length; i += LOT) {
      const { data, error } = await sb
        .from(TABLE)
        .select("*")
        .eq("gestionnaire_id", gestionnaireId)
        .in("email_id", emailIds.slice(i, i + LOT));
      if (error) {
        // Table pas encore creee : on degrade proprement (cockpit sans persistance) au
        // lieu de casser la page. 42P01 = table absente (SQL direct) ; PGRST205 / "schema
        // cache" = PostgREST ne la voit pas. Disparait des le SQL execute.
        if (
          error.code === "42P01" ||
          error.code === "PGRST205" ||
          /schema cache|could not find the table/i.test(error.message)
        ) {
          return [];
        }
        throw new Error(`getEtats mes-emails : ${error.message}`);
      }
      lignes.push(...((data as Row[] | null) ?? []));
    }
    return lignes.map((r) => ({
      emailId: r.email_id,
      statut: versStatut(r.statut),
      etapesFaites: r.etapes_faites ?? [],
      lu: r.lu ?? false,
      ...(r.brouillon != null ? { brouillon: r.brouillon } : {}),
      ...(r.rattachement != null ? { rattachement: r.rattachement } : {}),
      ...(r.copro_code ? { coproCode: r.copro_code, coproNom: r.copro_nom ?? "" } : {}),
      ...(r.dossier_id ? { dossierId: r.dossier_id, dossierNom: r.dossier_nom ?? "" } : {}),
    }));
  }

  async getStatutsDesMails(emailIds: string[]): Promise<StatutEcrit[]> {
    if (!emailIds.length) return [];
    const sb = createSupabasePublicClient();
    // Par lots (29/10/2026) : le chiffre « À traiter » lit les statuts de TOUS les mails
    // distribués (45 jours), plus seulement des 80 derniers ; une liste de plusieurs centaines
    // d'identifiants dans une seule URL serait refusée.
    const lots = [];
    for (let i = 0; i < emailIds.length; i += LOT) lots.push(emailIds.slice(i, i + LOT));
    const reponses = await Promise.all(
      lots.map((lot) => sb.from(TABLE).select("gestionnaire_id, email_id, statut, etapes_faites, marque_at").in("email_id", lot)),
    );
    // Lecture d'appoint : en cas d'echec, chacun garde son statut personnel.
    const echec = reponses.find((r) => r.error)?.error;
    if (echec) {
      console.warn("[mes-emails] statuts partages illisibles :", echec.message);
      return [];
    }
    const data = reponses.flatMap((r) => r.data ?? []);
    return ((data as (Pick<Row, "email_id" | "statut" | "etapes_faites"> & { gestionnaire_id: string; marque_at: string | null })[] | null) ?? []).map(
      (r) => ({
        gestionnaireId: r.gestionnaire_id,
        emailId: r.email_id,
        statut: versStatut(r.statut),
        etapesFaites: r.etapes_faites ?? [],
        ...(r.marque_at ? { marqueAt: r.marque_at } : {}),
      }),
    );
  }

  private async upsert(p: CleEtat, champs: Record<string, unknown>): Promise<void> {
    const sb = createSupabasePublicClient();
    const { error } = await sb.from(TABLE).upsert(
      {
        gestionnaire_id: p.gestionnaireId,
        email_id: p.emailId,
        copropriete_id: p.coproCode,
        marque_par: p.initiales,
        marque_at: new Date().toISOString(),
        ...champs,
      },
      { onConflict: "gestionnaire_id,email_id" },
    );
    // Table absente : on ignore (pas de persistance) au lieu de casser l'action.
    if (
      error &&
      error.code !== "42P01" &&
      error.code !== "PGRST205" &&
      !/schema cache|could not find the table/i.test(error.message)
    ) {
      throw new Error(`maj etat mes-emails : ${error.message}`);
    }
  }

  async setStatut(p: MajStatut): Promise<void> {
    await this.upsert(p, {
      statut: p.statut,
      etapes_faites: p.etapesFaites,
      ...(p.brouillon !== undefined ? { brouillon: p.brouillon } : {}),
    });
  }
  async setLu(p: CleEtat): Promise<void> {
    await this.upsert(p, { lu: true });
  }
  async setBrouillon(p: MajBrouillon): Promise<void> {
    await this.upsert(p, { brouillon: p.brouillon });
  }
  async setRattachement(p: MajRattachement): Promise<void> {
    await this.upsert(p, { rattachement: p.rattachement });
  }
  async setCopro(p: MajCopro): Promise<void> {
    await this.upsert(p, { copro_code: p.coproCode, copro_nom: p.coproNom });
  }
  async setDossier(p: MajDossier): Promise<void> {
    await this.upsert(p, { dossier_id: p.dossierId, dossier_nom: p.dossierNom });
  }
}
