// Adapter Graph "boite aux lettres" : classe un mail dans le sous-dossier de la
// copro. Enumere les sous-dossiers de la boite de reception, matche par code
// (S234) puis par nom de copro (tolerant), et deplace le message (POST .../move).
// Best-effort : si aucun dossier ne correspond, on ne deplace rien.

import type { DossierBoite, MailboxProvider, PieceJointeRef } from "@/lib/ports/mailbox-provider";
import { GRAPH, jetonGraph, resoudreMessageId } from "./graph-auth";

type Folder = { id: string; displayName: string };

// Dossiers racine de la boite (Boite de reception, Archive, et tout dossier cree a
// la racine : "Communication agence", "Spam", "Perso"...). Q1 du handoff resolue en
// listant racine ET sous-inbox -> aucune hypothese sur l'emplacement des generiques.
async function rootFolders(tk: string, boite: string): Promise<Folder[]> {
  const out: Folder[] = [];
  let url: string =
    `${GRAPH}/users/${encodeURIComponent(boite)}/mailFolders` + `?$top=100&$select=id,displayName`;
  while (url) {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${tk}` } });
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
    const r = await fetch(url, { headers: { Authorization: `Bearer ${tk}` } });
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
    const suivant: Folder[] = [];
    for (const f of niveau) suivant.push(...(await childFolders(tk, boite, f.id)));
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
    const dossiers = await dossiersSousInbox(tk, p.boite);
    const cible = trouverDossier(dossiers, p.coproCode, p.coproNom);
    if (!cible) {
      // Pas de PII en log (ni boite, ni noms de dossiers copro) : juste le nombre.
      console.warn(`[mailbox] aucun sous-dossier inbox ne correspond (${dossiers.length} dossiers).`);
      return { deplace: false };
    }
    const id = await resoudreMessageId(tk, p.boite, p.internetMessageId);
    const r = await fetch(`${GRAPH}/users/${encodeURIComponent(p.boite)}/messages/${id}/move`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" },
      body: JSON.stringify({ destinationId: cible.id }),
    });
    if (!r.ok) throw new Error(`Graph move ${r.status} : ${(await r.text()).slice(0, 200)}`);
    return { deplace: true, dossier: cible.displayName };
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
    const r = await fetch(`${GRAPH}/users/${encodeURIComponent(p.boite)}/messages/${id}/move`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" },
      body: JSON.stringify({ destinationId: p.folderId }),
    });
    if (!r.ok) throw new Error(`Graph move ${r.status} : ${(await r.text()).slice(0, 200)}`);
    return { deplace: true };
  }

  async listerPiecesJointes(p: { boite: string; internetMessageId: string }): Promise<PieceJointeRef[]> {
    if (!p.boite) throw new Error("Pieces jointes : boite manquante.");
    const tk = await jetonGraph();
    const id = await resoudreMessageId(tk, p.boite, p.internetMessageId);
    const url =
      `${GRAPH}/users/${encodeURIComponent(p.boite)}/messages/${id}/attachments` +
      `?$select=id,name,size,contentType,isInline`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${tk}` } });
    if (!r.ok) throw new Error(`Graph attachments ${r.status} : ${(await r.text()).slice(0, 200)}`);
    const j = (await r.json()) as {
      value?: { id: string; name: string; size: number; contentType: string; isInline?: boolean }[];
    };
    return (j.value ?? [])
      .filter((a) => !a.isInline) // exclut les images inline (signatures)
      .map((a) => ({ id: a.id, nom: a.name, taille: a.size, type: a.contentType }));
  }

  async lirePieceJointe(p: {
    boite: string;
    internetMessageId: string;
    attachmentId: string;
  }): Promise<{ nom: string; type: string; base64: string }> {
    if (!p.boite) throw new Error("Piece jointe : boite manquante.");
    const tk = await jetonGraph();
    const id = await resoudreMessageId(tk, p.boite, p.internetMessageId);
    const url = `${GRAPH}/users/${encodeURIComponent(p.boite)}/messages/${id}/attachments/${p.attachmentId}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${tk}` } });
    if (!r.ok) throw new Error(`Graph piece jointe ${r.status} : ${(await r.text()).slice(0, 200)}`);
    const a = (await r.json()) as { name: string; contentType: string; contentBytes?: string };
    return { nom: a.name, type: a.contentType, base64: a.contentBytes ?? "" };
  }
}
