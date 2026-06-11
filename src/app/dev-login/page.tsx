import type { Metadata } from "next";
import { getGestionnaireRepository } from "@/lib/adapters/router";
import { choisirGestionnaire } from "./actions";

export const metadata: Metadata = { title: "Choisir un gestionnaire - REAL31 Intranet" };
export const dynamic = "force-dynamic";

export default async function DevLoginPage() {
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
