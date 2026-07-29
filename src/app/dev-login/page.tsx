import type { Metadata } from "next";
import { getGestionnaireRepository, getAgenceRepository } from "@/lib/adapters/router";
import { impersonationAutorisee } from "@/lib/auth/session";
import { estSuperAdmin } from "@/lib/auth/roles";
import { choisirGestionnaire, connecterMicrosoft } from "./actions";

export const metadata: Metadata = { title: "Connexion - REAL31 Intranet" };
export const dynamic = "force-dynamic";

// Libelles FR courts des roles bruts de public."User".role (enum App A). DISPLAY seulement :
// l'acces intranet reste pilote par l'env (roles.ts), seul comptable est table-driven. Un
// role non liste retombe sur sa valeur brute (jamais un ecran vide).
const LIBELLE_ROLE_BRUT: Record<string, string> = {
  COMPTABLE: "Comptable",
  GESTIONNAIRE: "Gestionnaire",
  ASSISTANT: "Assistant",
  DIRECTEUR_SYNDIC: "Directeur syndic",
  ADMIN: "Admin",
  DIRECTEUR_AGENCE: "Directeur agence",
  CONSEILLER_VENTE: "Conseiller vente",
  GESTIONNAIRE_LOCATIVE: "Gestionnaire locative",
  AUTRE: "Autre",
};

function libelleRole(role: string | null | undefined): string | null {
  const brut = role?.trim();
  if (!brut) return null;
  return LIBELLE_ROLE_BRUT[brut.toUpperCase()] ?? brut;
}

// Style commun des badges (reprend le pattern du badge "comptable" existant).
const BADGE_CLASS =
  "text-[10px] font-medium uppercase tracking-wide text-ink-3 border border-line rounded px-1.5 py-px";

export default async function DevLoginPage() {
  // Bouton Microsoft 365 si l'utilisateur n'a PAS le droit d'incarner un gestionnaire
  // (gestionnaire normal en prod SSO, ou non connecte). Sinon (dev, super-admin, sans
  // SSO) : le selecteur pour choisir / changer de gestionnaire.
  if (!(await impersonationAutorisee())) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-2 px-4">
        <div className="w-full max-w-sm bg-surface border border-line rounded-md p-7 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-real31.png" alt="REAL 31 Immobilier" className="h-12 w-auto mx-auto mb-5" />
          <h1 className="text-[18px] font-medium text-ink">Intranet REAL 31</h1>
          <p className="text-[13px] text-ink-3 mt-1 mb-6">
            Connectez-vous avec votre compte Microsoft 365.
          </p>
          <form action={connecterMicrosoft}>
            <button
              type="submit"
              className="w-full h-10 rounded-md bg-green-700 text-white text-[14px] font-medium hover:bg-green-600 transition-colors"
            >
              Se connecter avec Microsoft
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Mode dev : selecteur de profil incarnable (sera remplace par le SSO en prod).
  // listImpersonables = gestionnaires/assistants de copros + les comptables (transverses,
  // role COMPTABLE dans la table -- pose le 2026-07-29 : ils y etaient en "AUTRE", ce qui
  // les rendait invisibles ici).
  const gestionnaires = await getGestionnaireRepository().listImpersonables();
  // Resolution agence (id -> code ML/LGC/HLS/ASN) : une seule lecture de la table Agency
  // (4 lignes), degrade en Map vide si la table est absente -> pas de badge agence.
  const agences = await getAgenceRepository().listerAgences();
  const codeParAgence = new Map(agences.map((a) => [a.id, a.code]));
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-2 px-4">
      <div className="w-full max-w-md bg-surface border border-line rounded-md p-6">
        <h1 className="text-[18px] font-medium text-ink">Choisir un gestionnaire</h1>
        <p className="text-[13px] text-ink-3 mt-1 mb-4">
          Session dev (sera remplacée par l&apos;authentification Entra ID). Vous ne verrez
          que les copropriétés du gestionnaire choisi.
        </p>
        <ul className="flex flex-col gap-1.5">
          {gestionnaires.map((g) => {
            const roleLisible = libelleRole(g.role);
            const agenceCode = g.agencyId ? codeParAgence.get(g.agencyId) : undefined;
            return (
              <li key={g.id}>
                <form action={choisirGestionnaire.bind(null, g.id)}>
                  <button
                    type="submit"
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-md border border-line bg-surface hover:bg-surface-2 text-left transition-colors"
                  >
                    <span className="w-8 h-8 rounded-full bg-surface-2 text-ink-2 text-[12px] font-medium flex items-center justify-center shrink-0">
                      {g.initiales}
                    </span>
                    <span className="text-[14px] text-ink">{g.nomComplet}</span>
                    {/* Badges DISPLAY : role (libelle FR) + agence (code) + super-admin
                        (statut env SUPER_ADMINS, pas dans la table -> sinon invisible). Le
                        libelle de role couvre deja "Comptable" (pas de marqueur separe). */}
                    <span className="ml-auto flex items-center gap-1.5 shrink-0">
                      {roleLisible && <span className={BADGE_CLASS}>{roleLisible}</span>}
                      {agenceCode && <span className={BADGE_CLASS}>{agenceCode}</span>}
                      {estSuperAdmin(g.email) && (
                        <span className="text-[10px] font-medium uppercase tracking-wide text-green-700 border border-green-700/40 rounded px-1.5 py-px">
                          super-admin
                        </span>
                      )}
                    </span>
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
