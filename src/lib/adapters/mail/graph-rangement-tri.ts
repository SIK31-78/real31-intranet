// Adapter Microsoft Graph du rangement du tri (ADR-046) : app-only, borne par l'Access
// Policy aux boites du groupe REAL31-Intranet-MailRead. ECRIT dans la boite (creer et
// renommer un dossier, deplacer un mail) : le routeur ne le branche que si
// MAIL_TRI_ECRITURE=on. Plain fetch, pas de SDK.

import type { MailEnReception, RangementTriProvider } from "@/lib/ports/rangement-tri-provider";
import { GRAPH, graphFetch, jetonGraph } from "./graph-auth";

const u = (boite: string) => `${GRAPH}/users/${encodeURIComponent(boite)}`;

async function json<T>(r: Response, quoi: string): Promise<T> {
  if (!r.ok) throw new Error(`Graph ${quoi} ${r.status} : ${(await r.text()).slice(0, 200)}`);
  return (await r.json()) as T;
}

async function appel(url: string, init: RequestInit = {}): Promise<Response> {
  const tk = await jetonGraph();
  return graphFetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

let inboxIds: Record<string, string> = {};

async function idReception(boite: string): Promise<string> {
  if (inboxIds[boite]) return inboxIds[boite]!;
  const j = await json<{ id: string }>(await appel(`${u(boite)}/mailFolders/inbox?$select=id`), "inbox");
  inboxIds = { ...inboxIds, [boite]: j.id };
  return j.id;
}

export class GraphRangementTri implements RangementTriProvider {
  async lireEnReception(boite: string, messageId: string): Promise<MailEnReception | null> {
    const r = await appel(
      `${u(boite)}/messages/${encodeURIComponent(messageId)}?$select=internetMessageId,conversationId,subject,from,parentFolderId`,
    );
    if (r.status === 404) return null;
    const m = await json<{
      internetMessageId?: string;
      conversationId?: string;
      subject?: string | null;
      from?: { emailAddress?: { address?: string } };
      parentFolderId: string;
    }>(r, "message");
    if (m.parentFolderId !== (await idReception(boite))) return null;
    return {
      internetMessageId: m.internetMessageId ?? messageId,
      ...(m.conversationId ? { conversationId: m.conversationId } : {}),
      expediteur: m.from?.emailAddress?.address ?? "",
      objet: m.subject ?? "",
    };
  }

  async assurerDossier(boite: string, p: { folderIdConnu: string | null; nom: string }): Promise<{ folderId: string }> {
    if (p.folderIdConnu) {
      const r = await appel(`${u(boite)}/mailFolders/${encodeURIComponent(p.folderIdConnu)}?$select=id,displayName`);
      if (r.ok) {
        const f = (await r.json()) as { id: string; displayName: string };
        if (f.displayName !== p.nom) {
          // L'assistant du binome a change : on renomme, les mails restent ou ils sont.
          await json(await appel(`${u(boite)}/mailFolders/${encodeURIComponent(f.id)}`, {
            method: "PATCH",
            body: JSON.stringify({ displayName: p.nom }),
          }), "renommage dossier");
        }
        return { folderId: f.id };
      }
      if (r.status !== 404) await json(r, "dossier");
      // 404 : le dossier a ete supprime a la main, on le recree.
    }
    // Un dossier du meme nom existe peut-etre deja (cree a la main) : on le reprend.
    const filtre = encodeURIComponent(`displayName eq '${p.nom.replace(/'/g, "''")}'`);
    const existants = await json<{ value: { id: string }[] }>(
      await appel(`${u(boite)}/mailFolders/inbox/childFolders?$filter=${filtre}&$select=id`),
      "recherche dossier",
    );
    if (existants.value[0]) return { folderId: existants.value[0].id };
    const cree = await json<{ id: string }>(
      await appel(`${u(boite)}/mailFolders/inbox/childFolders`, { method: "POST", body: JSON.stringify({ displayName: p.nom }) }),
      "creation dossier",
    );
    return { folderId: cree.id };
  }

  async deplacer(boite: string, messageId: string, folderId: string): Promise<{ messageId: string }> {
    const m = await json<{ id: string }>(
      await appel(`${u(boite)}/messages/${encodeURIComponent(messageId)}/move`, {
        method: "POST",
        body: JSON.stringify({ destinationId: folderId }),
      }),
      "deplacement",
    );
    return { messageId: m.id };
  }

  async remettreEnReception(boite: string, messageId: string): Promise<{ messageId: string }> {
    return this.deplacer(boite, messageId, "inbox");
  }
}
