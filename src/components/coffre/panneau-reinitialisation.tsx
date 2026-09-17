"use client";

import { useState } from "react";
import { Loader2, RotateCcw, AlertTriangle } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { enrolerMotDePasse, creerCleCoffrePour } from "@/lib/coffre/coffre-client";
import { reinitialiserCoffreAction } from "@/app/coffre/actions";
import {
  validerNouveauMotDePasseMaitre,
  impactReinitialisation,
  type Coffre,
} from "@/lib/domain/coffre";
import { Button } from "@/components/ui/button";
import { BarreForce, BoiteMdpGenere } from "./coffre-ui";
import { champClasse, genererMotDePasseFort } from "./coffre.utils";

// --- Reinitialiser quand le mot de passe maitre est OUBLIE ------------------
//
// Il n'y a RIEN a recuperer : la cle privee n'existe que sous forme enrobee par
// une cle derivee du mot de passe. Sans lui, ni nous ni le serveur ne pouvons la
// deballer - c'est precisement ce qui fait tenir le zero-knowledge. Une "reinit"
// qui redonnerait les anciens secrets supposerait une copie en clair quelque
// part, c'est-a-dire une porte derobee.
//
// Donc : identite crypto NEUVE, et on assume les pertes, annoncees coffre par
// coffre avant confirmation. Les coffres partages, eux, survivent chez leurs
// autres membres : un admin redonnera l'acces apres coup.

export function PanneauReinitialisation({ coffres }: { coffres: readonly Coffre[] }) {
  const confirmer = useConfirm();
  const toast = useToast();
  const [ouvert, setOuvert] = useState(false);
  const [mdp, setMdp] = useState("");
  const [mdp2, setMdp2] = useState("");
  const [genere, setGenere] = useState<string | null>(null);
  const [compris, setCompris] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const impact = impactReinitialisation(coffres);

  function generer() {
    const g = genererMotDePasseFort();
    setMdp(g);
    setMdp2(g);
    setGenere(g);
    setErreur(null);
  }

  async function reinitialiser() {
    setErreur(null);
    const v = validerNouveauMotDePasseMaitre(mdp, mdp2);
    if (!v.ok) return setErreur(v.raison ?? "Mot de passe invalide.");
    if (!compris) return setErreur("Coche la case : la perte est définitive.");
    const ok = await confirmer({
      titre: "Réinitialiser ton coffre ?",
      message: impact.perteDefinitive
        ? `Le contenu de ${impact.perdus.length > 1 ? "tes coffres personnels" : "ton coffre personnel"} sera définitivement perdu. Personne ne peut le récupérer, pas même un administrateur.`
        : "Ton identité de coffre sera remplacée. Cette action est irréversible.",
      confirmer: "Réinitialiser",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      // Identite entierement neuve : aucun ancien blob n'est lu ni dechiffre.
      const { donnees, publicKey } = await enrolerMotDePasse(mdp);
      const { wrappedVaultKey } = await creerCleCoffrePour(publicKey);
      await reinitialiserCoffreAction({
        publicKey: donnees.publicKey,
        wrappedPrivateKey: donnees.wrappedPrivateKey,
        params: donnees.params,
        coffrePerso: { nom: "Mes mots de passe", wrappedVaultKey },
      });
      setMdp("");
      setMdp2("");
      setGenere(null);
      // On recharge : l'etat rendu par le serveur (coffres, methodes) date
      // d'avant la reinitialisation. L'utilisateur rouvre avec le nouveau mot de
      // passe, ce qui verifie au passage qu'il l'a bien note.
      window.location.reload();
    } catch (e) {
      setErreur((e as Error).message);
      setBusy(false);
    }
  }

  if (!ouvert) {
    return (
      <Button
        onClick={() => setOuvert(true)}
        variant="ghost" className="self-start mt-4"
      >
        Mot de passe maître oublié ?
      </Button>
    );
  }

  return (
    <div className="mt-4 max-w-md rounded-lg border border-err-500/40 bg-err-50 px-4 py-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-body font-medium text-err-700 flex items-center gap-1.5">
          <AlertTriangle className="w-4 h-4" strokeWidth={1.5} /> Réinitialiser le coffre
        </span>
        <Button onClick={() => setOuvert(false)} variant="ghost">
          Annuler
        </Button>
      </div>
      <p className="text-body text-ink-2">
        Ton mot de passe maître est la <strong>seule</strong> clé de ton coffre : il n&apos;en existe aucune
        copie, ici ou ailleurs. Sans lui, ton contenu est illisible pour tout le monde - on ne peut donc pas te
        le rendre, seulement repartir de zéro.
      </p>
      {impact.perdus.length > 0 && (
        <div className="text-body text-err-700">
          <div className="font-medium">Définitivement perdu :</div>
          <ul className="list-disc pl-4">
            {impact.perdus.map((c) => (
              <li key={c.id}>{c.nom}</li>
            ))}
          </ul>
        </div>
      )}
      {impact.aReoctroyer.length > 0 && (
        <div className="text-body text-ink-2">
          <div className="font-medium">Accès coupé, à te redonner par un administrateur :</div>
          <ul className="list-disc pl-4">
            {impact.aReoctroyer.map((c) => (
              <li key={c.id}>{c.nom}</li>
            ))}
          </ul>
          <p className="text-meta text-ink-3 mt-1">
            Si tu es le seul membre d&apos;un de ces coffres partagés, son contenu est perdu lui aussi.
          </p>
        </div>
      )}
      <p className="text-body text-ink-2">Ta passkey (Windows Hello) sera à réactiver ensuite.</p>
      <div className="flex flex-col gap-2">
        <input
          type="password"
          autoComplete="new-password"
          className={champClasse}
          placeholder="Nouveau mot de passe maître"
          value={mdp}
          onChange={(e) => {
            setMdp(e.target.value);
            setGenere(null);
          }}
        />
        <BarreForce mdp={mdp} />
        <input
          type="password"
          autoComplete="new-password"
          className={champClasse}
          placeholder="Confirmer"
          value={mdp2}
          onChange={(e) => setMdp2(e.target.value)}
        />
        <Button onClick={generer} variant="ghost" className="self-start">
          Générer un mot de passe robuste
        </Button>
        <BoiteMdpGenere mdp={genere} onCopie={() => toast.ok("Mot de passe copié.")} />
        <label className="flex items-start gap-2 text-body text-ink-2">
          <input
            type="checkbox"
            checked={compris}
            onChange={(e) => setCompris(e.target.checked)}
            className="mt-0.5"
          />
          <span>Je comprends que le contenu actuel de mon coffre sera définitivement perdu.</span>
        </label>
        <Button
          onClick={reinitialiser}
          disabled={busy || !compris}
          variant="destructive" size="lg"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" strokeWidth={2} />}
          Réinitialiser mon coffre
        </Button>
      </div>
      {erreur && <p className="text-body text-err-500">{erreur}</p>}
    </div>
  );
}
