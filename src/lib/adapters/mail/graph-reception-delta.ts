// Lecture INCREMENTALE de la boite de reception d'une boite triee par Microsoft Graph (requete
// delta, app-only), REA-419 du 27/10/2026. Port ReceptionDeltaProvider.
//
//   GET /users/{boite}/mailFolders/inbox/messages/delta
//       ?$select=<les champs de lireRecents>&$filter=receivedDateTime ge {depuis}
//   Prefer: outlook.body-content-type="text", odata.maxpagesize=50
//
// Le filtre n'est pose qu'au premier appel (Graph le garde ensuite dans le jeton) et seulement
// sur receivedDateTime ge, le seul que le delta des messages accepte. On suit @odata.nextLink
// jusqu'a @odata.deltaLink, sauf si le budget de temps est atteint : le nextLink devient alors
// le jeton, et la lecture reprend au passage suivant. Les entrees @removed (mail range,
// supprime, glisse dans un autre dossier) n'ont que l'id Graph. Un mail qui ENTRE dans la
// reception (nouveau, ou remis depuis un dossier) arrive avec un nouvel id.
//
// Jeton expire (410 Gone, code syncStateNotFound / resyncRequired, jeton illisible) : relecture complete
// depuis `depuis`, signalee par `reinitialise` (le service sort alors de l'index les mails
// que cette relecture ne revoit pas). Pas de $expand (le delta ne l'accepte pas) : le dernier
// geste d'Outlook (dernierVerbe) ne sert pas au tri.

import type { OptionsDelta, ReceptionDeltaProvider, ResultatDelta } from "@/lib/ports/reception-delta";
import type { RawMail } from "@/lib/domain/tri-mail/raw-mail";
import { GRAPH, graphFetch, jetonGraph } from "./graph-auth";
import { SELECT_MESSAGE, versRaw, type GraphMessage } from "./graph-mail-ingestion";

const PAGE = 50;

type EntreeDelta = GraphMessage & { "@removed"?: { reason?: string } };
type PageDelta = { value?: EntreeDelta[]; "@odata.nextLink"?: string; "@odata.deltaLink"?: string };

class JetonExpire extends Error {}

/**
 * 410, un code d'erreur Graph qui demande de tout relire, ou un jeton que Graph ne sait plus
 * lire (400 « Badly formed token », constate le 27/10/2026) : sans relecture, la boite
 * resterait figee.
 */
function jetonExpire(status: number, corps: string): boolean {
  return status === 410 || /syncstatenotfound|resyncrequired|syncstateinvalid/i.test(corps) || (status === 400 && /token/i.test(corps));
}

/** Premier appel : toute la reception depuis la mise en service, page par page. */
export function urlInitiale(boite: string, depuis?: string): string {
  return (
    `${GRAPH}/users/${encodeURIComponent(boite)}/mailFolders/inbox/messages/delta?$select=${SELECT_MESSAGE}` +
    (depuis ? `&$filter=${encodeURIComponent(`receivedDateTime ge ${depuis}`)}` : "")
  );
}

export class GraphReceptionDelta implements ReceptionDeltaProvider {
  async lireDelta(boite: string, opts: OptionsDelta): Promise<ResultatDelta> {
    if (!boite) throw new Error("Lecture incrémentale Graph : adresse de la boîte manquante.");
    try {
      return await this.lire(boite, opts.jeton ?? urlInitiale(boite, opts.depuis), opts, opts.jeton === null);
    } catch (e) {
      if (!(e instanceof JetonExpire)) throw e;
      return this.lire(boite, urlInitiale(boite, opts.depuis), opts, true);
    }
  }

  private async lire(boite: string, depart: string, opts: OptionsDelta, reinitialise: boolean): Promise<ResultatDelta> {
    const maintenant = opts.maintenant ?? Date.now;
    const debut = maintenant();
    const tk = await jetonGraph();
    const ajoutes: RawMail[] = [];
    const retires: string[] = [];
    let url = depart;
    let pages = 0;
    for (;;) {
      const r = await graphFetch(url, {
        headers: {
          Authorization: `Bearer ${tk}`,
          // Corps en texte brut (comme lireRecents) et pages de 50 : un passage court par page.
          Prefer: `outlook.body-content-type="text", odata.maxpagesize=${PAGE}`,
        },
      });
      if (!r.ok) {
        const corps = (await r.text()).slice(0, 300);
        // Jeton perime : seulement si on en avait un (une relecture complete qui echoue ainsi
        // ne doit pas boucler).
        if (!reinitialise && jetonExpire(r.status, corps)) throw new JetonExpire(corps);
        throw new Error(`Graph delta ${boite} ${r.status} : ${corps}`);
      }
      const j = (await r.json()) as PageDelta;
      pages++;
      for (const m of j.value ?? []) {
        if (m["@removed"]) retires.push(m.id);
        // Une entree sans date de reception est partielle (Graph ne rend parfois que l'id et
        // les champs modifies) : le mail est deja dans l'index, rien a reprendre.
        else if (m.receivedDateTime) ajoutes.push(versRaw(m));
      }
      const fin = j["@odata.deltaLink"];
      if (fin) return { ajoutes, retires, pages, jeton: fin, complet: true, reinitialise };
      const suite = j["@odata.nextLink"];
      if (!suite) throw new Error(`Graph delta ${boite} : réponse sans nextLink ni deltaLink.`);
      if (maintenant() - debut > opts.budgetMs) return { ajoutes, retires, pages, jeton: suite, complet: false, reinitialise };
      url = suite;
    }
  }
}
