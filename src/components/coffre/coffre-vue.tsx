"use client";

// Cockpit du coffre-fort (ADR-025). TOUTE la crypto se fait ici (navigateur) :
// l'enrolement genere la paire et wrappe la cle privee avec le mot de passe
// maitre ; le deverrouillage la deballe ; les secrets sont chiffres/dechiffres
// avec la cle du coffre. Le serveur ne recoit que des blobs chiffres.

import { useState, type ReactNode, type ComponentType } from "react";
import { KeyRound, Lock, Plus, Eye, EyeOff, Copy, Loader2, Fingerprint } from "lucide-react";
import {
  enrolerMotDePasse,
  deverrouillerMotDePasse,
  activerPasskey,
  deverrouillerPasskey,
  creerCleCoffrePour,
  ouvrirCleCoffre,
  chiffrerSecret,
  dechiffrerSecret,
  CRYPTO_VERSION,
} from "@/lib/coffre/coffre-client";
import { enrolerAction, chargerSecretsAction, ajouterSecretAction, ajouterPasskeyAction } from "@/app/coffre/actions";
import type { ApercuCoffre } from "@/lib/services/coffre/coffre-service";
import type { SecretClair } from "@/lib/domain/coffre";

interface SecretOuvert {
  id: string;
  clair: SecretClair;
}
interface CoffreOuvert {
  id: string;
  nom: string;
  vaultKey: CryptoKey;
  secrets: SecretOuvert[];
}

const champClasse =
  "w-full h-9 px-3 rounded-md border border-line bg-surface text-[13px] text-ink placeholder:text-ink-4 focus:outline-none focus:ring-1 focus:ring-green-600";

export function CoffreVue({ nomComplet, apercu }: { nomComplet: string; apercu: ApercuCoffre }) {
  const dejaEnrole = apercu.collaborateur !== null;
  const passkeyDev = apercu.deverrouillages.find((d) => d.method === "passkey_prf") ?? null;
  const [prive, setPrive] = useState<CryptoKey | null>(null);
  const [coffres, setCoffres] = useState<CoffreOuvert[]>([]);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [passkeyActivee, setPasskeyActivee] = useState(passkeyDev !== null);
  const [info, setInfo] = useState<string | null>(null);

  // --- Enrolement (1er acces) ---------------------------------------------
  const [mdp, setMdp] = useState("");
  const [mdp2, setMdp2] = useState("");

  async function enroler() {
    setErreur(null);
    if (mdp.length < 8) return setErreur("Choisis un mot de passe maitre d'au moins 8 caracteres.");
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
      setCoffres([{ id: coffreId, nom: "Mes mots de passe", vaultKey, secrets: [] }]);
      setMdp("");
      setMdp2("");
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // --- Deverrouillage ------------------------------------------------------

  // Ouvre tous les coffres de l'utilisateur avec sa cle privee (commun mot de
  // passe / passkey) : derive la cle de chaque coffre et dechiffre ses secrets.
  async function chargerCoffres(privateKey: CryptoKey): Promise<void> {
    const ouverts: CoffreOuvert[] = [];
    for (const c of apercu.coffres) {
      const vaultKey = await ouvrirCleCoffre(privateKey, c.wrappedVaultKey);
      const chiffres = await chargerSecretsAction(c.id);
      const secrets = await Promise.all(
        chiffres.map(async (s) => ({ id: s.id, clair: await dechiffrerSecret(vaultKey, s.blob) })),
      );
      ouverts.push({ id: c.id, nom: c.nom, vaultKey, secrets });
    }
    setPrive(privateKey);
    setCoffres(ouverts);
  }

  async function deverrouiller() {
    setErreur(null);
    setBusy(true);
    try {
      const dev = apercu.deverrouillages.find((d) => d.method === "master_password");
      if (!dev) throw new Error("Aucune methode de deverrouillage par mot de passe.");
      await chargerCoffres(await deverrouillerMotDePasse(mdp, dev));
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

  // Active une passkey (Windows Hello...) pour cet utilisateur deja deverrouille.
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
      setInfo("Passkey activee. La prochaine fois, tu pourras deverrouiller sans mot de passe.");
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

  // --- Etats d'affichage ---------------------------------------------------

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
                ? "Deverrouille ton coffre avec ta passkey, ou ton mot de passe maitre."
                : "Saisis ton mot de passe maitre pour deverrouiller ton coffre."}
            </p>
            <div className="flex flex-col gap-2 max-w-xs">
              {passkeyDev && (
                <>
                  <Bouton
                    onClick={deverrouillerViaPasskey}
                    busy={busy}
                    label="Deverrouiller avec une passkey"
                    icone={Fingerprint}
                  />
                  <div className="text-[11px] text-ink-4 text-center my-0.5">ou mot de passe maitre</div>
                </>
              )}
              <input
                type="password"
                className={champClasse}
                placeholder="Mot de passe maitre"
                value={mdp}
                onChange={(e) => setMdp(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !busy && deverrouiller()}
                autoFocus={!passkeyDev}
              />
              <Bouton onClick={deverrouiller} busy={busy} label="Deverrouiller" icone={Lock} />
            </div>
          </>
        ) : (
          <>
            <p className="text-[13px] text-ink-3 mb-1">
              Premier acces : choisis un <strong>mot de passe maitre</strong>. Il chiffre ton coffre et
              n&apos;est jamais envoye au serveur.
            </p>
            <p className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-4 max-w-md">
              Si tu l&apos;oublies, ton coffre personnel est definitivement illisible (c&apos;est le principe du
              zero-knowledge). La recuperation par passkey / cle de secours arrive ensuite.
            </p>
            <div className="flex flex-col gap-2 max-w-xs">
              <input
                type="password"
                className={champClasse}
                placeholder="Mot de passe maitre"
                value={mdp}
                onChange={(e) => setMdp(e.target.value)}
              />
              <input
                type="password"
                className={champClasse}
                placeholder="Confirmer"
                value={mdp2}
                onChange={(e) => setMdp2(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !busy && enroler()}
              />
              <Bouton onClick={enroler} busy={busy} label="Creer mon coffre" icone={KeyRound} />
            </div>
          </>
        )}
        {erreur && <p className="text-[12px] text-red-600 mt-3">{erreur}</p>}
      </Cadre>
    );
  }

  // --- Coffre deverrouille -------------------------------------------------
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
              <Fingerprint className="w-3.5 h-3.5" strokeWidth={1.5} /> Activer une passkey
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
      {coffres.map((c) => (
        <CoffrePanel
          key={c.id}
          coffre={c}
          onAjout={(secret) => setCoffres((prev) => prev.map((x) => (x.id === c.id ? secret : x)))}
          onErreur={setErreur}
        />
      ))}
    </div>
  );
}

// --- Un coffre + ses secrets + ajout ---------------------------------------

function CoffrePanel({
  coffre,
  onAjout,
  onErreur,
}: {
  coffre: CoffreOuvert;
  onAjout: (c: CoffreOuvert) => void;
  onErreur: (e: string | null) => void;
}) {
  const [reveles, setReveles] = useState<Set<string>>(new Set());
  const [ajout, setAjout] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<SecretClair>({ titre: "", url: "", login: "", motDePasse: "", notes: "" });

  function basculer(id: string) {
    setReveles((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function ajouter() {
    onErreur(null);
    if (!form.titre.trim() || !form.motDePasse) return onErreur("Titre et mot de passe sont requis.");
    setBusy(true);
    try {
      const blob = await chiffrerSecret(coffre.vaultKey, form);
      const { id } = await ajouterSecretAction(coffre.id, blob, CRYPTO_VERSION);
      onAjout({ ...coffre, secrets: [...coffre.secrets, { id, clair: form }] });
      setForm({ titre: "", url: "", login: "", motDePasse: "", notes: "" });
      setAjout(false);
    } catch (e) {
      onErreur((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border border-line rounded-lg bg-surface">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-line">
        <span className="text-[13px] font-medium text-ink">{coffre.nom}</span>
        <span className="text-[11px] text-ink-4 font-mono">{coffre.secrets.length} secret(s)</span>
      </div>

      {coffre.secrets.length === 0 && !ajout && (
        <p className="px-4 py-6 text-[12.5px] text-ink-3 text-center">Aucun mot de passe pour l&apos;instant.</p>
      )}

      <ul className="divide-y divide-line">
        {coffre.secrets.map((s) => (
          <li key={s.id} className="px-4 py-2.5 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[13px] text-ink truncate">{s.clair.titre}</div>
              <div className="text-[11.5px] text-ink-3 truncate">
                {s.clair.login}
                {s.clair.url ? ` - ${s.clair.url}` : ""}
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
          </li>
        ))}
      </ul>

      {ajout ? (
        <div className="px-4 py-3 border-t border-line flex flex-col gap-2">
          <input className={champClasse} placeholder="Titre (ex: Logiciel Vente)" value={form.titre} onChange={(e) => setForm({ ...form, titre: e.target.value })} autoFocus />
          <div className="flex gap-2">
            <input className={champClasse} placeholder="URL" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
            <input className={champClasse} placeholder="Identifiant" value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} />
          </div>
          <input className={champClasse} placeholder="Mot de passe" value={form.motDePasse} onChange={(e) => setForm({ ...form, motDePasse: e.target.value })} />
          <div className="flex gap-2">
            <Bouton onClick={ajouter} busy={busy} label="Enregistrer" icone={Plus} />
            <button onClick={() => setAjout(false)} className="text-[12px] text-ink-3 hover:text-ink px-3">
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAjout(true)}
          className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 text-[12.5px] text-green-700 hover:bg-green-50 border-t border-line"
        >
          <Plus className="w-3.5 h-3.5" strokeWidth={2} /> Ajouter un mot de passe
        </button>
      )}
    </div>
  );
}

// --- petits composants ------------------------------------------------------

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
      className="flex items-center justify-center gap-1.5 h-9 px-4 rounded-md bg-green-700 text-white text-[13px] font-medium hover:bg-green-800 disabled:opacity-60"
    >
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icone className="w-4 h-4" strokeWidth={2} />}
      {label}
    </button>
  );
}
