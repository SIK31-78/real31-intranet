// Adapter Graph "boite aux lettres" : classe un mail dans le sous-dossier de la
// copro. Enumere les sous-dossiers de la boite de reception, matche par code
// (S234) puis par nom de copro (tolerant), et deplace le message (POST .../move).
// Best-effort : si aucun dossier ne correspond, on ne deplace rien.

import type { MailboxProvider } from "@/lib/ports/mailbox-provider";
import { GRAPH, jetonGraph, resoudreMessageId } from "./graph-auth";

type Folder = { id: string; displayName: string };

async function sousDossiersInbox(tk: string, boite: string): Promise<Folder[]> {
  const out: Folder[] = [];
  let url: string =
    `${GRAPH}/users/${encodeURIComponent(boite)}/mailFolders/inbox/childFolders` +
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
    const dossiers = await sousDossiersInbox(tk, p.boite);
    const cible = trouverDossier(dossiers, p.coproCode, p.coproNom);
    if (!cible) {
      console.warn(
        `[mailbox] aucun sous-dossier inbox ne correspond a copro "${p.coproCode}"/"${p.coproNom}". ` +
          `Dossiers trouves: ${dossiers.map((d) => d.displayName).join(" | ") || "(aucun)"}`,
      );
      return { deplace: false };
    }
    const id = await resoudreMessageId(tk, p.boite, p.internetMessageId);
    const r = await fetch(`${GRAPH}/users/${encodeURIComponent(p.boite)}/messages/${id}/move`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" },
      body: JSON.stringify({ destinationId: cible.id }),
    });
    if (!r.ok) throw new Error(`Graph move ${r.status} : ${(await r.text()).slice(0, 200)}`);
    console.log(`[mailbox] mail deplace vers "${cible.displayName}" (boite ${p.boite}).`);
    return { deplace: true, dossier: cible.displayName };
  }
}
