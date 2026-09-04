// GET /api/v1/openapi.json - la spec OpenAPI 3.1 de TOUTE la surface v1, ecrite A LA
// MAIN et maintenue avec les handlers (pas de generation : la spec EST le contrat).
// Servie derriere le scope `lecture` comme le reste (surface interne cabinet).

import { avecCleApi } from "@/lib/auth/cle-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PARAMS_PAGINATION = [
  {
    name: "cursor",
    in: "query",
    required: false,
    schema: { type: "string" },
    description: "Curseur opaque renvoyé par la page précédente (nextCursor).",
  },
  {
    name: "limit",
    in: "query",
    required: false,
    schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
    description: "Taille de page (max 100).",
  },
];

const REPONSES_COMMUNES = {
  "400": { description: "Paramètres invalides.", content: { "application/json": { schema: { $ref: "#/components/schemas/Erreur" } } } },
  "401": { description: "Clé absente, inconnue, révoquée ou expirée.", content: { "application/json": { schema: { $ref: "#/components/schemas/Erreur" } } } },
  "403": { description: "Scope insuffisant, clé cabinet en écriture, ou copropriété hors périmètre.", content: { "application/json": { schema: { $ref: "#/components/schemas/Erreur" } } } },
  "503": { description: "Clés API non configurées (table intranet_api_keys absente).", content: { "application/json": { schema: { $ref: "#/components/schemas/Erreur" } } } },
};

const SPEC = {
  openapi: "3.1.0",
  info: {
    title: "REAL31 Intranet - API v1",
    version: "1.0.0",
    description:
      "Surface machine de l'intranet REAL31 : lecture LARGE du pilotage syndic (copros, cycle AG, échéances, supervisions, dossiers, compta) + deux écritures internes sûres (item de supervision, note compta).\n\n" +
      "LIGNE ROUGE (non négociable) : cette API ne fera JAMAIS d'écriture eStale réelle, JAMAIS d'envoi de mail, JAMAIS de suppression, JAMAIS de conclusion d'AG ni d'injection reprise. Ces gestes restent derrière le GO/STOP humain dans l'UI de l'intranet.\n\n" +
      "Auth : `Authorization: Bearer real31_...` (clé machine créée dans /admin/cles-api). Clé liée à un gestionnaire = lectures cloisonnées à son portefeuille ; clé cabinet = lecture transverse, écritures interdites. Aucune PII copropriétaire n'est exposée (ni nom, ni email, ni téléphone d'owner).",
  },
  servers: [{ url: "/api/v1" }],
  security: [{ cleApi: [] }],
  components: {
    securitySchemes: {
      cleApi: {
        type: "http",
        scheme: "bearer",
        description: "Clé machine `real31_...`. Scopes portés par la clé : lecture, ecriture:supervision, ecriture:compta.",
      },
    },
    schemas: {
      Erreur: {
        type: "object",
        required: ["ok", "code", "message"],
        properties: {
          ok: { const: false },
          code: {
            type: "string",
            enum: [
              "cle_invalide", "cle_revoquee", "cle_expiree", "scope_manquant",
              "ecriture_exige_gestionnaire", "parametres_invalides", "introuvable",
              "hors_perimetre", "ag_conclue", "api_non_configuree", "erreur_interne",
            ],
          },
          message: { type: "string" },
        },
      },
      CoproListe: {
        type: "object",
        required: ["code", "nom", "ville", "source", "etat", "enRetard", "priseEnMain"],
        properties: {
          code: { type: "string" },
          nom: { type: "string" },
          ville: { type: "string" },
          source: { type: "string", enum: ["crypto", "estale"] },
          etat: { type: "string", enum: ["a_planifier", "a_venir", "en_preparation", "convoquee", "tenue"] },
          enRetard: { type: "boolean" },
          priseEnMain: { type: "boolean" },
          agDate: { type: "string", format: "date" },
          derniereAgDate: { type: "string", format: "date" },
          exerciceCloture: { type: "string", description: "JJ/MM" },
        },
      },
      CycleAg: {
        type: "object",
        required: ["etat", "enRetard", "etapeCourante", "actionDuMoment"],
        properties: {
          etat: { type: "string", enum: ["a_planifier", "a_venir", "en_preparation", "convoquee", "tenue"] },
          enRetard: { type: "boolean" },
          etapeCourante: { type: ["string", "null"], enum: ["dates", "odj", "convoc", "tenue", "pv", null] },
          actionDuMoment: {
            type: ["object", "null"],
            properties: { action: { type: "string" }, label: { type: "string" }, href: { type: "string" } },
          },
          echeance: { type: "string", description: 'Ex "J-30", "à dater", "en retard".' },
        },
      },
      Jalon: {
        type: "object",
        required: ["code", "libelle", "cibleDate", "source", "statut"],
        properties: {
          code: { type: "string", enum: ["ODJ_CS", "DEVIS", "CONVOC", "POUVOIRS", "TENUE", "SCAN_CONTRAT", "NOTIF_PV", "ARCHIVAGE"] },
          libelle: { type: "string" },
          cibleDate: { type: "string", format: "date" },
          source: { type: "string", enum: ["legal", "cabinet"] },
          statut: { type: "string", enum: ["a_faire", "accompli", "en_alerte"] },
          realiseDate: { type: "string", format: "date" },
          marquePar: { type: "string" },
        },
      },
      Echeance: {
        allOf: [
          { $ref: "#/components/schemas/Jalon" },
          {
            type: "object",
            required: ["coproCode", "coproNom", "agDate", "enRetard"],
            properties: {
              coproCode: { type: "string" },
              coproNom: { type: "string" },
              agDate: { type: "string", format: "date" },
              enRetard: { type: "boolean", description: "Cible dépassée et jalon non accompli." },
            },
          },
        ],
      },
      AgUrgente: {
        type: "object",
        required: ["coproCode", "coproNom", "prochaineAction", "actionLabel", "lien", "enRetard"],
        properties: {
          coproCode: { type: "string" },
          coproNom: { type: "string" },
          prochaineAction: { type: "string", description: 'Phrase d\'action du cycle, ex "préparer l\'ODJ".' },
          actionLabel: { type: "string" },
          lien: { type: "string", description: "Chemin intranet de l'action précise." },
          enRetard: { type: "boolean" },
          echeance: { type: "string" },
        },
      },
      Progression: {
        type: "object",
        required: ["verifies", "total", "pourcentage"],
        properties: { verifies: { type: "integer" }, total: { type: "integer" }, pourcentage: { type: "integer" } },
      },
      Supervision: {
        type: "object",
        required: ["id", "copro", "dateAgCible", "statut", "progression", "sections", "problemes"],
        properties: {
          id: { type: "string", description: 'Id "CODE__AAAA-MM-JJ" (ou "CODE" sans date).' },
          copro: { type: "object", properties: { code: { type: "string" }, nomCourt: { type: "string" } } },
          dateAgCible: { type: "string" },
          statut: { type: "string", enum: ["en_preparation", "conclue_archivee"] },
          progression: { $ref: "#/components/schemas/Progression" },
          visa: { type: "object", properties: { initiales: { type: "string" }, le: { type: "string" } } },
          sections: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                titre: { type: "string" },
                progression: { $ref: "#/components/schemas/Progression" },
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      libelle: { type: "string" },
                      statut: { type: "string", enum: ["non_verifie", "ok", "probleme", "non_applicable"] },
                      type: { type: "string", enum: ["check", "date"] },
                      commentaire: { type: "string" },
                      audite: { type: "object", properties: { initiales: { type: "string" }, le: { type: "string" } } },
                    },
                  },
                },
              },
            },
          },
          problemes: {
            type: "array",
            items: { type: "object", properties: { itemId: { type: "string" }, libelle: { type: "string" }, commentaire: { type: "string" } } },
          },
        },
      },
      ProblemesCopro: {
        type: "object",
        required: ["coproCode", "coproNom", "items"],
        properties: {
          coproCode: { type: "string" },
          coproNom: { type: "string" },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                agId: { type: "string" },
                itemLibelle: { type: "string" },
                commentaire: { type: "string" },
                par: { type: "string" },
                le: { type: "string", format: "date-time" },
              },
            },
          },
        },
      },
      DossierListe: {
        type: "object",
        required: ["id", "coproCode", "type", "portee", "titre", "statut", "ouvertLe", "progression"],
        properties: {
          id: { type: "string", format: "uuid" },
          coproCode: { type: "string" },
          coproNom: { type: "string" },
          type: { type: "string", enum: ["travaux", "sinistre", "impaye", "procedure", "recouvrement", "question_diverse", "autre"] },
          portee: { type: "string", enum: ["copropriete", "coproprietaire", "lot"], description: "La CIBLE nominative (nom d'owner) n'est jamais exposée." },
          titre: { type: "string" },
          statut: { type: "string", enum: ["ouvert", "en_cours", "clos"] },
          ouvertLe: { type: "string", format: "date-time" },
          ouvertPar: { type: "string" },
          agDate: { type: "string", format: "date" },
          numeroResolution: { type: "string" },
          progression: { type: "object", properties: { faites: { type: "integer" }, total: { type: "integer" }, pct: { type: "integer" } } },
        },
      },
      EchangeCompta: {
        type: "object",
        required: ["coproCode", "coproNom", "agDate", "notesOuvertes", "comptesVerifies", "envoyerAvant"],
        properties: {
          coproCode: { type: "string" },
          coproNom: { type: "string" },
          agDate: { type: "string", format: "date" },
          notesOuvertes: { type: "integer" },
          comptesVerifies: { type: "boolean" },
          envoyerAvant: { type: "boolean" },
        },
      },
      NoteCompta: {
        type: "object",
        required: ["id", "auteur", "texte", "resolu", "createdAt"],
        properties: {
          id: { type: "string" },
          auteur: { type: "string", enum: ["comptable", "gestionnaire"] },
          texte: { type: "string" },
          resolu: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
          marquePar: { type: "string" },
        },
      },
    },
  },
  paths: {
    "/copros": {
      get: {
        summary: "Liste des copropriétés du périmètre + état du cycle AG",
        parameters: [
          { name: "etat", in: "query", required: false, schema: { type: "string", enum: ["a_planifier", "a_venir", "en_preparation", "convoquee", "tenue"] } },
          { name: "agence", in: "query", required: false, schema: { type: "string" }, description: "Code agence (ML/LGC/HLS/ASN)." },
          ...PARAMS_PAGINATION,
        ],
        responses: {
          "200": {
            description: "Page de copropriétés.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["ok", "copros", "total"],
                  properties: {
                    ok: { const: true },
                    copros: { type: "array", items: { $ref: "#/components/schemas/CoproListe" } },
                    total: { type: "integer" },
                    nextCursor: { type: "string" },
                  },
                },
              },
            },
          },
          ...REPONSES_COMMUNES,
        },
      },
    },
    "/copros/{code}": {
      get: {
        summary: "Fiche d'une copropriété : identité, dates AG/CS, équipe, cycle (actionDuMoment), jalons, conformité",
        parameters: [{ name: "code", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "La fiche. Sans PII copropriétaires (pas de conseil syndical nominatif, pas de débiteurs).",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["ok", "copro", "equipe", "jalons", "conformite", "historique"],
                  properties: {
                    ok: { const: true },
                    copro: { type: "object", description: "Identité + dates AG/CS (référentiel)." },
                    equipe: { type: "array", items: { type: "object", properties: { nomComplet: { type: "string" }, initiales: { type: "string" }, role: { type: "string" } } } },
                    cycle: { $ref: "#/components/schemas/CycleAg" },
                    jalons: { type: "array", items: { $ref: "#/components/schemas/Jalon" } },
                    conformite: { type: "array", items: { type: "object", properties: { libelle: { type: "string" }, etat: { type: "string", enum: ["ok", "attention", "ko"] } } } },
                    historique: { type: "array", items: { type: "object", properties: { date: { type: "string", format: "date" }, type: { type: "string", enum: ["AG", "AGE"] } } } },
                    compta: { type: "object", properties: { comptesVerifies: { type: "boolean" }, envoyerAvant: { type: "boolean" } } },
                    confirmationAg: { type: "string" },
                    confirmationCs: { type: "string" },
                    estaleIndisponible: { type: "boolean" },
                  },
                },
              },
            },
          },
          "404": { description: "Copropriété inconnue ou hors périmètre.", content: { "application/json": { schema: { $ref: "#/components/schemas/Erreur" } } } },
          ...REPONSES_COMMUNES,
        },
      },
    },
    "/echeances": {
      get: {
        summary: "Jalons AG du périmètre (à venir / en retard) - le produit phare",
        description: "Par défaut, seuls les jalons NON accomplis sortent ; ?tous=true inclut les accomplis.",
        parameters: [
          { name: "copro", in: "query", required: false, schema: { type: "string" } },
          { name: "enRetard", in: "query", required: false, schema: { type: "string", enum: ["true", "false"] } },
          { name: "tous", in: "query", required: false, schema: { type: "string", enum: ["true", "false"] } },
          ...PARAMS_PAGINATION,
        ],
        responses: {
          "200": {
            description: "Page d'échéances, triées par date cible croissante.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["ok", "echeances", "total"],
                  properties: {
                    ok: { const: true },
                    echeances: { type: "array", items: { $ref: "#/components/schemas/Echeance" } },
                    total: { type: "integer" },
                    nextCursor: { type: "string" },
                  },
                },
              },
            },
          },
          ...REPONSES_COMMUNES,
        },
      },
    },
    "/ag-urgentes": {
      get: {
        summary: "AG les plus urgentes : l'action du moment par copro (dérivée du cycle AG)",
        parameters: PARAMS_PAGINATION,
        responses: {
          "200": {
            description: "Lignes triées par urgence (retard, puis échéance datée, puis suivi post-AG).",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["ok", "agUrgentes", "total"],
                  properties: {
                    ok: { const: true },
                    agUrgentes: { type: "array", items: { $ref: "#/components/schemas/AgUrgente" } },
                    total: { type: "integer" },
                    nextCursor: { type: "string" },
                  },
                },
              },
            },
          },
          ...REPONSES_COMMUNES,
        },
      },
    },
    "/supervisions/{agId}": {
      get: {
        summary: "Supervision d'une AG : progression, sections, items, problèmes",
        parameters: [{ name: "agId", in: "path", required: true, schema: { type: "string" }, description: '"CODE__AAAA-MM-JJ" (ou "CODE" sans date).' }],
        responses: {
          "200": {
            description: "La supervision.",
            content: {
              "application/json": {
                schema: { type: "object", required: ["ok", "supervision"], properties: { ok: { const: true }, supervision: { $ref: "#/components/schemas/Supervision" } } },
              },
            },
          },
          "404": { description: "Supervision inconnue ou hors périmètre.", content: { "application/json": { schema: { $ref: "#/components/schemas/Erreur" } } } },
          ...REPONSES_COMMUNES,
        },
      },
    },
    "/supervisions/{agId}/items/{itemId}": {
      post: {
        summary: "ÉCRITURE - cocher un item de supervision (ok / probleme / non_applicable)",
        description: "Scope `ecriture:supervision` + clé liée à un gestionnaire. Idempotente : rejouer le même statut aboutit au même état final.",
        parameters: [
          { name: "agId", in: "path", required: true, schema: { type: "string" } },
          { name: "itemId", in: "path", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["statut"],
                properties: {
                  statut: { type: "string", enum: ["ok", "probleme", "non_applicable"] },
                  commentaire: { type: "string", maxLength: 2000 },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Item mis à jour.", content: { "application/json": { schema: { type: "object", properties: { ok: { const: true }, item: { type: "object" }, par: { type: "string" } } } } } },
          "404": { description: "Supervision ou item inconnu.", content: { "application/json": { schema: { $ref: "#/components/schemas/Erreur" } } } },
          "409": { description: "AG déjà conclue : modification interdite.", content: { "application/json": { schema: { $ref: "#/components/schemas/Erreur" } } } },
          ...REPONSES_COMMUNES,
        },
      },
    },
    "/problemes": {
      get: {
        summary: "Problèmes signalés du périmètre, groupés par copropriété",
        parameters: PARAMS_PAGINATION,
        responses: {
          "200": {
            description: "Page de problèmes.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["ok", "problemes", "total"],
                  properties: {
                    ok: { const: true },
                    problemes: { type: "array", items: { $ref: "#/components/schemas/ProblemesCopro" } },
                    total: { type: "integer" },
                    nextCursor: { type: "string" },
                  },
                },
              },
            },
          },
          ...REPONSES_COMMUNES,
        },
      },
    },
    "/dossiers": {
      get: {
        summary: "Dossiers suivis du périmètre (travaux, sinistre, impayé...)",
        parameters: [
          { name: "copro", in: "query", required: false, schema: { type: "string" } },
          { name: "type", in: "query", required: false, schema: { type: "string", enum: ["travaux", "sinistre", "impaye", "procedure", "recouvrement", "question_diverse", "autre"] } },
          { name: "statut", in: "query", required: false, schema: { type: "string", enum: ["ouvert", "en_cours", "clos"] } },
          ...PARAMS_PAGINATION,
        ],
        responses: {
          "200": {
            description: "Page de dossiers (sans la cible nominative).",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["ok", "dossiers", "total"],
                  properties: {
                    ok: { const: true },
                    dossiers: { type: "array", items: { $ref: "#/components/schemas/DossierListe" } },
                    total: { type: "integer" },
                    nextCursor: { type: "string" },
                  },
                },
              },
            },
          },
          ...REPONSES_COMMUNES,
        },
      },
    },
    "/dossiers/{id}": {
      get: {
        summary: "Détail d'un dossier : étapes, journal, équipe de la copro",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "Le dossier (sans la cible nominative).",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["ok", "dossier"],
                  properties: {
                    ok: { const: true },
                    dossier: { allOf: [{ $ref: "#/components/schemas/DossierListe" }, { type: "object", properties: { origine: { type: "string" }, etapes: { type: "array" }, journal: { type: "array" } } }] },
                    gestionnaire: { type: "object", properties: { nom: { type: "string" }, initiales: { type: "string" } } },
                    assistant: { type: "object", properties: { nom: { type: "string" }, initiales: { type: "string" } } },
                  },
                },
              },
            },
          },
          "404": { description: "Dossier inconnu ou hors périmètre.", content: { "application/json": { schema: { $ref: "#/components/schemas/Erreur" } } } },
          ...REPONSES_COMMUNES,
        },
      },
    },
    "/compta/echanges": {
      get: {
        summary: "Échanges comptables ouverts : notes non résolues par copro (AG à venir)",
        parameters: PARAMS_PAGINATION,
        responses: {
          "200": {
            description: "Copros avec au moins une note non résolue.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["ok", "echanges", "total"],
                  properties: {
                    ok: { const: true },
                    echanges: { type: "array", items: { $ref: "#/components/schemas/EchangeCompta" } },
                    total: { type: "integer" },
                    nextCursor: { type: "string" },
                  },
                },
              },
            },
          },
          ...REPONSES_COMMUNES,
        },
      },
    },
    "/compta/{code}/{agDate}": {
      get: {
        summary: "État compta d'une AG : flags, checklist des postes, fil de notes",
        parameters: [
          { name: "code", in: "path", required: true, schema: { type: "string" } },
          { name: "agDate", in: "path", required: true, schema: { type: "string", format: "date" } },
        ],
        responses: {
          "200": {
            description: "L'état compta.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["ok", "coproCode", "agDate", "comptesVerifies", "envoyerAvant", "checks", "statutChecklist", "progression", "notes"],
                  properties: {
                    ok: { const: true },
                    coproCode: { type: "string" },
                    coproNom: { type: "string" },
                    agDate: { type: "string", format: "date" },
                    comptesVerifies: { type: "boolean" },
                    envoyerAvant: { type: "boolean" },
                    checks: { type: "object", additionalProperties: { type: "string", enum: ["a_verifier", "ok", "a_revoir", "non_applicable"] } },
                    statutChecklist: { type: "string", enum: ["vierge", "en_cours", "a_revoir", "complet"] },
                    progression: { type: "object" },
                    notes: { type: "array", items: { $ref: "#/components/schemas/NoteCompta" } },
                  },
                },
              },
            },
          },
          "404": { description: "Copropriété inconnue ou hors périmètre.", content: { "application/json": { schema: { $ref: "#/components/schemas/Erreur" } } } },
          ...REPONSES_COMMUNES,
        },
      },
    },
    "/compta/{code}/{agDate}/notes": {
      post: {
        summary: "ÉCRITURE - poser une note dans le fil compta d'une AG",
        description:
          "Scope `ecriture:compta` + clé liée à un gestionnaire (auteur déduit de la clé). Header optionnel `Idempotency-Key` : rejouer le même POST ne crée pas de doublon (best-effort, mémoire de process).",
        parameters: [
          { name: "code", in: "path", required: true, schema: { type: "string" } },
          { name: "agDate", in: "path", required: true, schema: { type: "string", format: "date" } },
          { name: "Idempotency-Key", in: "header", required: false, schema: { type: "string" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { type: "object", required: ["texte"], properties: { texte: { type: "string", minLength: 1, maxLength: 5000 } } },
            },
          },
        },
        responses: {
          "201": { description: "Note posée.", content: { "application/json": { schema: { type: "object", properties: { ok: { const: true }, rejoue: { const: false }, par: { type: "string" } } } } } },
          "200": { description: "Rejeu détecté (Idempotency-Key déjà vue) : rien de ré-écrit.", content: { "application/json": { schema: { type: "object", properties: { ok: { const: true }, rejoue: { const: true } } } } } },
          ...REPONSES_COMMUNES,
        },
      },
    },
    "/openapi.json": {
      get: {
        summary: "Cette spécification",
        responses: { "200": { description: "Le document OpenAPI 3.1." }, ...REPONSES_COMMUNES },
      },
    },
  },
} as const;

export const GET = avecCleApi("lecture", async () => {
  return new Response(JSON.stringify(SPEC), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
});
