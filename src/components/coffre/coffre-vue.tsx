"use client";

// Cockpit du coffre-fort (ADR-025). TOUTE la crypto se fait ici (navigateur) :
// enrolement, deverrouillage (mot de passe maitre ou passkey), chiffrement des
// secrets, et PARTAGE (enrobage de la cle d'un coffre vers la cle publique d'un
// membre). Le serveur ne recoit que des blobs chiffres.
//
// Ce fichier est l'orchestrateur : etat, appels crypto, composition. Les ecrans
// (verrouille, filtres, panneau de coffre, changement de mot de passe, partage,
// administration) ont chacun leur fichier dans ce dossier.

import { useState } from "react";
import { KeyRound, Lock, Fingerprint } from "lucide-react";
import {
  enrolerMotDePasse,
  deverrouillerMotDePasse,
  activerPasskey,
  deverrouillerPasskey,
  creerCleCoffrePour,
  ouvrirCleCoffre,
  dechiffrerSecret,
} from "@/lib/coffre/coffre-client";
import {
  enrolerAction,
  chargerSecretsAction,
  ajouterPasskeyAction,
  creerCoffrePartageAction,
} from "@/app/coffre/actions";
import type { ApercuCoffre } from "@/lib/services/coffre/coffre-service";
import { evaluerForceMotDePasse, estRenseigne, secretCorrespond } from "@/lib/domain/coffre";
import type {
  SecretClair,
  CollaborateurAnnuaire,
  ServiceOrg,
  Deverrouillage,
} from "@/lib/domain/coffre";
import { Button } from "@/components/ui/button";
import { EcranVerrouille } from "./ecran-verrouille";
import { BarreFiltres } from "./barre-filtres";
import { CoffrePanel } from "./coffre-panel";
import { PanneauChangementMdp } from "./panneau-changement-mdp";
import { CreerPartage } from "./creer-partage";
import { AdminPanel } from "./admin-panel";
import { genererMotDePasseFort, type CoffreOuvert } from "./coffre.utils";

export function CoffreVue({
  nomComplet,
  apercu,
  annuaire,
  services,
}: {
  nomComplet: string;
  apercu: ApercuCoffre;
  annuaire: CollaborateurAnnuaire[];
  services: ServiceOrg[];
}) {
  const dejaEnrole = apercu.collaborateur !== null;
  const monUserId = apercu.collaborateur?.id ?? "";
  const suisAdmin = apercu.collaborateur?.estAdmin ?? false;
  const maClePublique = annuaire.find((a) => a.id === monUserId)?.publicKey ?? null;
  const passkeyDev = apercu.deverrouillages.find((d) => d.method === "passkey_prf") ?? null;

  const [prive, setPrive] = useState<CryptoKey | null>(null);
  const [coffres, setCoffres] = useState<CoffreOuvert[]>([]);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [passkeyActivee, setPasskeyActivee] = useState(passkeyDev !== null);
  const [info, setInfo] = useState<string | null>(null);
  const [recherche, setRecherche] = useState("");
  const [filtreCopro, setFiltreCopro] = useState("");
  const [filtreEntreprise, setFiltreEntreprise] = useState("");

  const [mdp, setMdp] = useState("");
  const [mdp2, setMdp2] = useState("");
  // La methode "mot de passe maitre" courante. En etat local (et pas lu depuis
  // `apercu` a chaque fois) : apres un changement, la ligne en base a change et
  // la copie rendue par le serveur est perimee - la reutiliser reviendrait a
  // valider encore l'ANCIEN mot de passe.
  const [devMdp, setDevMdp] = useState<Deverrouillage | null>(
    apercu.deverrouillages.find((d) => d.method === "master_password") ?? null,
  );
  const [changementOuvert, setChangementOuvert] = useState(false);
  // Mot de passe genere a reveler une fois (pour le copier / l'enregistrer dans Chrome).
  const [mdpRevele, setMdpRevele] = useState<string | null>(null);

  function genererMaitre() {
    const genere = genererMotDePasseFort();
    setMdp(genere);
    setMdp2(genere);
    setMdpRevele(genere);
    setErreur(null);
  }

  // --- Enrolement (1er acces) ---------------------------------------------
  async function enroler() {
    setErreur(null);
    // Refuse les mots de passe faibles (avant : seul "8 caracteres" -> "12345678" passait).
    const force = evaluerForceMotDePasse(mdp);
    if (!force.ok) return setErreur(force.raison ?? "Mot de passe trop faible.");
    if (mdp !== mdp2) return setErreur("Les deux mots de passe ne correspondent pas.");
    setBusy(true);
    try {
      const { donnees, privateKey, publicKey } = await enrolerMotDePasse(mdp);
      const { vaultKey, wrappedVaultKey } = await creerCleCoffrePour(publicKey);
      const { coffreId } = await enrolerAction({
        publicKey: donnees.publicKey,
        wrappedPrivateKey: donnees.wrappedPrivateKey,
        params: donnees.params,
        coffrePerso: { nom: "Mes mots de passe", wrappedVaultKey },
      });
      setPrive(privateKey);
      setCoffres([{ id: coffreId, nom: "Mes mots de passe", vaultKey, secrets: [], role: "admin", scope: "personal" }]);
      setMdp("");
      setMdp2("");
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // --- Deverrouillage ------------------------------------------------------
  async function chargerCoffres(privateKey: CryptoKey): Promise<void> {
    const ouverts: CoffreOuvert[] = [];
    for (const c of apercu.coffres) {
      const vaultKey = await ouvrirCleCoffre(privateKey, c.wrappedVaultKey);
      const chiffres = await chargerSecretsAction(c.id);
      const secrets = await Promise.all(
        chiffres.map(async (s) => ({ id: s.id, clair: await dechiffrerSecret(vaultKey, s.blob) })),
      );
      ouverts.push({ id: c.id, nom: c.nom, vaultKey, secrets, role: c.role, scope: c.scope });
    }
    setPrive(privateKey);
    setCoffres(ouverts);
  }

  async function deverrouiller() {
    setErreur(null);
    setBusy(true);
    try {
      if (!devMdp) throw new Error("Aucune methode de deverrouillage par mot de passe.");
      await chargerCoffres(await deverrouillerMotDePasse(mdp, devMdp));
      setMdp("");
    } catch {
      setErreur("Mot de passe incorrect.");
    } finally {
      setBusy(false);
    }
  }

  async function deverrouillerViaPasskey() {
    if (!passkeyDev) return;
    setErreur(null);
    setBusy(true);
    try {
      await chargerCoffres(await deverrouillerPasskey(passkeyDev));
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function activerPasskeyHandler() {
    if (prive === null || !apercu.collaborateur) return;
    setErreur(null);
    setInfo(null);
    setBusy(true);
    try {
      const { wrappedPrivateKey, params } = await activerPasskey(
        prive,
        apercu.collaborateur.id,
        apercu.collaborateur.email || nomComplet,
        nomComplet,
      );
      await ajouterPasskeyAction(wrappedPrivateKey, params);
      setPasskeyActivee(true);
      setInfo("C'est activé. La prochaine fois, tu ouvriras ton coffre avec Windows Hello, sans mot de passe.");
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // --- Creation d'un coffre partage ---------------------------------------
  async function creerPartage(scope: "network" | "service", nom: string, serviceId?: string) {
    setErreur(null);
    if (!maClePublique) return setErreur("Cle publique introuvable.");
    setBusy(true);
    try {
      const { vaultKey, wrappedVaultKey } = await creerCleCoffrePour(maClePublique);
      const { coffreId } = await creerCoffrePartageAction(scope, nom, wrappedVaultKey, serviceId);
      setCoffres((prev) => [...prev, { id: coffreId, nom, vaultKey, secrets: [], role: "admin", scope }]);
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function verrouiller() {
    setPrive(null);
    setCoffres([]);
    setInfo(null);
  }

  // --- Ecran verrouille ----------------------------------------------------
  if (prive === null) {
    return (
      <EcranVerrouille
        nomComplet={nomComplet}
        dejaEnrole={dejaEnrole}
        passkeyDev={passkeyDev}
        coffres={apercu.coffres}
        mdp={mdp}
        onMdp={setMdp}
        mdp2={mdp2}
        onMdp2={setMdp2}
        mdpRevele={mdpRevele}
        onEffacerMdpRevele={() => setMdpRevele(null)}
        busy={busy}
        erreur={erreur}
        onDeverrouiller={deverrouiller}
        onDeverrouillerPasskey={deverrouillerViaPasskey}
        onEnroler={enroler}
        onGenererMaitre={genererMaitre}
        onInfo={setInfo}
      />
    );
  }

  // --- Coffre deverrouille -------------------------------------------------

  // Valeurs distinctes pour les filtres (copropriete / entreprise), tous coffres.
  const distinct = (vals: (string | undefined)[]): string[] =>
    [...new Set(vals.filter(estRenseigne))].sort((a, b) => a.localeCompare(b));
  const coprosDispo = distinct(coffres.flatMap((c) => c.secrets.map((s) => s.clair.copropriete)));
  const entreprisesDispo = distinct(coffres.flatMap((c) => c.secrets.map((s) => s.clair.titre)));

  const filtreActif = recherche.trim() !== "" || filtreCopro !== "" || filtreEntreprise !== "";
  const filtre = (s: SecretClair): boolean =>
    secretCorrespond(s, recherche) &&
    (filtreCopro === "" || s.copropriete === filtreCopro) &&
    (filtreEntreprise === "" || s.titre === filtreEntreprise);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-green-700" strokeWidth={1.5} />
          <h1 className="text-title font-medium text-ink">Coffre-fort</h1>
        </div>
        <div className="flex items-center gap-1">
          {!passkeyActivee && (
            <Button
              onClick={activerPasskeyHandler}
              disabled={busy}
              variant="ghost"
            >
              <Fingerprint className="w-3.5 h-3.5" strokeWidth={1.5} /> Activer Windows Hello
            </Button>
          )}
          {devMdp && (
            <Button
              onClick={() => setChangementOuvert((v) => !v)}
              variant="secondary"
            >
              <KeyRound className="w-3.5 h-3.5" strokeWidth={1.5} /> Changer mon mot de passe maître
            </Button>
          )}
          <Button
            onClick={verrouiller}
            variant="secondary"
          >
            <Lock className="w-3.5 h-3.5" strokeWidth={1.5} /> Verrouiller
          </Button>
        </div>
      </div>
      {info && (
        <p className="text-body text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">{info}</p>
      )}
      {erreur && <p className="text-body text-err-500">{erreur}</p>}

      {changementOuvert && devMdp && (
        <PanneauChangementMdp
          dev={devMdp}
          onChange={(nouveau) => {
            setDevMdp(nouveau);
            setChangementOuvert(false);
          }}
          onFermer={() => setChangementOuvert(false)}
        />
      )}

      <BarreFiltres
        recherche={recherche}
        onRecherche={setRecherche}
        filtreCopro={filtreCopro}
        onFiltreCopro={setFiltreCopro}
        coprosDispo={coprosDispo}
        filtreEntreprise={filtreEntreprise}
        onFiltreEntreprise={setFiltreEntreprise}
        entreprisesDispo={entreprisesDispo}
        filtreActif={filtreActif}
        onReinitialiser={() => {
          setRecherche("");
          setFiltreCopro("");
          setFiltreEntreprise("");
        }}
      />

      {coffres
        .filter((c) => !filtreActif || c.secrets.some((s) => filtre(s.clair)))
        .map((c) => (
          <CoffrePanel
            key={c.id}
            coffre={c}
            monUserId={monUserId}
            suisAdmin={suisAdmin}
            annuaire={annuaire}
            filtre={filtre}
            filtreActif={filtreActif}
            onAjout={(secret) => setCoffres((prev) => prev.map((x) => (x.id === c.id ? secret : x)))}
            onErreur={setErreur}
          />
        ))}

      {suisAdmin && <CreerPartage services={services} busy={busy} onCreer={creerPartage} />}
      {suisAdmin && <AdminPanel annuaire={annuaire} monUserId={monUserId} onErreur={setErreur} />}
    </div>
  );
}
