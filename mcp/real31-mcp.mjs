#!/usr/bin/env node
// =============================================================================
// Serveur MCP "real31" - stdio, MINCE par-dessus l'API /api/v1 de l'intranet.
// =============================================================================
//
// CHAQUE tool = UN fetch HTTP vers l'API v1 avec la cle machine (Bearer).
// JAMAIS de service_role ici, JAMAIS d'acces direct a la base : le poste qui
// heberge ce serveur ne detient qu'une cle API revocable, aux scopes bornes.
//
// >>> LIGNE ROUGE (gravee DECISIONS.md) <<<
// Ni ce serveur ni l'API ne permettront JAMAIS : ecriture eStale reelle, envoi de
// mail, suppression, conclureAg / injection reprise. Ces gestes restent derriere
// le GO/STOP humain dans l'UI de l'intranet.
//
// Config par variables d'environnement :
//   REAL31_API_URL  ex. https://intranet.real31.app  (sans /api/v1 final)
//   REAL31_API_KEY  cle machine "real31_..." creee dans /admin/cles-api
//
// Lancement (Claude Desktop, bloc mcpServers) : cf. docs/api-v1.md.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_URL = (process.env.REAL31_API_URL ?? "").replace(/\/+$/, "");
const API_KEY = process.env.REAL31_API_KEY ?? "";

if (!API_URL || !API_KEY) {
  console.error(
    "real31-mcp : REAL31_API_URL et REAL31_API_KEY sont requis (cle creee dans /admin/cles-api).",
  );
  process.exit(1);
}

/** GET/POST vers l'API v1 ; renvoie le contenu MCP (texte JSON), isError si echec. */
async function appelApi(chemin, options = {}) {
  const url = `${API_URL}/api/v1${chemin}`;
  let reponse;
  try {
    reponse = await fetch(url, {
      method: options.method ?? "GET",
      headers: {
        authorization: `Bearer ${API_KEY}`,
        ...(options.body ? { "content-type": "application/json" } : {}),
        ...(options.idempotencyKey ? { "idempotency-key": options.idempotencyKey } : {}),
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    return {
      content: [{ type: "text", text: `Appel API impossible (${url}) : ${e?.message ?? e}` }],
      isError: true,
    };
  }
  const texte = await reponse.text();
  let corps;
  try {
    corps = JSON.parse(texte);
  } catch {
    corps = { brut: texte };
  }
  if (!reponse.ok || corps?.ok === false) {
    return {
      content: [
        {
          type: "text",
          text: `Erreur API ${reponse.status} ${corps?.code ?? ""} : ${corps?.message ?? texte}`,
        },
      ],
      isError: true,
    };
  }
  return { content: [{ type: "text", text: JSON.stringify(corps, null, 2) }] };
}

function query(params) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

const server = new McpServer({ name: "real31", version: "1.0.0" });

// --- Tools de LECTURE ---------------------------------------------------------

server.registerTool(
  "lister_copros",
  {
    description:
      "Liste les coproprietes du perimetre de la cle (portefeuille du gestionnaire lie, ou tout le cabinet pour une cle cabinet) avec l'etat du cycle AG. Filtres optionnels par etat de cycle et code agence.",
    inputSchema: {
      etat: z.enum(["a_planifier", "a_venir", "en_preparation", "convoquee", "tenue"]).optional(),
      agence: z.string().max(10).optional().describe("Code agence : ML, LGC, HLS ou ASN"),
      cursor: z.string().optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
  },
  (args) => appelApi(`/copros${query(args)}`),
);

server.registerTool(
  "fiche_copro",
  {
    description:
      "La fiche d'une copropriete : identite, dates AG/CS, equipe, cycle AG avec l'action du moment, jalons, conformite, historique des AG. Aucune donnee nominative de coproprietaire.",
    inputSchema: { code: z.string().min(1).max(40).describe('Code copro, ex "S104"') },
  },
  ({ code }) => appelApi(`/copros/${encodeURIComponent(code)}`),
);

server.registerTool(
  "echeances_ag",
  {
    description:
      "Les jalons reglementaires des prochaines AG (ODJ, convocations, pouvoirs, tenue, PV...) : dates cibles, statut, retard. Par defaut seuls les jalons non accomplis sortent.",
    inputSchema: {
      copro: z.string().max(40).optional(),
      enRetard: z.enum(["true", "false"]).optional(),
      tous: z.enum(["true", "false"]).optional().describe("true = inclut aussi les jalons accomplis"),
      cursor: z.string().optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
  },
  (args) => appelApi(`/echeances${query(args)}`),
);

server.registerTool(
  "ag_urgentes",
  {
    description:
      "Les AG les plus urgentes du perimetre : pour chaque copro imminente, l'action du moment (preparer l'ODJ, convoquer, conclure...), l'echeance et le retard eventuel.",
    inputSchema: {},
  },
  () => appelApi("/ag-urgentes"),
);

server.registerTool(
  "supervision_ag",
  {
    description:
      "La supervision (checklist de preparation) d'une AG : progression, sections, items avec statut et commentaires, problemes signales.",
    inputSchema: {
      agId: z.string().min(1).max(60).describe('Id "CODE__AAAA-MM-JJ", ex "S104__2026-05-28"'),
    },
  },
  ({ agId }) => appelApi(`/supervisions/${encodeURIComponent(agId)}`),
);

server.registerTool(
  "problemes",
  {
    description: "Les problemes signales (items de supervision coches 'probleme') du perimetre, groupes par copropriete.",
    inputSchema: {},
  },
  () => appelApi("/problemes"),
);

server.registerTool(
  "lister_dossiers",
  {
    description:
      "Les dossiers suivis du perimetre (travaux, sinistre, impaye, procedure, recouvrement...) avec statut et progression des etapes. Filtres optionnels copro / type / statut.",
    inputSchema: {
      copro: z.string().max(40).optional(),
      type: z
        .enum(["travaux", "sinistre", "impaye", "procedure", "recouvrement", "question_diverse", "autre"])
        .optional(),
      statut: z.enum(["ouvert", "en_cours", "clos"]).optional(),
      cursor: z.string().optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
  },
  (args) => appelApi(`/dossiers${query(args)}`),
);

server.registerTool(
  "echanges_compta",
  {
    description:
      "Les echanges comptables ouverts : par copro (AG a venir), le nombre de notes non resolues du fil gestionnaire <-> comptable et les flags de preparation des comptes.",
    inputSchema: {},
  },
  () => appelApi("/compta/echanges"),
);

// --- Tools d'ECRITURE (scopes dedies ; la cle doit etre liee a un gestionnaire) -

server.registerTool(
  "cocher_item_supervision",
  {
    description:
      "ECRITURE IMMEDIATE dans l'intranet : coche un item de la supervision d'une AG (ok / probleme / non_applicable). Ce tool AGIT tout de suite, sans validation humaine intermediaire - ne l'appelle qu'avec l'accord explicite de l'utilisateur, en passant confirmation=true. Exige le scope 'ecriture:supervision' et une cle liee a un gestionnaire.",
    inputSchema: {
      agId: z.string().min(1).max(60),
      itemId: z.string().min(1).max(80),
      statut: z.enum(["ok", "probleme", "non_applicable"]),
      commentaire: z.string().max(2000).optional(),
      confirmation: z
        .boolean()
        .describe("Doit etre true : confirme que l'utilisateur veut ecrire MAINTENANT dans l'intranet"),
    },
  },
  ({ agId, itemId, statut, commentaire, confirmation }) => {
    if (confirmation !== true) {
      return {
        content: [
          {
            type: "text",
            text: "Ecriture refusee : passe confirmation=true apres accord explicite de l'utilisateur (ce tool modifie l'intranet immediatement).",
          },
        ],
        isError: true,
      };
    }
    return appelApi(
      `/supervisions/${encodeURIComponent(agId)}/items/${encodeURIComponent(itemId)}`,
      { method: "POST", body: { statut, ...(commentaire !== undefined ? { commentaire } : {}) } },
    );
  },
);

server.registerTool(
  "poser_note_compta",
  {
    description:
      "ECRITURE IMMEDIATE dans l'intranet : pose une note dans le fil compta d'une AG (visible du pole comptable). Ce tool AGIT tout de suite, sans validation humaine intermediaire - ne l'appelle qu'avec l'accord explicite de l'utilisateur, en passant confirmation=true. Exige le scope 'ecriture:compta' et une cle liee a un gestionnaire.",
    inputSchema: {
      code: z.string().min(1).max(40).describe("Code copro"),
      agDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Date de l'AG, AAAA-MM-JJ"),
      texte: z.string().min(1).max(5000),
      idempotencyKey: z
        .string()
        .max(120)
        .optional()
        .describe("Cle d'idempotence optionnelle : rejouer le meme envoi ne cree pas de doublon"),
      confirmation: z
        .boolean()
        .describe("Doit etre true : confirme que l'utilisateur veut ecrire MAINTENANT dans l'intranet"),
    },
  },
  ({ code, agDate, texte, idempotencyKey, confirmation }) => {
    if (confirmation !== true) {
      return {
        content: [
          {
            type: "text",
            text: "Ecriture refusee : passe confirmation=true apres accord explicite de l'utilisateur (ce tool modifie l'intranet immediatement).",
          },
        ],
        isError: true,
      };
    }
    return appelApi(`/compta/${encodeURIComponent(code)}/${encodeURIComponent(agDate)}/notes`, {
      method: "POST",
      body: { texte },
      ...(idempotencyKey ? { idempotencyKey } : {}),
    });
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`real31-mcp connecte (API : ${API_URL}/api/v1)`);
