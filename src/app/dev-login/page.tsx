import type { Metadata } from "next";
import { getGestionnaireRepository } from "@/lib/adapters/router";
import { ssoConfigure } from "@/auth";
import { choisirGestionnaire, connecterMicrosoft } from "./actions";

export const metadata: Metadata = { title: "Connexion - REAL31 Intranet" };
export const dynamic = "force-dynamic";

export default async function DevLoginPage() {
  // SSO configure : connexion Microsoft 365 (plus de selecteur dev).
  if (ssoConfigure) {
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

  // Mode dev : selecteur de gestionnaire (sera remplace par le SSO en prod).
  const gestionnaires = await getGestionnaireRepository().list();
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-2 px-4">
      <div className="w-full max-w-md bg-surface border border-line rounded-md p-6">
        <h1 className="text-[18px] font-medium text-ink">Choisir un gestionnaire</h1>
        <p className="text-[13px] text-ink-3 mt-1 mb-4">
          Session dev (sera remplacée par l&apos;authentification Entra ID). Vous ne verrez
          que les copropriétés du gestionnaire choisi.
        </p>
        <ul className="flex flex-col gap-1.5">
          {gestionnaires.map((g) => (
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
                </button>
              </form>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
