// Envoi d'un fichier de l'ordinateur vers le brouillon de réponse préparé, tranche par tranche
// (REA-421, 27/10/2026) : une requête vers une fonction Vercel ne dépasse pas 4,5 Mo, un fichier
// de 20 Mo part donc en six tranches de 3,75 Mio vers /mes-emails/pj/depot. La progression est
// rendue à chaque tranche reçue par Outlook.

import { TRANCHE_UPLOAD } from "@/lib/domain/piece-jointe-flux";

export type ResultatDepotFichier = { ok: true } | { ok: false; erreur: string };

export async function deposerFichier(jeton: string, f: File, onProgres: (fraction: number) => void): Promise<ResultatDepotFichier> {
  let session = "";
  for (let debut = 0; debut < f.size; debut += TRANCHE_UPLOAD) {
    const fd = new FormData();
    fd.set("jeton", jeton);
    if (session) fd.set("session", session);
    fd.set("nom", f.name);
    fd.set("type", f.type);
    fd.set("taille", String(f.size));
    fd.set("debut", String(debut));
    fd.set("tranche", f.slice(debut, debut + TRANCHE_UPLOAD), "tranche");
    let r: Response;
    try {
      r = await fetch("/mes-emails/pj/depot", { method: "POST", body: fd });
    } catch {
      return { ok: false, erreur: `Connexion perdue pendant l'envoi de « ${f.name} ».` };
    }
    const j = (await r.json().catch(() => null)) as { ok?: boolean; fini?: boolean; session?: string; erreur?: string } | null;
    if (!r.ok || !j?.ok) return { ok: false, erreur: j?.erreur ?? `« ${f.name} » n'a pas pu être joint (erreur ${r.status}).` };
    onProgres(Math.min(1, (debut + TRANCHE_UPLOAD) / f.size));
    if (j.fini) return { ok: true };
    session = j.session ?? "";
  }
  return { ok: false, erreur: `« ${f.name} » n'a pas été joint en entier.` };
}
