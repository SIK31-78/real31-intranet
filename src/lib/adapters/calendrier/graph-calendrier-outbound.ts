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
import {
  attendeesParticipant,
  attendeesRessource,
  interpreterAvailabilityView,
} from "@/lib/domain/salles-reunion";
import { GRAPH, graphFetch, jetonGraph } from "../mail/graph-auth";

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
    ressources?: string[];
    participants?: string[];
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
    // Salles / vehicules : attendees "resource" (auto-acceptation). Collegues :
    // attendees "required" (l'evenement apparait dans leur agenda). Meme tableau Graph.
    const attendees = [
      ...attendeesRessource(p.ressources ?? []),
      ...attendeesParticipant(p.participants ?? []),
    ];
    if (attendees.length > 0) body.attendees = attendees;

    const r = await graphFetch(`${GRAPH}/users/${encodeURIComponent(p.boite)}/events`, {
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
    patch: {
      titre?: string;
      debut?: string;
      fin?: string;
      ressources?: string[];
      participants?: string[];
      lieu?: string;
    },
  ): Promise<void> {
    if (!boite || !eventId) throw new Error("Mise a jour evenement : boite ou id manquant.");

    const body: Record<string, unknown> = {};
    if (patch.titre !== undefined) body.subject = patch.titre;
    if (patch.lieu !== undefined) body.location = { displayName: patch.lieu };
    // Le PATCH `attendees` de Graph ecrase TOUTE la liste : des que ressources OU
    // participants est fourni, on recompose les deux ensemble (salles "resource" +
    // collegues "required"). Une liste absente compte comme [] pour son type -> le
    // service passe donc TOUJOURS les deux ensemble (jamais un seul, qui effacerait
    // l'autre). `[]` des deux cotes retire tout attendee.
    if (patch.ressources !== undefined || patch.participants !== undefined) {
      body.attendees = [
        ...attendeesRessource(patch.ressources ?? []),
        ...attendeesParticipant(patch.participants ?? []),
      ];
    }
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
    const r = await graphFetch(
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
    const base = `${GRAPH}/users/${encodeURIComponent(boite)}/events/${encodeURIComponent(eventId)}`;
    const h = { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" };

    // PIEGE Graph : DELETE ne supprime QUE la copie de l'organisateur, SANS envoyer
    // d'annulation aux participants -> une salle (attendee resource) resterait RESERVEE
    // a jamais (constate en reel le 2026-07-10). POST /cancel envoie l'annulation (la
    // salle se libere) ET supprime l'evenement. On tente cancel d'abord ; s'il n'est pas
    // applicable (evenement sans participant, deja annule -> 4xx), on retombe sur DELETE.
    const rc = await graphFetch(`${base}/cancel`, {
      method: "POST",
      headers: h,
      body: JSON.stringify({ comment: "Reunion annulee depuis l'intranet REAL31." }),
    });
    if (rc.ok) return; // 202 : annulation envoyee (salle liberee), evenement supprime
    if (rc.status === 404) return; // deja absent : etat cible atteint

    const r = await graphFetch(base, { method: "DELETE", headers: h });
    // 404 = deja supprime (ex. efface a la main dans Outlook) : etat cible atteint.
    if (r.status === 404) return;
    if (!r.ok) {
      throw new Error(`Graph supprimer evenement ${r.status} : ${(await r.text()).slice(0, 200)}`);
    }
  }

  async disponibiliteSalle(
    boite: string,
    salleEmail: string,
    debutISO: string,
    finISO: string,
  ): Promise<"libre" | "occupee" | "inconnu"> {
    // Degrade "inconnu" a la moindre anomalie : ce controle est un CONFORT (la
    // reservation, elle, s'appuie sur l'auto-acceptation de la room mailbox). Jamais
    // bloquant, jamais throw vers l'UI.
    if (!boite || !salleEmail) return "inconnu";
    try {
      const tk = await jetonGraph();
      // Timeout court (8 s) : ce controle alimente un indicateur temps reel dans
      // l'editeur de date ; mieux vaut "inconnu" vite qu'une verification qui traine.
      const r = await graphFetch(`${GRAPH}/users/${encodeURIComponent(boite)}/calendar/getSchedule`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          schedules: [salleEmail],
          startTime: { dateTime: debutISO, timeZone: TZ },
          endTime: { dateTime: finISO, timeZone: TZ },
          availabilityViewInterval: 30,
        }),
      }, 8_000);
      // 403 = Application Access Policy pas encore ouverte pour les salles (cote DSI).
      if (!r.ok) return "inconnu";
      const j = (await r.json()) as { value?: Array<{ availabilityView?: string }> };
      const vue = j.value?.[0]?.availabilityView;
      if (typeof vue !== "string") return "inconnu";
      return interpreterAvailabilityView(vue);
    } catch {
      return "inconnu";
    }
  }
}
