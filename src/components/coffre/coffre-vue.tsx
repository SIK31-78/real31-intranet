"use client";

// Cockpit du coffre-fort (ADR-025). TOUTE la crypto se fait ici (navigateur) :
// enrolement, deverrouillage (mot de passe maitre ou passkey), chiffrement des
// secrets, et PARTAGE (enrobage de la cle d'un coffre vers la cle publique d'un
// membre). Le serveur ne recoit que des blobs chiffres.

import { useState, type ReactNode, type ComponentType } from "react";
import { KeyRound, Lock, Plus, Eye, EyeOff, Copy, Loader2, Fingerprint, Users, Network, X, Upload, Pencil, Trash2, History, Shield, Search, RotateCcw, AlertTriangle } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import {
  enrolerMotDePasse,
  deverrouillerMotDePasse,
  activerPasskey,
  deverrouillerPasskey,
  creerCleCoffrePour,
  enroberCoffrePour,
  ouvrirCleCoffre,
  chiffrerSecret,
  dechiffrerSecret,
  rewrapperMotDePasse,
  CRYPTO_VERSION,
} from "@/lib/coffre/coffre-client";
import {
  enrolerAction,
  changerMotDePasseMaitreAction,
  reinitialiserCoffreAction,
  chargerSecretsAction,
  ajouterSecretAction,
  ajouterPasskeyAction,
  creerCoffrePartageAction,
  octroyerAccesAction,
  retirerAccesAction,
  listerMembresAction,
  modifierSecretAction,
  supprimerSecretAction,
  listerAuditAction,
  definirAdminAction,
  type MembreAffiche,
  type EntreeAuditAffichee,
} from "@/app/coffre/actions";
import { ImportPanel } from "@/components/coffre/import-panel";
import type { ApercuCoffre } from "@/lib/services/coffre/coffre-service";
import {
  evaluerForceMotDePasse,
  validerNouveauMotDePasseMaitre,
  impactReinitialisation,
  type NiveauForce,
} from "@/lib/domain/coffre";
import type {
  SecretClair,
  RoleMembre,
  ScopeCoffre,
  CollaborateurAnnuaire,
  ServiceOrg,
  Coffre,
  Deverrouillage,
} from "@/lib/domain/coffre";

// Genere un mot de passe maitre robuste (alphabet sans caracteres ambigus : pas de
// l/I/1/O/0). 20 caracteres tires de crypto.getRandomValues -> 4 classes, "fort".
function genererMotDePasseFort(longueur = 20): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*?-_=+";
  const arr = new Uint32Array(longueur);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => alphabet[n % alphabet.length]).join("");
}

const FORCE_STYLE: Record<NiveauForce, { libelle: string; barre: string; texte: string; pct: string }> = {
  faible: { libelle: "Faible", barre: "bg-err-500", texte: "text-err-700", pct: "w-1/3" },
  moyen: { libelle: "Moyen", barre: "bg-warn-500", texte: "text-warn-700", pct: "w-2/3" },
  fort: { libelle: "Fort", barre: "bg-ok-500", texte: "text-ok-700", pct: "w-full" },
};

interface SecretOuvert {
  id: string;
  clair: SecretClair;
}
interface CoffreOuvert {
  id: string;
  nom: string;
  vaultKey: CryptoKey;
  secrets: SecretOuvert[];
  role: RoleMembre;
  scope: ScopeCoffre;
}

const champClasse =
  "w-full h-9 px-3 rounded-md border border-line bg-surface text-[13px] text-ink placeholder:text-ink-4 focus:outline-none focus:ring-1 focus:ring-green-600";

const LIBELLE_SCOPE: Record<ScopeCoffre, string> = {
  network: "Reseau",
  service: "Service",
  agency: "Agence",
  personal: "Personnel",
};

const LIBELLE_ACTION: Record<string, string> = {
  create: "Ajout",
  update: "Modification",
  delete: "Suppression",
  import: "Import",
};

// Une valeur "renseignee" : non vide et pas un placeholder "-" / "--".
function estRenseigne(v?: string): v is string {
  return !!v && !/^-+$/.test(v.trim());
}

// Recherche : tous les termes (separes par espace) doivent apparaitre dans l'un
// des champs du secret (titre, entreprise via titre, copro, immeuble, login, url, notes).
function correspond(s: SecretClair, q: string): boolean {
  const foin = [s.titre, s.copropriete, s.immeuble, s.login, s.url, s.notes]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((t) => foin.includes(t));
}

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
      <Cadre>
        <div className="flex items-center gap-2 mb-1">
          <KeyRound className="w-5 h-5 text-green-700" strokeWidth={1.5} />
          <h1 className="text-[17px] font-medium text-ink">Coffre-fort</h1>
        </div>
        {dejaEnrole ? (
          <>
            <p className="text-[13px] text-ink-3 mb-4">
              Bonjour {nomComplet}.{" "}
              {passkeyDev
                ? "Ouvre ton coffre avec Windows Hello (empreinte ou code PIN), ou avec ton mot de passe maître."
                : "Saisis ton mot de passe maître pour ouvrir ton coffre."}
            </p>
            <div className="flex flex-col gap-2 max-w-xs">
              {passkeyDev && (
                <>
                  <Bouton
                    onClick={deverrouillerViaPasskey}
                    busy={busy}
                    label="Ouvrir avec Windows Hello"
                    icone={Fingerprint}
                  />
                  <div className="text-[11px] text-ink-4 text-center my-0.5">ou avec ton mot de passe maître</div>
                </>
              )}
              <input
                type="password"
                className={champClasse}
                placeholder="Mot de passe maître"
                value={mdp}
                onChange={(e) => setMdp(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !busy && deverrouiller()}
                autoFocus={!passkeyDev}
              />
              <Bouton onClick={deverrouiller} busy={busy} label="Ouvrir le coffre" icone={Lock} />
            </div>
            <PanneauReinitialisation coffres={apercu.coffres} />
          </>
        ) : (
          <>
            <p className="text-[13px] text-ink-3 mb-1">
              Première connexion : choisis un <strong>mot de passe maître</strong>. C&apos;est la clé de ton
              coffre, et il ne quitte jamais ton appareil.
            </p>
            <p className="text-[12px] text-warn-700 bg-warn-50 border border-warn-500/30 rounded-md px-3 py-2 mb-4 max-w-md">
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
                  setMdp(e.target.value);
                  setMdpRevele(null);
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
                onKeyDown={(e) => e.key === "Enter" && !busy && enroler()}
              />
              <button
                type="button"
                onClick={genererMaitre}
                className="self-start text-[12px] text-green-700 hover:underline"
              >
                Générer un mot de passe robuste
              </button>
              <BoiteMdpGenere mdp={mdpRevele} onCopie={() => setInfo("Mot de passe copié.")} />
              <Bouton onClick={enroler} busy={busy} label="Creer mon coffre" icone={KeyRound} />
            </div>
          </>
        )}
        {erreur && <p className="text-[12px] text-red-600 mt-3">{erreur}</p>}
      </Cadre>
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
    correspond(s, recherche) &&
    (filtreCopro === "" || s.copropriete === filtreCopro) &&
    (filtreEntreprise === "" || s.titre === filtreEntreprise);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-green-700" strokeWidth={1.5} />
          <h1 className="text-[17px] font-medium text-ink">Coffre-fort</h1>
        </div>
        <div className="flex items-center gap-1">
          {!passkeyActivee && (
            <button
              onClick={activerPasskeyHandler}
              disabled={busy}
              className="flex items-center gap-1.5 text-[12px] text-green-700 hover:bg-green-50 px-2 py-1 rounded-md disabled:opacity-60"
            >
              <Fingerprint className="w-3.5 h-3.5" strokeWidth={1.5} /> Activer Windows Hello
            </button>
          )}
          {devMdp && (
            <button
              onClick={() => setChangementOuvert((v) => !v)}
              className="flex items-center gap-1.5 text-[12px] text-ink-3 hover:text-ink px-2 py-1 rounded-md hover:bg-surface-2"
            >
              <KeyRound className="w-3.5 h-3.5" strokeWidth={1.5} /> Changer mon mot de passe maître
            </button>
          )}
          <button
            onClick={verrouiller}
            className="flex items-center gap-1.5 text-[12px] text-ink-3 hover:text-ink px-2 py-1 rounded-md hover:bg-surface-2"
          >
            <Lock className="w-3.5 h-3.5" strokeWidth={1.5} /> Verrouiller
          </button>
        </div>
      </div>
      {info && (
        <p className="text-[12px] text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">{info}</p>
      )}
      {erreur && <p className="text-[12px] text-red-600">{erreur}</p>}

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

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-4" strokeWidth={1.5} />
          <input
            type="text"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher (entreprise, identifiant, URL...)"
            className="w-full h-9 pl-8 pr-3 rounded-md border border-line bg-surface text-[13px] text-ink placeholder:text-ink-4 focus:outline-none focus:ring-1 focus:ring-green-600"
          />
        </div>
        {coprosDispo.length > 0 && (
          <select
            value={filtreCopro}
            onChange={(e) => setFiltreCopro(e.target.value)}
            className="h-9 px-2 rounded-md border border-line bg-surface text-[12.5px] text-ink focus:outline-none focus:ring-1 focus:ring-green-600"
          >
            <option value="">Toutes les coproprietes</option>
            {coprosDispo.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        )}
        {entreprisesDispo.length > 0 && (
          <select
            value={filtreEntreprise}
            onChange={(e) => setFiltreEntreprise(e.target.value)}
            className="h-9 px-2 rounded-md border border-line bg-surface text-[12.5px] text-ink focus:outline-none focus:ring-1 focus:ring-green-600"
          >
            <option value="">Toutes les entreprises</option>
            {entreprisesDispo.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        )}
        {filtreActif && (
          <button
            onClick={() => {
              setRecherche("");
              setFiltreCopro("");
              setFiltreEntreprise("");
            }}
            className="h-9 px-3 text-[12px] text-ink-3 hover:text-ink"
          >
            Reinitialiser
          </button>
        )}
      </div>

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

// --- Changer son mot de passe maitre (coffre deverrouille, ZERO perte) ------
//
// La cle privee ne bouge pas : on la deballe avec l'ANCIEN mot de passe (ce qui
// prouve du meme coup qu'on le connait), puis on la re-enrobe avec la cle
// derivee du nouveau. Les cles de coffre et les secrets ne sont pas touches -
// rien a rechiffrer, rien a perdre. Le serveur ne recoit que le blob re-enrobe.
//
// On EXIGE le mot de passe actuel : une session laissee ouverte ne doit pas
// suffire a changer la serrure et enfermer dehors le proprietaire du coffre.

function PanneauChangementMdp({
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
        <span className="text-[13px] font-medium text-ink">Changer mon mot de passe maître</span>
        <button onClick={onFermer} className="text-[12px] text-ink-3 hover:text-ink">
          Fermer
        </button>
      </div>
      <p className="text-[12px] text-ink-3">
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
        <button type="button" onClick={generer} className="self-start text-[12px] text-green-700 hover:underline">
          Générer un mot de passe robuste
        </button>
        <BoiteMdpGenere mdp={genere} onCopie={() => toast.ok("Mot de passe copié.")} />
        <Bouton onClick={valider} busy={busy} label="Changer le mot de passe" icone={KeyRound} />
      </div>
      <p className="text-[11.5px] text-ink-4">
        Tu ne te souviens plus de l&apos;actuel ? Verrouille le coffre : l&apos;écran d&apos;ouverture propose une
        réinitialisation (avec perte du contenu).
      </p>
      {erreur && <p className="text-[12px] text-red-600">{erreur}</p>}
    </div>
  );
}

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

function PanneauReinitialisation({ coffres }: { coffres: readonly Coffre[] }) {
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
      <button
        onClick={() => setOuvert(true)}
        className="self-start mt-4 text-[12px] text-ink-3 hover:text-ink underline underline-offset-2"
      >
        Mot de passe maître oublié ?
      </button>
    );
  }

  return (
    <div className="mt-4 max-w-md rounded-lg border border-err-500/40 bg-err-50 px-4 py-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-err-700 flex items-center gap-1.5">
          <AlertTriangle className="w-4 h-4" strokeWidth={1.5} /> Réinitialiser le coffre
        </span>
        <button onClick={() => setOuvert(false)} className="text-[12px] text-ink-3 hover:text-ink">
          Annuler
        </button>
      </div>
      <p className="text-[12px] text-ink-2">
        Ton mot de passe maître est la <strong>seule</strong> clé de ton coffre : il n&apos;en existe aucune
        copie, ici ou ailleurs. Sans lui, ton contenu est illisible pour tout le monde - on ne peut donc pas te
        le rendre, seulement repartir de zéro.
      </p>
      {impact.perdus.length > 0 && (
        <div className="text-[12px] text-err-700">
          <div className="font-medium">Définitivement perdu :</div>
          <ul className="list-disc pl-4">
            {impact.perdus.map((c) => (
              <li key={c.id}>{c.nom}</li>
            ))}
          </ul>
        </div>
      )}
      {impact.aReoctroyer.length > 0 && (
        <div className="text-[12px] text-ink-2">
          <div className="font-medium">Accès coupé, à te redonner par un administrateur :</div>
          <ul className="list-disc pl-4">
            {impact.aReoctroyer.map((c) => (
              <li key={c.id}>{c.nom}</li>
            ))}
          </ul>
          <p className="text-[11.5px] text-ink-4 mt-1">
            Si tu es le seul membre d&apos;un de ces coffres partagés, son contenu est perdu lui aussi.
          </p>
        </div>
      )}
      <p className="text-[12px] text-ink-2">Ta passkey (Windows Hello) sera à réactiver ensuite.</p>
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
        <button type="button" onClick={generer} className="self-start text-[12px] text-green-700 hover:underline">
          Générer un mot de passe robuste
        </button>
        <BoiteMdpGenere mdp={genere} onCopie={() => toast.ok("Mot de passe copié.")} />
        <label className="flex items-start gap-2 text-[12px] text-ink-2">
          <input
            type="checkbox"
            checked={compris}
            onChange={(e) => setCompris(e.target.checked)}
            className="mt-0.5"
          />
          <span>Je comprends que le contenu actuel de mon coffre sera définitivement perdu.</span>
        </label>
        <button
          onClick={reinitialiser}
          disabled={busy || !compris}
          className="flex items-center justify-center gap-1.5 h-9 px-4 rounded-md bg-err-500 text-white text-[13px] font-medium hover:opacity-90 disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" strokeWidth={2} />}
          Réinitialiser mon coffre
        </button>
      </div>
      {erreur && <p className="text-[12px] text-red-600">{erreur}</p>}
    </div>
  );
}

// --- Creation d'un coffre partage (reseau / service) -----------------------

function CreerPartage({
  services,
  busy,
  onCreer,
}: {
  services: ServiceOrg[];
  busy: boolean;
  onCreer: (scope: "network" | "service", nom: string, serviceId?: string) => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [nom, setNom] = useState("");
  const [cible, setCible] = useState("network");

  function creer() {
    const nomFinal = nom.trim() || (cible === "network" ? "Reseau" : services.find((s) => `service:${s.id}` === cible)?.nom || "Service");
    if (cible === "network") onCreer("network", nomFinal);
    else onCreer("service", nomFinal, cible.slice("service:".length));
    setNom("");
    setOuvert(false);
  }

  if (!ouvert) {
    return (
      <button
        onClick={() => setOuvert(true)}
        className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-[12.5px] text-green-700 hover:bg-green-50 border border-dashed border-line rounded-lg"
      >
        <Network className="w-3.5 h-3.5" strokeWidth={1.5} /> Creer un coffre partage
      </button>
    );
  }
  return (
    <div className="border border-line rounded-lg bg-surface px-4 py-3 flex flex-col gap-2">
      <div className="text-[13px] font-medium text-ink">Nouveau coffre partage</div>
      <div className="flex gap-2">
        <select className={champClasse} value={cible} onChange={(e) => setCible(e.target.value)}>
          <option value="network">Reseau (tous les collaborateurs)</option>
          {services.map((s) => (
            <option key={s.id} value={`service:${s.id}`}>
              Service - {s.nom}
            </option>
          ))}
        </select>
        <input className={champClasse} placeholder="Nom (optionnel)" value={nom} onChange={(e) => setNom(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <Bouton onClick={creer} busy={busy} label="Creer" icone={Plus} />
        <button onClick={() => setOuvert(false)} className="text-[12px] text-ink-3 hover:text-ink px-3">
          Annuler
        </button>
      </div>
    </div>
  );
}

// --- Administration : gouvernance des roles (admins globaux) ---------------

function AdminPanel({
  annuaire,
  monUserId,
  onErreur,
}: {
  annuaire: CollaborateurAnnuaire[];
  monUserId: string;
  onErreur: (e: string | null) => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [liste, setListe] = useState(annuaire);
  const [busy, setBusy] = useState(false);

  async function basculer(a: CollaborateurAnnuaire) {
    onErreur(null);
    setBusy(true);
    try {
      await definirAdminAction(a.id, !a.estAdmin);
      setListe((prev) => prev.map((x) => (x.id === a.id ? { ...x, estAdmin: !a.estAdmin } : x)));
    } catch (e) {
      onErreur((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!ouvert) {
    return (
      <button
        onClick={() => setOuvert(true)}
        className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-[12.5px] text-ink-3 hover:text-ink border border-dashed border-line rounded-lg"
      >
        <Shield className="w-3.5 h-3.5" strokeWidth={1.5} /> Administration
      </button>
    );
  }
  return (
    <div className="border border-line rounded-lg bg-surface">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-line">
        <span className="text-[13px] font-medium text-ink flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-green-700" strokeWidth={1.5} /> Administration - roles
        </span>
        <button onClick={() => setOuvert(false)} className="text-[12px] text-ink-3 hover:text-ink">
          Fermer
        </button>
      </div>
      <ul className="divide-y divide-line">
        {liste.map((a) => (
          <li key={a.id} className="px-4 py-2 flex items-center justify-between text-[12.5px]">
            <span className="text-ink">
              {a.nomComplet || a.email}
              {a.estAdmin && (
                <span className="ml-1.5 text-[10.5px] uppercase tracking-wide text-green-700 bg-green-50 rounded px-1.5 py-0.5">
                  admin
                </span>
              )}
            </span>
            <button
              onClick={() => basculer(a)}
              disabled={busy || (a.id === monUserId && a.estAdmin)}
              className="text-[11.5px] text-ink-3 hover:text-ink disabled:opacity-40"
            >
              {a.estAdmin ? "Retirer admin" : "Promouvoir admin"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- Un coffre + ses secrets + (si partage et admin) ses membres -----------

function CoffrePanel({
  coffre,
  monUserId,
  suisAdmin,
  annuaire,
  filtre,
  filtreActif,
  onAjout,
  onErreur,
}: {
  coffre: CoffreOuvert;
  monUserId: string;
  suisAdmin: boolean;
  annuaire: CollaborateurAnnuaire[];
  filtre: (s: SecretClair) => boolean;
  filtreActif: boolean;
  onAjout: (c: CoffreOuvert) => void;
  onErreur: (e: string | null) => void;
}) {
  const confirmer = useConfirm();
  const toast = useToast();
  const [reveles, setReveles] = useState<Set<string>>(new Set());
  const [ajout, setAjout] = useState(false);
  const [importer, setImporter] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<SecretClair>({ titre: "", url: "", login: "", motDePasse: "", notes: "" });

  // Recharge et redechiffre les secrets du coffre (apres un import).
  async function rechargerSecrets() {
    const chiffres = await chargerSecretsAction(coffre.id);
    const secrets = await Promise.all(
      chiffres.map(async (s) => ({ id: s.id, clair: await dechiffrerSecret(coffre.vaultKey, s.blob) })),
    );
    onAjout({ ...coffre, secrets });
  }

  const partage = coffre.scope !== "personal";
  const secretsAffiches = filtreActif ? coffre.secrets.filter((s) => filtre(s.clair)) : coffre.secrets;

  // --- membres (coffres partages, admin) ---
  const [gestion, setGestion] = useState(false);
  const [membres, setMembres] = useState<MembreAffiche[] | null>(null);

  // --- edition + historique ---
  const [editId, setEditId] = useState<string | null>(null);
  const [historique, setHistorique] = useState(false);
  const [entrees, setEntrees] = useState<EntreeAuditAffichee[] | null>(null);

  const formVide: SecretClair = { titre: "", url: "", login: "", motDePasse: "", notes: "" };

  function basculer(id: string) {
    setReveles((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function ouvrirAjout() {
    setEditId(null);
    setForm(formVide);
    setAjout(true);
  }

  function ouvrirEdition(s: SecretOuvert) {
    setEditId(s.id);
    setForm({ ...formVide, ...s.clair });
    setAjout(true);
  }

  async function enregistrer() {
    onErreur(null);
    if (!form.titre.trim() || !form.motDePasse) return onErreur("Titre et mot de passe sont requis.");
    setBusy(true);
    try {
      const blob = await chiffrerSecret(coffre.vaultKey, form);
      if (editId) {
        await modifierSecretAction(coffre.id, editId, blob, CRYPTO_VERSION);
        onAjout({ ...coffre, secrets: coffre.secrets.map((x) => (x.id === editId ? { id: editId, clair: form } : x)) });
      } else {
        const { id } = await ajouterSecretAction(coffre.id, blob, CRYPTO_VERSION);
        onAjout({ ...coffre, secrets: [...coffre.secrets, { id, clair: form }] });
      }
      toast.ok(editId ? "Mot de passe modifié." : "Mot de passe ajouté.");
      setForm(formVide);
      setEditId(null);
      setAjout(false);
    } catch (e) {
      onErreur((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function supprimer(s: SecretOuvert) {
    const ok = await confirmer({
      titre: "Supprimer ce mot de passe ?",
      message: `"${s.clair.titre}" sera définitivement supprimé.`,
      confirmer: "Supprimer",
      danger: true,
    });
    if (!ok) return;
    onErreur(null);
    setBusy(true);
    try {
      await supprimerSecretAction(coffre.id, s.id);
      onAjout({ ...coffre, secrets: coffre.secrets.filter((x) => x.id !== s.id) });
      toast.ok("Mot de passe supprimé.");
    } catch (e) {
      onErreur((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function chargerAudit() {
    setHistorique(true);
    try {
      setEntrees(await listerAuditAction(coffre.id));
    } catch (e) {
      onErreur((e as Error).message);
    }
  }

  async function chargerMembres() {
    setGestion(true);
    try {
      setMembres(await listerMembresAction(coffre.id));
    } catch (e) {
      onErreur((e as Error).message);
    }
  }

  async function octroyer(membre: CollaborateurAnnuaire) {
    onErreur(null);
    setBusy(true);
    try {
      const wrapped = await enroberCoffrePour(coffre.vaultKey, membre.publicKey);
      await octroyerAccesAction(coffre.id, membre.id, wrapped);
      setMembres(await listerMembresAction(coffre.id));
    } catch (e) {
      onErreur((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function retirer(userId: string) {
    onErreur(null);
    setBusy(true);
    try {
      await retirerAccesAction(coffre.id, userId);
      setMembres(await listerMembresAction(coffre.id));
    } catch (e) {
      onErreur((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const candidats = annuaire.filter(
    (a) => a.id !== monUserId && !(membres ?? []).some((m) => m.userId === a.id),
  );

  return (
    <div className="border border-line rounded-lg bg-surface">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-line">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-ink">{coffre.nom}</span>
          {partage && (
            <span className="text-[10.5px] uppercase tracking-wide text-ink-3 bg-surface-2 rounded px-1.5 py-0.5">
              {LIBELLE_SCOPE[coffre.scope]}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {partage && suisAdmin && (
            <button
              onClick={() => (gestion ? setGestion(false) : chargerMembres())}
              className="flex items-center gap-1 text-[11.5px] text-ink-3 hover:text-ink"
            >
              <Users className="w-3.5 h-3.5" strokeWidth={1.5} /> Membres
            </button>
          )}
          <button
            onClick={() => (historique ? setHistorique(false) : chargerAudit())}
            className="flex items-center gap-1 text-[11.5px] text-ink-3 hover:text-ink"
          >
            <History className="w-3.5 h-3.5" strokeWidth={1.5} /> Historique
          </button>
          <span className="text-[11px] text-ink-4 font-mono">
            {filtreActif ? `${secretsAffiches.length}/${coffre.secrets.length}` : `${coffre.secrets.length} secret(s)`}
          </span>
        </div>
      </div>

      {gestion && partage && suisAdmin && (
        <div className="px-4 py-3 border-b border-line bg-surface-2/40 flex flex-col gap-2">
          <div className="text-[12px] font-medium text-ink-2">Membres</div>
          {membres === null ? (
            <div className="text-[12px] text-ink-3">Chargement...</div>
          ) : (
            <ul className="flex flex-col gap-1">
              {membres.map((m) => (
                <li key={m.userId} className="flex items-center justify-between text-[12.5px]">
                  <span className="text-ink">
                    {m.nom} {m.role === "admin" && <span className="text-ink-4">(admin)</span>}
                  </span>
                  {m.userId !== monUserId && (
                    <button onClick={() => retirer(m.userId)} disabled={busy} className="text-red-600 hover:text-red-700 p-0.5" title="Retirer">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {candidats.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {candidats.map((a) => (
                <button
                  key={a.id}
                  onClick={() => octroyer(a)}
                  disabled={busy}
                  className="flex items-center gap-1 text-[11.5px] text-green-700 border border-green-200 hover:bg-green-50 rounded-full px-2 py-0.5 disabled:opacity-60"
                >
                  <Plus className="w-3 h-3" strokeWidth={2} /> {a.nomComplet || a.email}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {historique && (
        <div className="px-4 py-3 border-b border-line bg-surface-2/40 flex flex-col gap-1.5">
          <div className="text-[12px] font-medium text-ink-2">Historique</div>
          {entrees === null ? (
            <div className="text-[12px] text-ink-3">Chargement...</div>
          ) : entrees.length === 0 ? (
            <div className="text-[12px] text-ink-3">Aucune action enregistree.</div>
          ) : (
            <ul className="flex flex-col gap-0.5 max-h-48 overflow-auto">
              {entrees.map((e) => (
                <li key={e.id} className="text-[12px] text-ink-3 flex gap-2">
                  <span className="text-ink">{LIBELLE_ACTION[e.action] ?? e.action}</span>
                  {e.action === "import" && typeof e.details?.count === "number" && <span>({e.details.count})</span>}
                  <span>par {e.nom}</span>
                  <span className="text-ink-4 ml-auto whitespace-nowrap">{new Date(e.createdAt).toLocaleString("fr-FR")}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {coffre.secrets.length === 0 && !ajout && (
        <p className="px-4 py-6 text-[12.5px] text-ink-3 text-center">Aucun mot de passe pour l&apos;instant.</p>
      )}

      {filtreActif && secretsAffiches.length === 0 && coffre.secrets.length > 0 && (
        <p className="px-4 py-4 text-[12.5px] text-ink-4 text-center">Aucun resultat dans ce coffre.</p>
      )}

      <ul className="divide-y divide-line">
        {secretsAffiches.map((s) => (
          <li key={s.id} className="px-4 py-2.5 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[13px] text-ink truncate">
                {s.clair.titre}
                {[s.clair.copropriete, s.clair.immeuble].some(estRenseigne) && (
                  <span className="text-ink-3 font-normal">
                    {" "}
                    - {[s.clair.copropriete, s.clair.immeuble].filter(estRenseigne).join(" - ")}
                  </span>
                )}
              </div>
              <div className="text-[11.5px] text-ink-3 truncate">
                {[s.clair.login, s.clair.url].filter(estRenseigne).join(" - ")}
              </div>
            </div>
            <code className="text-[12px] text-ink-2 font-mono">
              {reveles.has(s.id) ? s.clair.motDePasse : "........"}
            </code>
            <button onClick={() => basculer(s.id)} className="text-ink-3 hover:text-ink p-1" title="Afficher/masquer">
              {reveles.has(s.id) ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={() => navigator.clipboard?.writeText(s.clair.motDePasse)}
              className="text-ink-3 hover:text-ink p-1"
              title="Copier"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => ouvrirEdition(s)} className="text-ink-3 hover:text-ink p-1" title="Modifier">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => supprimer(s)} disabled={busy} className="text-ink-3 hover:text-red-600 p-1" title="Supprimer">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </li>
        ))}
      </ul>

      {importer ? (
        <ImportPanel
          coffreId={coffre.id}
          vaultKey={coffre.vaultKey}
          secretsExistants={coffre.secrets.map((s) => s.clair)}
          onTermine={rechargerSecrets}
          onErreur={onErreur}
        />
      ) : ajout ? (
        <div className="px-4 py-3 border-t border-line flex flex-col gap-2">
          <div className="text-[12px] font-medium text-ink-2">{editId ? "Modifier le mot de passe" : "Nouveau mot de passe"}</div>
          <input className={champClasse} placeholder="Titre (ex: EDF)" value={form.titre} onChange={(e) => setForm({ ...form, titre: e.target.value })} autoFocus />
          <div className="flex gap-2">
            <input className={champClasse} placeholder="Copropriete" value={form.copropriete ?? ""} onChange={(e) => setForm({ ...form, copropriete: e.target.value })} />
            <input className={champClasse} placeholder="Immeuble" value={form.immeuble ?? ""} onChange={(e) => setForm({ ...form, immeuble: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <input className={champClasse} placeholder="URL" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
            <input className={champClasse} placeholder="Identifiant" value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} />
          </div>
          <input className={champClasse} placeholder="Mot de passe" value={form.motDePasse} onChange={(e) => setForm({ ...form, motDePasse: e.target.value })} />
          <div className="flex gap-2">
            <Bouton onClick={enregistrer} busy={busy} label="Enregistrer" icone={Plus} />
            <button
              onClick={() => {
                setAjout(false);
                setEditId(null);
              }}
              className="text-[12px] text-ink-3 hover:text-ink px-3"
            >
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <div className="flex border-t border-line text-[12.5px]">
          <button
            onClick={ouvrirAjout}
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-green-700 hover:bg-green-50"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={2} /> Ajouter un mot de passe
          </button>
          <button
            onClick={() => setImporter(true)}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-ink-3 hover:text-ink border-l border-line"
          >
            <Upload className="w-3.5 h-3.5" strokeWidth={1.5} /> Importer (CSV)
          </button>
        </div>
      )}
    </div>
  );
}

// --- petits composants ------------------------------------------------------

/** Jauge de force du mot de passe MAITRE (rien tant que le champ est vide). */
function BarreForce({ mdp }: { mdp: string }) {
  if (mdp.length === 0) return null;
  const f = evaluerForceMotDePasse(mdp);
  const st = FORCE_STYLE[f.niveau];
  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-[11px] mb-1">
        <span className={st.texte}>Force : {st.libelle}</span>
        {!f.ok && f.raison && <span className="text-ink-4 text-right">{f.raison}</span>}
      </div>
      <div className="h-1 rounded-full bg-surface-2 overflow-hidden">
        <div className={`h-full transition-all ${st.barre} ${st.pct}`} />
      </div>
    </div>
  );
}

/** Mot de passe genere, revele UNE fois pour etre copie. Il ne quitte jamais
 *  cette page : ni log, ni requete, ni stockage. */
function BoiteMdpGenere({ mdp, onCopie }: { mdp: string | null; onCopie: () => void }) {
  if (!mdp) return null;
  return (
    <div className="rounded-md border border-ok-500/30 bg-ok-50 px-3 py-2">
      <div className="text-[12px] font-medium text-ok-700 mb-1">Mot de passe généré - copie-le maintenant</div>
      <div className="flex items-center gap-2">
        <code className="flex-1 font-mono text-[13px] text-ink break-all select-all">{mdp}</code>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(mdp);
            onCopie();
          }}
          aria-label="Copier"
          className="shrink-0 p-1 text-ink-3 hover:text-ink"
        >
          <Copy className="w-3.5 h-3.5" />
        </button>
      </div>
      <p className="mt-1 text-[11px] text-ink-4">
        Garde-le dans ton gestionnaire (Chrome te proposera de l&apos;enregistrer). Personne ne peut le
        récupérer à ta place.
      </p>
    </div>
  );
}

function Cadre({ children }: { children: ReactNode }) {
  return <div className="border border-line rounded-lg bg-surface px-6 py-6">{children}</div>;
}

function Bouton({
  onClick,
  busy,
  label,
  icone: Icone,
}: {
  onClick: () => void;
  busy: boolean;
  label: string;
  icone: ComponentType<{ className?: string; strokeWidth?: number }>;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="flex items-center justify-center gap-1.5 h-9 px-4 rounded-md bg-green-700 text-white text-[13px] font-medium hover:bg-green-600 disabled:opacity-60"
    >
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icone className="w-4 h-4" strokeWidth={2} />}
      {label}
    </button>
  );
}
