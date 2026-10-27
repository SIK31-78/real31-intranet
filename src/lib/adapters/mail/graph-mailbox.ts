// Adapter Graph "boite aux lettres" : classe un mail dans le sous-dossier de la
// copro. Enumere les sous-dossiers de la boite de reception, matche par code
// (S234) puis par nom de copro (tolerant), et deplace le message (POST .../move).
// Best-effort : si aucun dossier ne correspond, on ne deplace rien.

import type { DossierBoite, MailboxProvider, PieceJointeRef, ResultatCorbeille } from "@/lib/ports/mailbox-provider";
import { GRAPH, graphFetch, jetonGraph, resoudreMessageId } from "./graph-auth";

type Folder = { id: string; displayName: string };

// Cache module des dossiers sous inbox, PAR boite (TTL 10 min). L'arborescence copro
// bouge rarement, et son enumeration coute plusieurs pages Graph (100 dossiers/page,
// 2 niveaux) a CHAQUE classement de mail. Le picker de dossiers (listerDossiers), lui,
// reste live : un dossier cree dans Outlook doit y apparaitre tout de suite.
const CACHE_DOSSIERS_TTL_MS = 10 * 60 * 1000;
const cacheDossiersInbox = new Map<string, { dossiers: Folder[]; expire: number }>();

async function dossiersSousInboxCache(tk: string, boite: string): Promise<Folder[]> {
  const hit = cacheDossiersInbox.get(boite);
  if (hit && Date.now() < hit.expire) return hit.dossiers;
  const dossiers = await dossiersSousInbox(tk, boite);
  cacheDossiersInbox.set(boite, { dossiers, expire: Date.now() + CACHE_DOSSIERS_TTL_MS });
  return dossiers;
}

// Dossiers racine de la boite (Boite de reception, Archive, et tout dossier cree a
// la racine : "Communication agence", "Spam", "Perso"...). Q1 du handoff resolue en
// listant racine ET sous-inbox -> aucune hypothese sur l'emplacement des generiques.
async function rootFolders(tk: string, boite: string): Promise<Folder[]> {
  const out: Folder[] = [];
  let url: string =
    `${GRAPH}/users/${encodeURIComponent(boite)}/mailFolders` + `?$top=100&$select=id,displayName`;
  while (url) {
    const r = await graphFetch(url, { headers: { Authorization: `Bearer ${tk}` } });
    if (!r.ok) throw new Error(`Graph dossiers racine ${r.status} : ${(await r.text()).slice(0, 200)}`);
    const j = (await r.json()) as { value?: Folder[]; "@odata.nextLink"?: string };
    out.push(...(j.value ?? []));
    url = j["@odata.nextLink"] ?? "";
  }
  return out;
}

async function childFolders(tk: string, boite: string, folderId: string): Promise<Folder[]> {
  const out: Folder[] = [];
  let url: string =
    `${GRAPH}/users/${encodeURIComponent(boite)}/mailFolders/${folderId}/childFolders` +
    `?$top=100&$select=id,displayName`;
  while (url) {
    const r = await graphFetch(url, { headers: { Authorization: `Bearer ${tk}` } });
    if (!r.ok) throw new Error(`Graph dossiers ${r.status} : ${(await r.text()).slice(0, 200)}`);
    const j = (await r.json()) as { value?: Folder[]; "@odata.nextLink"?: string };
    out.push(...(j.value ?? []));
    url = j["@odata.nextLink"] ?? "";
  }
  return out;
}

/**
 * Tous les dossiers sous la boite de reception, en descendant les niveaux : les
 * sous-dossiers copro sont souvent ranges sous un dossier parent (ex. "Boite de
 * reception > copropriete > S234 ..."). Profondeur bornee (defaut 2 niveaux).
 */
async function dossiersSousInbox(tk: string, boite: string, profondeur = 2): Promise<Folder[]> {
  let niveau = await childFolders(tk, boite, "inbox");
  const tous: Folder[] = [...niveau];
  for (let d = 1; d < profondeur && niveau.length > 0; d++) {
    // Par paquets de 4 (la limite de requêtes simultanées par boîte chez Graph), plutôt qu'un
    // par un : 0,5 s par dossier mis bout à bout chez Mahaut (Sentry, 16/10/2026).
    const suivant: Folder[] = [];
    for (let i = 0; i < niveau.length; i += 4) {
      const lots = await Promise.all(niveau.slice(i, i + 4).map((f) => childFolders(tk, boite, f.id)));
      suivant.push(...lots.flat());
    }
    tous.push(...suivant);
    niveau = suivant;
  }
  return tous;
}

function trouverDossier(dossiers: Folder[], coproCode: string, coproNom: string): Folder | undefined {
  const code = coproCode.toLowerCase();
  const nom = coproNom.toLowerCase();
  if (code) {
    const d = dossiers.find((f) => f.displayName.toLowerCase().includes(code));
    if (d) return d;
  }
  if (nom && nom.length >= 4) {
    const d = dossiers.find((f) => f.displayName.toLowerCase().includes(nom));
    if (d) return d;
  }
  return undefined;
}

export class GraphMailboxProvider implements MailboxProvider {
  async classerDansCopro(p: {
    boite: string;
    internetMessageId: string;
    coproCode: string;
    coproNom: string;
  }): Promise<{ deplace: boolean; dossier?: string }> {
    if (!p.boite) throw new Error("Classement : boite manquante.");
    if (!p.coproCode && !p.coproNom) return { deplace: false };
    const tk = await jetonGraph();
    const dossiers = await dossiersSousInboxCache(tk, p.boite);
    const cible = trouverDossier(dossiers, p.coproCode, p.coproNom);
    if (!cible) {
      // Pas de PII en log (ni boite, ni noms de dossiers copro) : juste le nombre.
      console.warn(`[mailbox] aucun sous-dossier inbox ne correspond (${dossiers.length} dossiers).`);
      return { deplace: false };
    }
    const id = await resoudreMessageId(tk, p.boite, p.internetMessageId);
    const r = await graphFetch(`${GRAPH}/users/${encodeURIComponent(p.boite)}/messages/${id}/move`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" },
      body: JSON.stringify({ destinationId: cible.id }),
    });
    if (!r.ok) throw new Error(`Graph move ${r.status} : ${(await r.text()).slice(0, 200)}`);
    return { deplace: true, dossier: cible.displayName };
  }

  async creerDossier(boite: string, nom: string): Promise<DossierBoite> {
    if (!boite || !nom.trim()) throw new Error("Creation dossier : boite ou nom manquant.");
    const tk = await jetonGraph();
    const h = { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" };
    const base = `${GRAPH}/users/${encodeURIComponent(boite)}/mailFolders/inbox/childFolders`;
    // Un dossier du meme nom existe peut-etre deja (cree a la main entre-temps) : on le reprend.
    const filtre = encodeURIComponent(`displayName eq '${nom.replace(/'/g, "''")}'`);
    const r0 = await graphFetch(`${base}?$filter=${filtre}&$select=id,displayName`, { headers: h });
    if (!r0.ok) throw new Error(`Graph recherche dossier ${r0.status} : ${(await r0.text()).slice(0, 200)}`);
    const existant = ((await r0.json()) as { value?: Folder[] }).value?.[0];
    const f =
      existant ??
      (await (async () => {
        const r = await graphFetch(base, { method: "POST", headers: h, body: JSON.stringify({ displayName: nom }) });
        if (!r.ok) throw new Error(`Graph creation dossier ${r.status} : ${(await r.text()).slice(0, 200)}`);
        return (await r.json()) as Folder;
      })());
    cacheDossiersInbox.delete(boite);
    return { id: f.id, nom: f.displayName, niveau: 1 };
  }

  async listerDossiers(boite: string): Promise<DossierBoite[]> {
    if (!boite) throw new Error("Liste dossiers : boite manquante.");
    const tk = await jetonGraph();
    const [racine, sousInbox] = await Promise.all([
      rootFolders(tk, boite),
      dossiersSousInbox(tk, boite),
    ]);
    const vus = new Set<string>();
    const out: DossierBoite[] = [];
    for (const f of racine) {
      if (vus.has(f.id)) continue;
      vus.add(f.id);
      out.push({ id: f.id, nom: f.displayName, niveau: 0 });
    }
    for (const f of sousInbox) {
      if (vus.has(f.id)) continue;
      vus.add(f.id);
      out.push({ id: f.id, nom: f.displayName, niveau: 1 });
    }
    return out.sort((a, b) => a.nom.localeCompare(b.nom));
  }

  async classerDansDossier(p: {
    boite: string;
    internetMessageId: string;
    folderId: string;
  }): Promise<{ deplace: boolean }> {
    if (!p.boite) throw new Error("Classement : boite manquante.");
    if (!p.folderId) return { deplace: false };
    const tk = await jetonGraph();
    const id = await resoudreMessageId(tk, p.boite, p.internetMessageId);
    const r = await graphFetch(`${GRAPH}/users/${encodeURIComponent(p.boite)}/messages/${id}/move`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" },
      body: JSON.stringify({ destinationId: p.folderId }),
    });
    if (!r.ok) throw new Error(`Graph move ${r.status} : ${(await r.text()).slice(0, 200)}`);
    return { deplace: true };
  }

  async mettreALaCorbeille(p: { boite: string; internetMessageIds: string[] }): Promise<ResultatCorbeille> {
    if (!p.boite) throw new Error("Corbeille : boite manquante.");
    const tk = await jetonGraph();
    const u = `${GRAPH}/users/${encodeURIComponent(p.boite)}`;
    const out: ResultatCorbeille = { deplaces: [], echecs: [] };
    // Un par un (50 au plus, borne par l'action) : un mail introuvable ne doit pas faire
    // echouer les autres, et le move de Graph n'a pas de version groupee simple.
    // « deleteditems » est le nom connu du dossier : pas besoin de chercher son id.
    for (const imid of p.internetMessageIds) {
      try {
        const id = await resoudreMessageId(tk, p.boite, imid);
        const r = await graphFetch(`${u}/messages/${id}/move`, {
          method: "POST",
          headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" },
          body: JSON.stringify({ destinationId: "deleteditems" }),
        });
        if (!r.ok) throw new Error(`Graph move corbeille ${r.status}`);
        out.deplaces.push(imid);
      } catch (e) {
        console.warn("[mailbox] mail non mis a la corbeille :", (e as Error).message);
        out.echecs.push(imid);
      }
    }
    return out;
  }

  async listerPiecesJointes(p: { boite: string; internetMessageId: string }): Promise<PieceJointeRef[]> {
    if (!p.boite) throw new Error("Pieces jointes : boite manquante.");
    const tk = await jetonGraph();
    const id = await resoudreMessageId(tk, p.boite, p.internetMessageId);
    const url =
      `${GRAPH}/users/${encodeURIComponent(p.boite)}/messages/${id}/attachments` +
      `?$select=id,name,size,contentType,isInline`;
    const r = await graphFetch(url, { headers: { Authorization: `Bearer ${tk}` } });
    if (!r.ok) throw new Error(`Graph attachments ${r.status} : ${(await r.text()).slice(0, 200)}`);
    const j = (await r.json()) as {
      value?: { id: string; name: string; size: number; contentType: string; isInline?: boolean }[];
    };
    return (j.value ?? [])
      // Exclut les IMAGES inline (logos de signature, photos collees : cf. listerImagesInline).
      // Un PDF peut etre marque inline (plainte, devis du 03/10/2026) : c'est une vraie piece.
      .filter((a) => !(a.isInline && /^image\//i.test(a.contentType)))
      .map((a) => ({ id: a.id, nom: a.name, taille: a.size, type: a.contentType }));
  }

  async listerImagesInline(p: { boite: string; internetMessageId: string }): Promise<PieceJointeRef[]> {
    if (!p.boite) throw new Error("Images : boite manquante.");
    const tk = await jetonGraph();
    const id = await resoudreMessageId(tk, p.boite, p.internetMessageId);
    // Metadonnees seulement : chaque vignette charge son contenu a part (lirePieceJointe).
    const url =
      `${GRAPH}/users/${encodeURIComponent(p.boite)}/messages/${id}/attachments` +
      `?$filter=isInline eq true&$select=id,name,size,contentType`;
    const r = await graphFetch(url, { headers: { Authorization: `Bearer ${tk}` } });
    if (!r.ok) throw new Error(`Graph images inline ${r.status} : ${(await r.text()).slice(0, 200)}`);
    const j = (await r.json()) as { value?: { id: string; name: string; size: number; contentType: string }[] };
    return (j.value ?? []).map((a) => ({ id: a.id, nom: a.name, taille: a.size, type: a.contentType }));
  }

  async lirePieceJointe(p: {
    boite: string;
    internetMessageId: string;
    attachmentId: string;
  }): Promise<{ nom: string; type: string; base64: string }> {
    if (!p.boite) throw new Error("Piece jointe : boite manquante.");
    const tk = await jetonGraph();
    const id = await resoudreMessageId(tk, p.boite, p.internetMessageId);
    const url = `${GRAPH}/users/${encodeURIComponent(p.boite)}/messages/${id}/attachments/${encodeURIComponent(p.attachmentId)}`;
    // Timeout double : une PJ de plusieurs Mo (contentBytes base64) peut depasser 30 s.
    const r = await graphFetch(url, { headers: { Authorization: `Bearer ${tk}` } }, 60_000);
    if (!r.ok) throw new Error(`Graph piece jointe ${r.status} : ${(await r.text()).slice(0, 200)}`);
    const a = (await r.json()) as { name: string; contentType: string; contentBytes?: string };
    return { nom: a.name, type: a.contentType, base64: a.contentBytes ?? "" };
  }
}
