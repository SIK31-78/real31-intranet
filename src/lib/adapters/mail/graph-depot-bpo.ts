// Dépôt des factures pour BPO dans SharePoint, par Graph en app-only (même jeton que le mail),
// 02/11/2026. Site « Syndic » (sites/copro), bibliothèque « Documents communs », sous Compta/.
// Droit de l'app : Sites.Selected. Sondé le 02/11/2026 (lecture seule) : la LECTURE du site
// copro est accordée (arborescence Compta lue). L'ÉCRITURE n'a pas pu être vérifiée sans écrire :
// elle reste coupée tant que SHAREPOINT_DEPOT_ACTIF=1 n'est pas posé (droit « write » sur le
// site copro, le même que le contrat de syndic, REA-116).
//
// Jamais de dossier créé : un PUT sur un chemin crée les dossiers manquants, on vérifie donc
// d'abord que le dossier cible existe. Jamais d'écrasement : conflictBehavior=rename.
// Au-delà de 4 Mo : session d'upload (tranches de 3,75 Mio, multiples de 320 Kio).

import { graphFetch, jetonGraph } from "./graph-auth";
import type { DepotBpoProvider, ResultatDepot } from "@/lib/ports/depot-bpo-provider";

const GRAPH = "https://graph.microsoft.com/v1.0";
const TAILLE_PUT_SIMPLE = 4 * 1024 * 1024;
const TRANCHE = 12 * 320 * 1024;

/** Le site et la bibliothèque, surchargeables (SHAREPOINT_BPO_SITE, SHAREPOINT_BPO_BIBLIOTHEQUE). */
function config(): { hote: string; cheminSite: string; bibliotheque: string } {
  const url = new URL(process.env.SHAREPOINT_BPO_SITE?.trim() || "https://real31france.sharepoint.com/sites/copro");
  return {
    hote: url.hostname,
    cheminSite: url.pathname.replace(/\/$/, ""),
    bibliotheque: process.env.SHAREPOINT_BPO_BIBLIOTHEQUE?.trim() || "Documents communs",
  };
}

class ErreurDepot extends Error {}

const chemin = (segments: string[]) => segments.map(encodeURIComponent).join("/");

async function lireJson<T>(r: Response, quoi: string): Promise<T> {
  if (r.status === 401 || r.status === 403) {
    throw new ErreurDepot("l'intranet n'a pas le droit d'écrire dans ce dossier SharePoint (autorisation à demander à l'administrateur).");
  }
  if (!r.ok) throw new ErreurDepot(`${quoi} : SharePoint a répondu ${r.status}.`);
  return (await r.json()) as T;
}

// La bibliothèque, gardée le temps de l'instance : elle ne bouge pas.
let bibliotheque: Promise<string> | null = null;
function idBibliotheque(tk: string): Promise<string> {
  if (!bibliotheque) {
    const p = (async () => {
      const c = config();
      const auth = { headers: { Authorization: `Bearer ${tk}` } };
      const site = await lireJson<{ id: string }>(await graphFetch(`${GRAPH}/sites/${c.hote}:${c.cheminSite}?$select=id`, auth), "site Syndic introuvable");
      const d = await lireJson<{ value: { id: string; name: string }[] }>(await graphFetch(`${GRAPH}/sites/${site.id}/drives?$select=id,name`, auth), "bibliothèques illisibles");
      const b = d.value.find((x) => x.name.trim().toLowerCase() === c.bibliotheque.toLowerCase());
      if (!b) throw new ErreurDepot(`bibliothèque « ${c.bibliotheque} » introuvable sur le site.`);
      return b.id;
    })();
    bibliotheque = p;
    p.catch(() => {
      if (bibliotheque === p) bibliotheque = null;
    });
  }
  return bibliotheque;
}

export class GraphDepotBpo implements DepotBpoProvider {
  constructor(readonly ecritureActive: boolean) {}

  async listerDossiers(segments: string[]): Promise<string[] | null> {
    const tk = await jetonGraph();
    const drive = await idBibliotheque(tk);
    let url = `${GRAPH}/drives/${drive}/root:/${chemin(segments)}:/children?$select=name,folder&$top=200`;
    const noms: string[] = [];
    while (url) {
      const r = await graphFetch(url, { headers: { Authorization: `Bearer ${tk}` } });
      if (r.status === 404) return null;
      const j = await lireJson<{ value: { name: string; folder?: object }[]; "@odata.nextLink"?: string }>(r, `lecture de « ${segments.join("/")} »`);
      for (const x of j.value) if (x.folder) noms.push(x.name);
      url = j["@odata.nextLink"] ?? "";
    }
    return noms;
  }

  async deposer(p: { chemin: string[]; nomFichier: string; contenu: Buffer; contentType: string }): Promise<ResultatDepot> {
    if (!this.ecritureActive) return { depose: false, raison: "le dépôt SharePoint n'est pas encore activé." };
    try {
      const tk = await jetonGraph();
      const drive = await idBibliotheque(tk);
      const auth = { Authorization: `Bearer ${tk}` };
      // Le dossier doit exister : un PUT le créerait sinon (on ne crée jamais de dossier).
      const parent = await graphFetch(`${GRAPH}/drives/${drive}/root:/${chemin(p.chemin)}?$select=id,folder`, { headers: auth });
      if (parent.status === 404) throw new ErreurDepot(`le dossier « ${p.chemin.join("/")} » n'existe plus.`);
      const dossier = await lireJson<{ folder?: object }>(parent, "lecture du dossier");
      if (!dossier.folder) throw new ErreurDepot(`« ${p.chemin.join("/")} » n'est pas un dossier.`);
      const cible = `${GRAPH}/drives/${drive}/root:/${chemin([...p.chemin, p.nomFichier])}:`;
      let fichier: { name?: string; webUrl: string; id?: string };
      if (p.contenu.length <= TAILLE_PUT_SIMPLE) {
        const r = await graphFetch(`${cible}/content?@microsoft.graph.conflictBehavior=rename`, {
          method: "PUT",
          headers: { ...auth, "Content-Type": p.contentType || "application/octet-stream" },
          body: new Uint8Array(p.contenu),
        });
        fichier = await lireJson(r, "envoi du fichier");
      } else {
        const s = await graphFetch(`${cible}/createUploadSession`, {
          method: "POST",
          headers: { ...auth, "Content-Type": "application/json" },
          body: JSON.stringify({ item: { "@microsoft.graph.conflictBehavior": "rename" } }),
        });
        const { uploadUrl } = await lireJson<{ uploadUrl: string }>(s, "ouverture de l'envoi");
        let r: Response | null = null;
        for (let debut = 0; debut < p.contenu.length; debut += TRANCHE) {
          const fin = Math.min(debut + TRANCHE, p.contenu.length);
          // L'URL de session porte son propre droit : pas d'en-tête Authorization (doc Graph).
          r = await graphFetch(uploadUrl, {
            method: "PUT",
            headers: { "Content-Range": `bytes ${debut}-${fin - 1}/${p.contenu.length}` },
            body: new Uint8Array(p.contenu.subarray(debut, fin)),
          });
          if (!r.ok) throw new ErreurDepot(`envoi du fichier interrompu (${r.status}).`);
        }
        fichier = await lireJson(r!, "envoi du fichier");
      }
      return { depose: true, webUrl: fichier.webUrl, ...(fichier.id ? { itemId: fichier.id } : {}), ...(fichier.name ? { nom: fichier.name } : {}) };
    } catch (e) {
      if (e instanceof ErreurDepot) return { depose: false, raison: e.message };
      return { depose: false, raison: `SharePoint injoignable (${e instanceof Error ? e.message : String(e)}).` };
    }
  }
}

/** Hors Graph (développement) : aucun dossier, rien ne se dépose. */
export class DepotBpoInactif implements DepotBpoProvider {
  readonly ecritureActive = false;
  async listerDossiers(): Promise<string[] | null> {
    return null;
  }
  async deposer(): Promise<ResultatDepot> {
    return { depose: false, raison: "dépôt SharePoint non branché ici." };
  }
}
