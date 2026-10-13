// Les boites que le gestionnaire voit dans « Mes e-mails », SOURCE UNIQUE : l'affichage,
// les actions (autorisation du « De : », PJ, classement) et la generation IA lisent la meme
// liste. Sans ca, l'ecran montrait le dossier du binome mais les actions relisaient toute
// la reception de la boite partagee (mail introuvable, autorisation incoherente).
//
// Boite perso : la reception. Boite PARTAGEE (syndicN) : seulement le sous-dossier du
// binome du gestionnaire (decision Sekou du 13/10), resolu via le journal du tri
// (intranet_tri_dossier, cle = binome:email). Pas de dossier -> la boite partagee n'est
// pas visible : on n'expose jamais toute la boite commune.

import type { Gestionnaire } from "@/lib/domain/gestionnaire";
import { construireBoites, type BoiteMail } from "@/lib/domain/boites-mail";
import { cleDossierBinome } from "@/lib/domain/tri-emails";
import { getTriRepository } from "@/lib/adapters/router";

export async function boitesVisibles(g: Pick<Gestionnaire, "email">): Promise<BoiteMail[]> {
  const boites = construireBoites(g.email, process.env.MAIL_BOITES_PARTAGEES);
  const cle = g.email ? cleDossierBinome(g.email) : null;
  const repo = getTriRepository();
  const out: BoiteMail[] = [];
  for (const b of boites) {
    if (b.personnelle) {
      out.push(b);
      continue;
    }
    if (!cle) continue;
    try {
      const d = await repo.dossier(b.adresse, cle);
      if (d?.folderId) out.push({ ...b, folderId: d.folderId, libelle: `${b.libelle} · ${d.nom}` });
    } catch (err) {
      console.warn(`[mes-emails] dossier binome introuvable pour ${b.adresse} :`, (err as Error).message);
    }
  }
  return out;
}
