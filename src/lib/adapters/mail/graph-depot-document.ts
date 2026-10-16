// Dépôt d'un document dans un dossier SharePoint de copropriété, par Graph en app-only
// (même jeton que le mail). Droit attendu : Sites.Selected, accès « write » accordé au
// seul site « copro » par un administrateur (REA-116). Sans ce droit, Graph répond 403 :
// la raison remonte à l'utilisateur, rien ne casse.
//
// Fichiers de moins de 4 Mo (le contrat fait ~180 Ko) : envoi simple en un PUT. Au-delà,
// il faudrait une session d'upload : on refuse plutôt que de tronquer.

import { graphFetch, jetonGraph } from "./graph-auth";
import { resoudreDossier, siteDepuisUrl } from "@/lib/domain/contrat/depot-contrat";
import type { ConflitDepot, DepotDocumentProvider, ResultatDepot } from "@/lib/ports/depot-document-provider";

const GRAPH = "https://graph.microsoft.com/v1.0";
const TAILLE_MAX = 4 * 1024 * 1024;

type Bibliotheque = { id: string; webUrl: string };

// Bibliothèques par site, gardées le temps de l'instance : elles ne bougent pas.
const bibliothequesParSite = new Map<string, Promise<Bibliotheque[]>>();

class ErreurDepot extends Error {}

function chemin(segments: string[]): string {
  return segments.map(encodeURIComponent).join("/");
}

async function lireJson<T>(r: Response, quoi: string): Promise<T> {
  if (r.status === 401 || r.status === 403) {
    throw new ErreurDepot("l'intranet n'a pas le droit d'écrire dans SharePoint (autorisation à demander à l'administrateur).");
  }
  if (!r.ok) throw new ErreurDepot(`${quoi} : SharePoint a répondu ${r.status}.`);
  return (await r.json()) as T;
}

async function bibliotheques(tk: string, hote: string, cheminSite: string): Promise<Bibliotheque[]> {
  const cle = `${hote}${cheminSite}`.toLowerCase();
  let p = bibliothequesParSite.get(cle);
  if (!p) {
    p = (async () => {
      const auth = { headers: { Authorization: `Bearer ${tk}` } };
      const site = await lireJson<{ id: string }>(await graphFetch(`${GRAPH}/sites/${hote}:${cheminSite}?$select=id`, auth), "site introuvable");
      const d = await lireJson<{ value: Bibliotheque[] }>(
        await graphFetch(`${GRAPH}/sites/${site.id}/drives?$select=id,webUrl`, auth),
        "bibliothèques illisibles",
      );
      return d.value;
    })();
    bibliothequesParSite.set(cle, p);
    p.catch(() => bibliothequesParSite.delete(cle));
  }
  return p;
}

/** Crée le dossier `nom` dans `parent` s'il n'existe pas (409 = déjà là). */
async function assurerDossier(tk: string, driveId: string, parent: string[], nom: string): Promise<void> {
  const r = await graphFetch(`${GRAPH}/drives/${driveId}/root:/${chemin(parent)}:/children`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: nom, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }),
  });
  if (r.status === 409) return;
  if (r.status === 404) throw new ErreurDepot(`le dossier « ${parent.join("/")} » n'existe pas dans SharePoint.`);
  await lireJson(r, `création du dossier « ${nom} »`);
}

export class GraphDepotDocumentProvider implements DepotDocumentProvider {
  readonly actif = true;

  async deposer(p: { dossierUrl: string; sousDossiers: string[]; nomFichier: string; contenu: Buffer; contentType?: string; conflit?: ConflitDepot }): Promise<ResultatDepot> {
    try {
      if (p.contenu.length > TAILLE_MAX) throw new ErreurDepot("fichier de plus de 4 Mo, dépôt non prévu.");
      const site = siteDepuisUrl(p.dossierUrl);
      if (!site) throw new ErreurDepot("le lien SharePoint de la copropriété est illisible.");
      const tk = await jetonGraph();
      const dossier = resoudreDossier(p.dossierUrl, await bibliotheques(tk, site.hote, site.cheminSite));
      if (!dossier) throw new ErreurDepot("le dossier de la copropriété n'est dans aucune bibliothèque du site.");

      const parent = [...dossier.chemin];
      for (const sous of p.sousDossiers) {
        await assurerDossier(tk, dossier.driveId, parent, sous);
        parent.push(sous);
      }
      // PUT sur le chemin : par défaut remplace un fichier du même nom (la dernière édition
      // fait foi). En « renommer », Graph suffixe le nouveau (« nom 1.pdf ») et rend son nom
      // réel : l'existant n'est jamais écrasé.
      const conflit = p.conflit === "renommer" ? "?@microsoft.graph.conflictBehavior=rename" : "";
      const r = await graphFetch(`${GRAPH}/drives/${dossier.driveId}/root:/${chemin([...parent, p.nomFichier])}:/content${conflit}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${tk}`, "Content-Type": p.contentType ?? "application/pdf" },
        body: new Uint8Array(p.contenu),
      });
      const fichier = await lireJson<{ id?: string; name?: string; webUrl: string; parentReference?: { driveId?: string } }>(r, "envoi du fichier");
      return {
        depose: true,
        webUrl: fichier.webUrl,
        driveId: fichier.parentReference?.driveId ?? dossier.driveId,
        ...(fichier.id ? { itemId: fichier.id } : {}),
        ...(fichier.name ? { nom: fichier.name } : {}),
      };
    } catch (e) {
      if (e instanceof ErreurDepot) return { depose: false, raison: e.message };
      return { depose: false, raison: `SharePoint injoignable (${e instanceof Error ? e.message : String(e)}).` };
    }
  }
}

/** Dépôt coupé : pas de droit SharePoint, ou hors production. */
export class DepotDocumentInactif implements DepotDocumentProvider {
  readonly actif = false;
  async deposer(): Promise<ResultatDepot> {
    return { depose: false, raison: "dépôt SharePoint non activé." };
  }
}
