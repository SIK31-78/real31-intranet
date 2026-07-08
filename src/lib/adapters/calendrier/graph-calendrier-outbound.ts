// Adapter Graph sortant : cree / met a jour / supprime un evenement dans l'agenda
// de la boite via /users/{boite}/events. Meme token app-only que le mail (jetonGraph).
// Permission requise : Calendars.ReadWrite (Application) - verifiee presente dans le
// token depuis le 2026-07-08.
//
// Sur echec Graph (403 Access Policy, timeout...), on throw (status + extrait) :
// l'appelant CATCHe et degrade proprement (la donnee intranet reste la source,
// jamais bloquee par Outlook).

import type { CalendrierOutboundProvider } from "@/lib/ports/calendrier-outbound-provider";
import { finReunion } from "@/lib/domain/reunion";
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

// start/end "journee entiere" au format Graph pour un jour 'YYYY-MM-DD' (Graph
// exige start a minuit et end au jour suivant).
function bornesJourneeEntiere(jour: string): {
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
} {
  return {
    start: { dateTime: `${jour}T00:00:00`, timeZone: TZ },
    end: { dateTime: `${lendemain(jour)}T00:00:00`, timeZone: TZ },
  };
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
  }): Promise<{ id?: string; webLink?: string }> {
    if (!p.boite) throw new Error("Creation evenement : boite manquante.");
    const tk = await jetonGraph();

    const allDay = p.journeeEntiere === true || estJourSeul(p.debut);

    const body: Record<string, unknown> = { subject: p.sujet };

    if (allDay) {
      // Journee entiere : Graph exige start a minuit et end au jour suivant.
      const jour = p.debut.trim().slice(0, 10);
      const bornes = bornesJourneeEntiere(jour);
      body.isAllDay = true;
      body.start = bornes.start;
      body.end = p.fin?.trim()
        ? { dateTime: `${p.fin.trim().slice(0, 10)}T00:00:00`, timeZone: TZ }
        : bornes.end;
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
    // Un 403 = Application Access Policy qui bloque la boite (a border cote tenant).
    if (!r.ok) throw new Error(`Graph creer evenement ${r.status} : ${(await r.text()).slice(0, 200)}`);
    const j = (await r.json()) as { id?: string; webLink?: string };
    return {
      ...(j.id ? { id: j.id } : {}),
      ...(j.webLink ? { webLink: j.webLink } : {}),
    };
  }

  async mettreAJourEvenement(
    boite: string,
    eventId: string,
    patch: { titre?: string; debut?: string; fin?: string },
  ): Promise<void> {
    if (!boite || !eventId) throw new Error("Mise a jour evenement : boite ou id manquant.");

    const body: Record<string, unknown> = {};
    if (patch.titre !== undefined) body.subject = patch.titre;
    if (patch.debut !== undefined) {
      const debut = patch.debut.trim();
      if (estJourSeul(debut)) {
        // Jour seul -> journee entiere sur ce jour (comportement historique).
        const bornes = bornesJourneeEntiere(debut);
        body.isAllDay = true;
        body.start = bornes.start;
        body.end = bornes.end;
      } else {
        // Heure presente -> evenement date ; fin fournie ou debut + duree reunion.
        const fin = patch.fin?.trim() || finReunion(debut);
        body.isAllDay = false;
        body.start = { dateTime: debut, timeZone: TZ };
        body.end = { dateTime: fin, timeZone: TZ };
      }
    }
    if (Object.keys(body).length === 0) return; // rien a changer

    const tk = await jetonGraph();
    const r = await fetch(
      `${GRAPH}/users/${encodeURIComponent(boite)}/events/${encodeURIComponent(eventId)}`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    if (!r.ok) {
      throw new Error(`Graph mettre a jour evenement ${r.status} : ${(await r.text()).slice(0, 200)}`);
    }
  }

  async supprimerEvenement(boite: string, eventId: string): Promise<void> {
    if (!boite || !eventId) throw new Error("Suppression evenement : boite ou id manquant.");
    const tk = await jetonGraph();
    const r = await fetch(
      `${GRAPH}/users/${encodeURIComponent(boite)}/events/${encodeURIComponent(eventId)}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${tk}` } },
    );
    // 404 = deja supprime (ex. efface a la main dans Outlook) : etat cible atteint.
    if (r.status === 404) return;
    if (!r.ok) {
      throw new Error(`Graph supprimer evenement ${r.status} : ${(await r.text()).slice(0, 200)}`);
    }
  }
}
