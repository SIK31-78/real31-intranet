// Adapter Supabase de la supervision AG : template (code) + etat persiste dans
// public.intranet_supervision_items (base patron) via service_role.
// La supervision est identifiee par un id composite "CODE__DATE" (ex S001__2026-06-11).

import type { Auditeur, SupervisionAgProvider } from "@/lib/ports/supervision-ag-provider";
import type {
  ItemChecklist,
  SectionChecklist,
  StatutAg,
  StatutItem,
  SupervisionAg,
  VisaFinal,
} from "@/lib/domain/supervision-ag";
import { SECTIONS_TEMPLATE, ITEM_CONCLUSION, ITEM_CS_PREPA } from "@/lib/domain/supervision-ag-template";
import { createSupabasePublicClient } from "./public-client";

type EtatRow = {
  item_id: string;
  statut: string;
  commentaire: string | null;
  marque_par: string | null;
  marque_at: string | null;
};
type Ref = { code: string; agDate: string };

// Supervision sans AG planifiee : id = CODE seul, stocke sous une date sentinelle
// (evite un schema nullable). dateAgCible affichee = "Date non definie".
const SENTINEL_SANS_DATE = "0001-01-01";

function parse(agId: string): Ref | null {
  const i = agId.indexOf("__");
  if (i < 0) return agId ? { code: agId, agDate: SENTINEL_SANS_DATE } : null;
  return { code: agId.slice(0, i), agDate: agId.slice(i + 2) };
}
function dateCourte(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export class SupabaseSupervisionAgRepository implements SupervisionAgProvider {
  async getSupervision(agId: string, managerId?: string): Promise<SupervisionAg | undefined> {
    const ref = parse(agId);
    if (!ref) return undefined;
    const supabase = createSupabasePublicClient();
    let q = supabase
      .from("Copropriete")
      .select("name, nextCSDate, lastCSDate")
      .eq("referenceCrypto", ref.code);
    if (managerId) q = q.eq("managerId", managerId); // cloisonnement : hors scope -> undefined
    const { data: copro } = await q.maybeSingle();
    if (!copro) return undefined;
    const c = copro as { name: string; nextCSDate: string | null; lastCSDate: string | null };
    // Date du CS preparatoire connue sur la copro (prochain, sinon dernier) : sert de
    // valeur par defaut a l'item "CS preparatoire le" tant qu'il n'est pas saisi ici.
    const csDate = (c.nextCSDate ?? c.lastCSDate)?.slice(0, 10) ?? null;
    const { data } = await supabase
      .from("intranet_supervision_items")
      .select("item_id, statut, commentaire, marque_par, marque_at")
      .eq("copropriete_id", ref.code)
      .eq("ag_date", ref.agDate);
    const etat = new Map((data as EtatRow[] | null)?.map((r) => [r.item_id, r]) ?? []);
    return construire(agId, ref, c.name, etat, csDate);
  }

  async setStatutItem(
    agId: string,
    itemId: string,
    statut: StatutItem,
    auditeur: Auditeur,
  ): Promise<SupervisionAg> {
    const ref = exiger(agId);
    const supabase = createSupabasePublicClient();
    const { error } = await supabase.from("intranet_supervision_items").upsert(
      {
        copropriete_id: ref.code,
        ag_date: ref.agDate,
        item_id: itemId,
        statut,
        marque_par: auditeur.initiales,
        marque_at: new Date().toISOString(),
      },
      { onConflict: "copropriete_id,ag_date,item_id" },
    );
    if (error) throw new Error(`setStatutItem : ${error.message}`);
    return (await this.getSupervision(agId))!;
  }

  async setCommentaireItem(
    agId: string,
    itemId: string,
    commentaire: string,
    auditeur: Auditeur,
  ): Promise<SupervisionAg> {
    const ref = exiger(agId);
    const supabase = createSupabasePublicClient();
    // Preserver le statut existant (l'upsert ne fournit pas de statut sinon -> not null).
    const { data } = await supabase
      .from("intranet_supervision_items")
      .select("statut")
      .eq("copropriete_id", ref.code)
      .eq("ag_date", ref.agDate)
      .eq("item_id", itemId)
      .maybeSingle();
    const statut = (data as { statut: string } | null)?.statut ?? "non_verifie";
    const valeur = commentaire.trim();
    const { error } = await supabase.from("intranet_supervision_items").upsert(
      {
        copropriete_id: ref.code,
        ag_date: ref.agDate,
        item_id: itemId,
        statut,
        commentaire: valeur === "" ? null : valeur,
        marque_par: auditeur.initiales,
        marque_at: new Date().toISOString(),
      },
      { onConflict: "copropriete_id,ag_date,item_id" },
    );
    if (error) throw new Error(`setCommentaireItem : ${error.message}`);
    return (await this.getSupervision(agId))!;
  }

  async conclureAg(agId: string, visa: VisaFinal): Promise<SupervisionAg> {
    const ref = exiger(agId);
    const supabase = createSupabasePublicClient();
    const { error } = await supabase.from("intranet_supervision_items").upsert(
      {
        copropriete_id: ref.code,
        ag_date: ref.agDate,
        item_id: ITEM_CONCLUSION,
        statut: "conclue",
        marque_par: visa.initiales,
        marque_at: new Date().toISOString(),
      },
      { onConflict: "copropriete_id,ag_date,item_id" },
    );
    if (error) throw new Error(`conclureAg : ${error.message}`);
    return (await this.getSupervision(agId))!;
  }

  async reporterSansDate(coproCode: string, nouvelleDateISO: string): Promise<void> {
    if (nouvelleDateISO === SENTINEL_SANS_DATE) return;
    const supabase = createSupabasePublicClient();
    const { data } = await supabase
      .from("intranet_supervision_items")
      .select("item_id, statut, commentaire, marque_par, marque_at")
      .eq("copropriete_id", coproCode)
      .eq("ag_date", SENTINEL_SANS_DATE);
    const rows = (data as EtatRow[] | null) ?? [];
    if (rows.length === 0) return;
    const payload = rows.map((r) => ({
      copropriete_id: coproCode,
      ag_date: nouvelleDateISO,
      item_id: r.item_id,
      statut: r.statut,
      commentaire: r.commentaire,
      marque_par: r.marque_par,
      marque_at: r.marque_at,
    }));
    // La prepa "sans date" prime (upsert), puis on supprime les lignes sentinelles.
    const up = await supabase
      .from("intranet_supervision_items")
      .upsert(payload, { onConflict: "copropriete_id,ag_date,item_id" });
    if (up.error) throw new Error(`reporterSansDate : ${up.error.message}`);
    await supabase
      .from("intranet_supervision_items")
      .delete()
      .eq("copropriete_id", coproCode)
      .eq("ag_date", SENTINEL_SANS_DATE);
  }
}

function exiger(agId: string): Ref {
  const ref = parse(agId);
  if (!ref) throw new Error(`Supervision AG inconnue : ${agId}`);
  return ref;
}

function construire(
  agId: string,
  ref: Ref,
  nom: string,
  etat: Map<string, EtatRow>,
  csDate: string | null,
): SupervisionAg {
  const sections: SectionChecklist[] = SECTIONS_TEMPLATE.map((s) => ({
    id: s.id,
    titre: s.titre,
    items: s.items.map((t): ItemChecklist => {
      const e = etat.get(t.id);
      const item: ItemChecklist = {
        id: t.id,
        libelle: t.libelle,
        statut: (e?.statut as StatutItem) ?? "non_verifie",
      };
      if (t.type) item.type = t.type;
      if (e?.commentaire) item.commentaire = e.commentaire;
      // Pre-remplit "CS preparatoire le" avec la date CS de la copro si pas encore saisi.
      else if (t.id === ITEM_CS_PREPA && csDate) item.commentaire = csDate;
      if (e?.marque_at) item.audite = { initiales: e.marque_par ?? "?", le: e.marque_at };
      return item;
    }),
  }));

  const conclusion = etat.get(ITEM_CONCLUSION);
  const statut: StatutAg = conclusion ? "conclue_archivee" : "en_preparation";
  const sup: SupervisionAg = {
    id: agId,
    copro: { code: ref.code, nomCourt: nom },
    dateAgCible: ref.agDate === SENTINEL_SANS_DATE ? "Date non définie" : dateCourte(ref.agDate),
    statut,
    sections,
  };
  if (conclusion?.marque_at) {
    sup.visa = { initiales: conclusion.marque_par ?? "?", le: dateCourte(conclusion.marque_at) };
  }
  return sup;
}
