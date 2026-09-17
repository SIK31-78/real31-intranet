"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { deverrouillerMotDePasse, rewrapperMotDePasse } from "@/lib/coffre/coffre-client";
import { changerMotDePasseMaitreAction } from "@/app/coffre/actions";
import { validerNouveauMotDePasseMaitre, type Deverrouillage } from "@/lib/domain/coffre";
import { Button } from "@/components/ui/button";
import { BarreForce, BoiteMdpGenere, Bouton } from "./coffre-ui";
import { champClasse, genererMotDePasseFort } from "./coffre.utils";

// --- Changer son mot de passe maitre (coffre deverrouille, ZERO perte) ------
//
// La cle privee ne bouge pas : on la deballe avec l'ANCIEN mot de passe (ce qui
// prouve du meme coup qu'on le connait), puis on la re-enrobe avec la cle
// derivee du nouveau. Les cles de coffre et les secrets ne sont pas touches -
// rien a rechiffrer, rien a perdre. Le serveur ne recoit que le blob re-enrobe.
//
// On EXIGE le mot de passe actuel : une session laissee ouverte ne doit pas
// suffire a changer la serrure et enfermer dehors le proprietaire du coffre.

export function PanneauChangementMdp({
  dev,
  onChange,
  onFermer,
}: {
  dev: Deverrouillage;
  onChange: (nouveau: Deverrouillage) => void;
  onFermer: () => void;
}) {
  const toast = useToast();
  const [actuel, setActuel] = useState("");
  const [nouveau, setNouveau] = useState("");
  const [nouveau2, setNouveau2] = useState("");
  const [genere, setGenere] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  function generer() {
    const g = genererMotDePasseFort();
    setNouveau(g);
    setNouveau2(g);
    setGenere(g);
    setErreur(null);
  }

  async function valider() {
    setErreur(null);
    const v = validerNouveauMotDePasseMaitre(nouveau, nouveau2, actuel);
    if (!v.ok) return setErreur(v.raison ?? "Mot de passe invalide.");
    setBusy(true);
    try {
      // Deballer avec l'ancien mot de passe = la seule verification qui vaille :
      // elle echoue (tag GCM) si le mot de passe est faux. Aucun controle cote
      // serveur ne pourrait la faire a sa place - il ne voit que du chiffre.
      let prive: CryptoKey;
      try {
        prive = await deverrouillerMotDePasse(actuel, dev);
      } catch {
        setErreur("Mot de passe actuel incorrect.");
        return;
      }
      const { wrappedPrivateKey, params } = await rewrapperMotDePasse(prive, nouveau);
      await changerMotDePasseMaitreAction(wrappedPrivateKey, params);
      setActuel("");
      setNouveau("");
      setNouveau2("");
      setGenere(null);
      toast.ok("Mot de passe maître changé. Tes mots de passe sont intacts.");
      onChange({ ...dev, wrappedPrivateKey, params });
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border border-line rounded-lg bg-surface px-4 py-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-body font-medium text-ink">Changer mon mot de passe maître</span>
        <Button onClick={onFermer} variant="ghost">
          Fermer
        </Button>
      </div>
      <p className="text-body text-ink-3">
        Tes mots de passe enregistrés ne bougent pas : seule la serrure change. Ta passkey (Windows Hello)
        continue de fonctionner.
      </p>
      <div className="flex flex-col gap-2 max-w-sm">
        <input
          type="password"
          autoComplete="current-password"
          className={champClasse}
          placeholder="Mot de passe maître actuel"
          value={actuel}
          onChange={(e) => setActuel(e.target.value)}
        />
        <input
          type="password"
          autoComplete="new-password"
          className={champClasse}
          placeholder="Nouveau mot de passe maître"
          value={nouveau}
          onChange={(e) => {
            setNouveau(e.target.value);
            setGenere(null);
          }}
        />
        <BarreForce mdp={nouveau} />
        <input
          type="password"
          autoComplete="new-password"
          className={champClasse}
          placeholder="Confirmer le nouveau"
          value={nouveau2}
          onChange={(e) => setNouveau2(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !busy && valider()}
        />
        <Button onClick={generer} variant="ghost" className="self-start">
          Générer un mot de passe robuste
        </Button>
        <BoiteMdpGenere mdp={genere} onCopie={() => toast.ok("Mot de passe copié.")} />
        <Bouton onClick={valider} busy={busy} label="Changer le mot de passe" icone={KeyRound} />
      </div>
      <p className="text-meta text-ink-3">
        Tu ne te souviens plus de l&apos;actuel ? Verrouille le coffre : l&apos;écran d&apos;ouverture propose une
        réinitialisation (avec perte du contenu).
      </p>
      {erreur && <p className="text-body text-err-500">{erreur}</p>}
    </div>
  );
}
