import type { Metadata } from "next";
import { getGestionnaireRepository, getAgenceRepository } from "@/lib/adapters/router";
import { impersonationAutorisee } from "@/lib/auth/session";
import { estSuperAdmin } from "@/lib/auth/roles";
import { connecterMicrosoft } from "./actions";
import { SelecteurCollaborateur } from "./selecteur-collaborateur";
import { Button } from "@/components/ui/button";

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

export default async function DevLoginPage() {
  // Bouton Microsoft 365 si l'utilisateur n'a PAS le droit d'incarner un gestionnaire
  // (gestionnaire normal en prod SSO, ou non connecte). Sinon (dev, super-admin, sans
  // SSO) : le selecteur pour choisir / changer de gestionnaire.
  if (!(await impersonationAutorisee())) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-2 px-4">
        <div className="w-full max-w-sm bg-surface border border-line rounded-lg shadow-1 p-7 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-real31.png" alt="REAL 31 Immobilier" className="h-12 w-auto mx-auto mb-5" />
          <h1 className="text-title font-medium text-ink">Intranet REAL 31</h1>
          <p className="text-body text-ink-3 mt-1 mb-6">
            Connectez-vous avec votre compte Microsoft 365.
          </p>
          <form action={connecterMicrosoft}>
            <Button
              type="submit"
              variant="primary" size="lg" className="w-full"
            >
              Se connecter avec Microsoft
            </Button>
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
  const collaborateurs = gestionnaires.map((g) => ({
    id: g.id,
    nomComplet: g.nomComplet,
    initiales: g.initiales,
    role: libelleRole(g.role),
    roleBrut: g.role ?? null,
    agence: (g.agencyId ? codeParAgence.get(g.agencyId) : undefined) ?? null,
    superAdmin: estSuperAdmin(g.email),
  }));
  return (
    <div className="min-h-screen flex items-start justify-center bg-surface-2 px-4 py-10">
      <div className="w-full max-w-lg bg-surface border border-line rounded-lg shadow-1 p-6">
        <h1 className="text-title font-medium text-ink">Choisir un collaborateur</h1>
        <p className="text-body text-ink-3 mt-1 mb-4">
          Session dev. Vous verrez l&apos;intranet comme la personne choisie : ses copropriétés, son rail, ses droits.
        </p>
        <SelecteurCollaborateur collaborateurs={collaborateurs} />
      </div>
    </div>
  );
}
