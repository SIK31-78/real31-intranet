"use client";

import { KeyRound, Lock, Fingerprint } from "lucide-react";
import type { Coffre, Deverrouillage } from "@/lib/domain/coffre";
import { Button } from "@/components/ui/button";
import { PanneauReinitialisation } from "./panneau-reinitialisation";
import { BarreForce, BoiteMdpGenere, Bouton, Cadre } from "./coffre-ui";
import { champClasse } from "./coffre.utils";

// Ecran verrouille : ouverture (mot de passe maitre ou Windows Hello) pour qui est
// deja enrole, sinon la creation du coffre (1er acces). Toute la crypto est appelee
// par l'orchestrateur (coffre-vue) ; ici on ne fait que saisir et declencher.
export function EcranVerrouille({
  nomComplet,
  dejaEnrole,
  passkeyDev,
  coffres,
  mdp,
  onMdp,
  mdp2,
  onMdp2,
  mdpRevele,
  onEffacerMdpRevele,
  busy,
  erreur,
  onDeverrouiller,
  onDeverrouillerPasskey,
  onEnroler,
  onGenererMaitre,
  onInfo,
}: {
  nomComplet: string;
  dejaEnrole: boolean;
  passkeyDev: Deverrouillage | null;
  coffres: readonly Coffre[];
  mdp: string;
  onMdp: (v: string) => void;
  mdp2: string;
  onMdp2: (v: string) => void;
  mdpRevele: string | null;
  onEffacerMdpRevele: () => void;
  busy: boolean;
  erreur: string | null;
  onDeverrouiller: () => void;
  onDeverrouillerPasskey: () => void;
  onEnroler: () => void;
  onGenererMaitre: () => void;
  onInfo: (m: string) => void;
}) {
  return (
    <Cadre>
      <div className="flex items-center gap-2 mb-1">
        <KeyRound className="w-5 h-5 text-green-700" strokeWidth={1.5} />
        <h1 className="text-title font-medium text-ink">Coffre-fort</h1>
      </div>
      {dejaEnrole ? (
        <>
          <p className="text-body text-ink-3 mb-4">
            Bonjour {nomComplet}.{" "}
            {passkeyDev
              ? "Ouvre ton coffre avec Windows Hello (empreinte ou code PIN), ou avec ton mot de passe maître."
              : "Saisis ton mot de passe maître pour ouvrir ton coffre."}
          </p>
          <div className="flex flex-col gap-2 max-w-xs">
            {passkeyDev && (
              <>
                <Bouton
                  onClick={onDeverrouillerPasskey}
                  busy={busy}
                  label="Ouvrir avec Windows Hello"
                  icone={Fingerprint}
                />
                <div className="text-meta text-ink-3 text-center my-0.5">ou avec ton mot de passe maître</div>
              </>
            )}
            <input
              type="password"
              className={champClasse}
              placeholder="Mot de passe maître"
              value={mdp}
              onChange={(e) => onMdp(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !busy && onDeverrouiller()}
              autoFocus={!passkeyDev}
            />
            <Bouton onClick={onDeverrouiller} busy={busy} label="Ouvrir le coffre" icone={Lock} />
          </div>
          <PanneauReinitialisation coffres={coffres} />
        </>
      ) : (
        <>
          <p className="text-body text-ink-3 mb-1">
            Première connexion : choisis un <strong>mot de passe maître</strong>. C&apos;est la clé de ton
            coffre, et il ne quitte jamais ton appareil.
          </p>
          <p className="text-body text-warn-700 bg-warn-50 border border-warn-500/30 rounded-md px-3 py-2 mb-4 max-w-md">
            À retenir : personne ne peut le récupérer à ta place, pas même nous. Si tu l&apos;oublies, le
            contenu de ton coffre est perdu. Note-le dans un endroit sûr.
          </p>
          <div className="flex flex-col gap-2 max-w-sm">
            <input
              type="password"
              autoComplete="new-password"
              className={champClasse}
              placeholder="Mot de passe maître"
              value={mdp}
              onChange={(e) => {
                onMdp(e.target.value);
                onEffacerMdpRevele();
              }}
            />
            <BarreForce mdp={mdp} />
            <input
              type="password"
              autoComplete="new-password"
              className={champClasse}
              placeholder="Confirmer"
              value={mdp2}
              onChange={(e) => onMdp2(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !busy && onEnroler()}
            />
            <Button
              onClick={onGenererMaitre}
              variant="ghost" className="self-start"
            >
              Générer un mot de passe robuste
            </Button>
            <BoiteMdpGenere mdp={mdpRevele} onCopie={() => onInfo("Mot de passe copié.")} />
            <Bouton onClick={onEnroler} busy={busy} label="Creer mon coffre" icone={KeyRound} />
          </div>
        </>
      )}
      {erreur && <p className="text-body text-err-500 mt-3">{erreur}</p>}
    </Cadre>
  );
}
