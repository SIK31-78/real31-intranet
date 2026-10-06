// Adapter LINEAR du port TicketTracker : cree l'issue depuis une remontee et relit
// l'etat des issues connues. GraphQL brut via `fetch` - pas de SDK, comme l'adapter
// Graph (cf. adapters/mail/graph-auth.ts). Rien a ajouter aux dependances.
//
// AUTH : cle API personnelle (`LINEAR_API_KEY`), passee telle quelle dans
// Authorization - c'est la convention Linear pour une personal API key (pas de
// prefixe "Bearer"). Consequence assumee : les tickets apparaissent CREES PAR SEKOU,
// indiscernables de ceux qu'il saisit a la main. Pour les distinguer il faudrait une
// app OAuth Linear avec `actor: application` ; ce fichier serait alors le seul a
// changer (arbitrage Sekou du 2026-10-06).

import type { Feedback } from "@/lib/domain/feedback";
import {
  descriptionLinear,
  etatLinearPourStatut,
  labelsLinear,
  prioriteLinear,
} from "@/lib/domain/feedback-linear";
import type { EtatTicket, TicketCree, TicketTracker } from "@/lib/ports/ticket-tracker";

const API = "https://api.linear.app/graphql";

// Timeout de TOUS les appels Linear. Sans lui, un Linear qui hang bloque la route
// cron jusqu'au timeout plateforme. Meme parti que GRAPH_TIMEOUT_MS.
const TIMEOUT_MS = Number(process.env.LINEAR_TIMEOUT_MS) || 20_000;

// Un seul ticket Linear ne peut pas depasser la taille d'un commentaire ; on borne
// large, juste pour qu'une description aberrante ne fasse pas rejeter la mutation.
const DESCRIPTION_MAX = 20_000;

type Reponse<T> = { data?: T; errors?: { message: string }[] };

export class LinearTicketTracker implements TicketTracker {
  private readonly cle = process.env.LINEAR_API_KEY ?? "";
  private readonly equipe = process.env.LINEAR_TEAM_ID ?? "";
  private readonly projet = process.env.LINEAR_PROJECT_ID ?? "";

  estActif(): boolean {
    return Boolean(this.cle && this.equipe);
  }

  private async appeler<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const r = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: this.cle },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!r.ok) throw new Error(`Linear ${r.status} : ${(await r.text()).slice(0, 200)}`);
    const j = (await r.json()) as Reponse<T>;
    // Linear rend 200 avec un tableau `errors` : sans ce test, une mutation refusee
    // (label inconnu, projet d'une autre equipe) passerait pour un succes silencieux.
    if (j.errors?.length) throw new Error(`Linear : ${j.errors.map((e) => e.message).join(" | ")}`);
    if (!j.data) throw new Error("Linear : reponse sans data.");
    return j.data;
  }

  async creerTicket(remontee: Feedback): Promise<TicketCree> {
    if (!this.estActif()) throw new Error("Linear non configuré (LINEAR_API_KEY / LINEAR_TEAM_ID).");
    const query = `
      mutation CreerTicket($input: IssueCreateInput!) {
        issueCreate(input: $input) {
          success
          issue { id identifier url }
        }
      }`;
    const d = await this.appeler<{
      issueCreate: { success: boolean; issue: { id: string; identifier: string; url: string } | null };
    }>(query, {
      input: {
        teamId: this.equipe,
        title: remontee.titre,
        description: descriptionLinear(remontee, process.env.NEXT_PUBLIC_BASE_URL).slice(0, DESCRIPTION_MAX),
        priority: prioriteLinear(remontee.severite),
        labelIds: await this.resoudreLabels(labelsLinear(remontee.type)),
        // Etat de naissance DEDUIT DU STATUT ACTUEL : une remontee deja triee
        // (`prevu` / `en_cours`) doit naitre a Todo / In Progress, sinon le retour
        // du meme passage la ramenerait a `nouveau` et effacerait le triage.
        ...(await this.etatPour(remontee.statut)),
        // Projet renseigne seulement pour real31.app : il n'existe pas de projet
        // Linear pour ESTALE / Registre des Mandats, ces remontees atterrissent
        // dans le backlog d'equipe (l'application est nommee dans la description).
        ...(this.projet && !remontee.page?.includes(":") ? { projectId: this.projet } : {}),
      },
    });
    const issue = d.issueCreate.issue;
    if (!d.issueCreate.success || !issue) throw new Error("Linear : création du ticket refusée.");
    return { issueId: issue.id, identifiant: issue.identifier, url: issue.url };
  }

  // Cache module-level des etats de l'equipe (meme raison que les labels).
  private static etatsConnus: Map<string, string> | null = null;

  /**
   * `{ stateId }` de l'etat ou faire naitre le ticket, ou `{}` si l'equipe n'expose
   * aucun etat du type voulu - Linear retombe alors sur son etat par defaut plutot
   * que de refuser la mutation.
   */
  private async etatPour(statut: Feedback["statut"]): Promise<{ stateId?: string }> {
    if (!LinearTicketTracker.etatsConnus) {
      const d = await this.appeler<{
        team: { states: { nodes: { id: string; type: string; position: number }[] } };
      }>(
        `query Etats($id: String!) { team(id: $id) { states(first: 50) { nodes { id type position } } } }`,
        { id: this.equipe },
      );
      // TRI PAR POSITION, PAS PAR ORDRE DE REPONSE : l'equipe REAL31 a deux etats
      // `started` et l'API rend "In Review" (position 1002) AVANT "In Progress"
      // (position 2). Sans ce tri, une remontee `en_cours` naitrait "en relecture"
      // - les deux remontent bien a `en_cours`, mais le ticket mentirait sur son
      // avancement (releve en validant la requete contre l'API, 2026-10-06).
      const parType = new Map<string, string>();
      for (const n of [...d.team.states.nodes].sort((a, b) => a.position - b.position)) {
        if (!parType.has(n.type)) parType.set(n.type, n.id);
      }
      LinearTicketTracker.etatsConnus = parType;
    }
    const id = LinearTicketTracker.etatsConnus.get(etatLinearPourStatut(statut));
    return id ? { stateId: id } : {};
  }

  // Cache module-level des labels de l'equipe : leur id ne change pas, et les
  // resoudre a chaque creation couterait une requete de plus par remontee.
  private static labelsConnus: Map<string, string> | null = null;

  private async resoudreLabels(noms: readonly string[]): Promise<string[]> {
    if (!LinearTicketTracker.labelsConnus) {
      const d = await this.appeler<{ team: { labels: { nodes: { id: string; name: string }[] } } }>(
        `query Labels($id: String!) { team(id: $id) { labels(first: 100) { nodes { id name } } } }`,
        { id: this.equipe },
      );
      LinearTicketTracker.labelsConnus = new Map(
        d.team.labels.nodes.map((l) => [l.name.toLowerCase(), l.id]),
      );
    }
    // Un label absent est IGNORE plutot que fatal : si quelqu'un renomme "Idée"
    // dans Linear, le ticket part quand meme (sans label) au lieu d'etre perdu.
    return noms
      .map((n) => LinearTicketTracker.labelsConnus?.get(n.toLowerCase()))
      .filter((id): id is string => Boolean(id));
  }

  async renommerTicket(issueId: string, titre: string): Promise<void> {
    if (!this.estActif()) throw new Error("Linear non configuré (LINEAR_API_KEY / LINEAR_TEAM_ID).");
    const d = await this.appeler<{ issueUpdate: { success: boolean } }>(
      `mutation Renommer($id: String!, $input: IssueUpdateInput!) {
         issueUpdate(id: $id, input: $input) { success }
       }`,
      { id: issueId, input: { title: titre } },
    );
    if (!d.issueUpdate.success) throw new Error("Linear : renommage du ticket refusé.");
  }

  async lireEtats(issueIds: readonly string[]): Promise<EtatTicket[]> {
    if (!this.estActif() || issueIds.length === 0) return [];
    const query = `
      query Etats($ids: [ID!]) {
        issues(filter: { id: { in: $ids } }, first: 250) {
          nodes {
            id
            identifier
            title
            completedAt
            canceledAt
            state { name type }
          }
        }
      }`;
    const d = await this.appeler<{
      issues: {
        nodes: {
          id: string;
          identifier: string;
          title: string;
          completedAt: string | null;
          canceledAt: string | null;
          state: { name: string; type: string };
        }[];
      };
    }>(query, { ids: [...issueIds] });
    return d.issues.nodes.map((n) => ({
      issueId: n.id,
      identifiant: n.identifier,
      titre: n.title,
      nomEtat: n.state.name,
      typeEtat: n.state.type,
      ...(n.completedAt || n.canceledAt ? { termineAt: n.completedAt ?? n.canceledAt ?? undefined } : {}),
    }));
  }
}
