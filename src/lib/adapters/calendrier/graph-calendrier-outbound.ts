// Adapter Graph sortant : cree un evenement dans l'agenda de la boite via
// POST /users/{boite}/events. Meme token app-only que le mail (jetonGraph).
//
// IMPORTANT : la permission Calendars.ReadWrite n'est PAS encore accordee par le
// DSI. Tant qu'elle est absente, Graph renvoie 403 -> on throw (status + extrait),
// l'action appelante CATCHe et degrade proprement (message clair, jamais de crash).
// Quand le DSI accorde la permission, cet adapter s'allume sans autre changement.

import type { CalendrierOutboundProvider } from "@/lib/ports/calendrier-outbound-provider";
import { GRAPH, jetonGraph } from "../mail/graph-auth";

const TZ = "Europe/Paris";

// Un `debut` "jour seul" = strictement 'YYYY-MM-DD' (aucune heure). Sinon, on
// considere qu'une heure est presente (ISO datetime) -> evenement date.
function estJourSeul(debut: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(debut.trim());
}

// 'YYYY-MM-DD' -> lendemain 'YYYY-MM-DD' (pour le `end` d'une journee entiere,
// que Graph exige). Calcul en UTC pour eviter tout decalage de fuseau.
function lendemain(jour: string): string {
  const d = new Date(`${jour}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// ISO datetime -> +1h, format 'YYYY-MM-DDTHH:mm:ss' (sans suffixe Z : la timeZone
// est portee par le champ timeZone de Graph, comme pour le start).
function plusUneHeure(iso: string): string {
  const d = new Date(iso);
  d.setHours(d.getHours() + 1);
  // Retire le fuseau du toISOString : on garde l'heure locale telle quelle.
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

function echapperHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/\n/g, "<br/>");
}

export class GraphCalendrierOutboundProvider implements CalendrierOutboundProvider {
  async creerEvenement(p: {
    boite: string;
    sujet: string;
    debut: string;
    fin?: string;
    journeeEntiere?: boolean;
    lieu?: string;
    description?: string;
  }): Promise<{ webLink?: string }> {
    if (!p.boite) throw new Error("Creation evenement : boite manquante.");
    const tk = await jetonGraph();

    const allDay = p.journeeEntiere === true || estJourSeul(p.debut);

    const body: Record<string, unknown> = { subject: p.sujet };

    if (allDay) {
      // Journee entiere : Graph exige start a minuit et end au jour suivant.
      const jour = p.debut.trim().slice(0, 10);
      const finJour = p.fin?.trim().slice(0, 10) || lendemain(jour);
      body.isAllDay = true;
      body.start = { dateTime: `${jour}T00:00:00`, timeZone: TZ };
      body.end = { dateTime: `${finJour}T00:00:00`, timeZone: TZ };
    } else {
      // Evenement date : fin = debut + 1h par defaut.
      const fin = p.fin?.trim() || plusUneHeure(p.debut.trim());
      body.start = { dateTime: p.debut.trim(), timeZone: TZ };
      body.end = { dateTime: fin, timeZone: TZ };
    }

    if (p.lieu?.trim()) body.location = { displayName: p.lieu.trim() };
    if (p.description?.trim()) {
      body.body = { contentType: "HTML", content: echapperHtml(p.description.trim()) };
    }

    const r = await fetch(`${GRAPH}/users/${encodeURIComponent(p.boite)}/events`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    // Un 403 = Calendars.ReadWrite non accordee par le DSI (etat nominal aujourd'hui).
    if (!r.ok) throw new Error(`Graph creer evenement ${r.status} : ${(await r.text()).slice(0, 200)}`);
    const j = (await r.json()) as { webLink?: string };
    return j.webLink ? { webLink: j.webLink } : {};
  }
}
