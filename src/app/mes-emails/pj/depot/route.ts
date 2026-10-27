// POST /mes-emails/pj/depot (multipart/form-data) : une TRANCHE d'un fichier de l'ordinateur,
// jointe au brouillon de réponse déjà préparé par preparerEnvoiAction (REA-421, 27/10/2026).
// Champs : jeton (du brouillon), session (rendue par la tranche précédente, absente à la
// première), nom, type, taille (du fichier entier), debut (octet de départ), tranche (Blob de
// 3,75 Mio au plus : une requête vers une fonction Vercel ne dépasse pas 4,5 Mo).
// Le jeton chiffré porte la boîte, le brouillon et le gestionnaire : on ne dépose que sur SON
// brouillon, dans les 15 minutes qui suivent sa préparation.

import type { NextRequest } from "next/server";
import { getGestionnaireCourant, mailModuleActifPour } from "@/lib/auth/session";
import { TRANCHE_UPLOAD } from "@/lib/domain/piece-jointe-flux";
import { deposerTranche } from "@/lib/services/mes-emails/depot-piece-jointe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const json = (statut: number, corps: Record<string, unknown>) =>
  Response.json(corps, { status: statut, headers: { "Cache-Control": "private, no-store" } });

export async function POST(req: NextRequest): Promise<Response> {
  const g = await getGestionnaireCourant();
  if (!g) return json(401, { ok: false, erreur: "Non connecté." });
  if (!g.email || !mailModuleActifPour(g.email)) return json(403, { ok: false, erreur: "Le module mail n'est pas ouvert pour ce compte." });
  // Une requête plus grosse qu'une tranche (et son enveloppe) n'est même pas lue.
  if (Number(req.headers.get("content-length") ?? 0) > TRANCHE_UPLOAD + 64 * 1024) {
    return json(413, { ok: false, erreur: "Tranche trop grosse." });
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json(400, { ok: false, erreur: "Envoi illisible." });
  }
  const texte = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v : "";
  };
  const tranche = form.get("tranche");
  const jeton = texte("jeton");
  if (!(tranche instanceof Blob) || !jeton || jeton.length > 4000 || texte("session").length > 4000) {
    return json(400, { ok: false, erreur: "Envoi illisible." });
  }
  const r = await deposerTranche({
    jeton,
    session: texte("session") || null,
    gid: g.id,
    nom: texte("nom"),
    type: texte("type").slice(0, 200),
    taille: Number(texte("taille")),
    debut: Number(texte("debut")),
    octets: new Uint8Array(await tranche.arrayBuffer()),
  });
  return r.ok ? json(200, r) : json(r.statut, { ok: false, erreur: r.erreur });
}
