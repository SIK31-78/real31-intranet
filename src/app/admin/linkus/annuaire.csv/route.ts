// GET /admin/linkus/annuaire.csv : l'annuaire Linkus (copropriétaires ESTALE et leurs
// contacts, avec téléphones). ADMIN de la table User (Léa, téléphonie) et super-admins : le fichier porte les numéros de
// tous les copropriétaires. Lecture seule côté ESTALE.

import { getGestionnaireCourant } from "@/lib/auth/session";
import { peutExporterAnnuaireLinkus } from "@/lib/auth/roles";
import { exporterAnnuaireLinkus } from "@/lib/services/linkus/exporter-annuaire";
import { signalerException } from "@/lib/observabilite";

export const dynamic = "force-dynamic";

const texte = (message: string, status: number) =>
  new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

export async function GET(): Promise<Response> {
  const g = await getGestionnaireCourant();
  if (!g) return texte("Session expirée : reconnecte-toi.", 401);
  if (!peutExporterAnnuaireLinkus(g.email, g.role)) return texte("Export réservé aux administrateurs.", 403);

  let exp;
  try {
    exp = await exporterAnnuaireLinkus();
  } catch (e) {
    signalerException(e, { source: "admin/linkus/annuaire.csv" });
    console.error("[annuaire.csv]", e);
    return texte(`L'annuaire n'a pas pu être lu dans ESTALE : ${e instanceof Error ? e.message : String(e)}`, 500);
  }

  const ascii = exp.nomFichier.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7E]/g, "_");
  return new Response(exp.csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(exp.nomFichier)}`,
      "Cache-Control": "private, no-store",
      "X-Annuaire-Bilan": JSON.stringify(exp.bilan),
    },
  });
}
