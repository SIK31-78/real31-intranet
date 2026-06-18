"use client";

// Cockpit du coffre-fort (ADR-025). TOUTE la crypto se fait ici (navigateur) :
// enrolement, deverrouillage (mot de passe maitre ou passkey), chiffrement des
// secrets, et PARTAGE (enrobage de la cle d'un coffre vers la cle publique d'un
// membre). Le serveur ne recoit que des blobs chiffres.

import { useState, type ReactNode, type ComponentType } from "react";
import { KeyRound, Lock, Plus, Eye, EyeOff, Copy, Loader2, Fingerprint, Users, Network, X, Upload } from "lucide-react";
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
  CRYPTO_VERSION,
} from "@/lib/coffre/coffre-client";
import {
  enrolerAction,
  chargerSecretsAction,
  ajouterSecretAction,
  ajouterPasskeyAction,
  creerCoffrePartageAction,
  octroyerAccesAction,
  retirerAccesAction,
  listerMembresAction,
  type MembreAffiche,
} from "@/app/coffre/actions";
import { ImportPanel } from "@/components/coffre/import-panel";
import type { ApercuCoffre } from "@/lib/services/coffre/coffre-service";
import type { SecretClair, RoleMembre, ScopeCoffre, CollaborateurAnnuaire, ServiceOrg } from "@/lib/domain/coffre";

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
  const maClePublique = annuaire.find((a) => a.id === monUserId)?.publicKey ?? null;
  const passkeyDev = apercu.deverrouillages.find((d) => d.method === "passkey_prf") ?? null;

  const [prive, setPrive] = useState<CryptoKey | null>(null);
  const [coffres, setCoffres] = useState<CoffreOuvert[]>([]);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [passkeyActivee, setPasskeyActivee] = useState(passkeyDev !== null);
  const [info, setInfo] = useState<string | null>(null);

  const [mdp, setMdp] = useState("");
  const [mdp2, setMdp2] = useState("");

  // --- Enrolement (1er acces) ---------------------------------------------
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
          monUserId={monUserId}
          annuaire={annuaire}
          onAjout={(secret) => setCoffres((prev) => prev.map((x) => (x.id === c.id ? secret : x)))}
          onErreur={setErreur}
        />
      ))}

      <CreerPartage services={services} busy={busy} onCreer={creerPartage} />
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

// --- Un coffre + ses secrets + (si partage et admin) ses membres -----------

function CoffrePanel({
  coffre,
  monUserId,
  annuaire,
  onAjout,
  onErreur,
}: {
  coffre: CoffreOuvert;
  monUserId: string;
  annuaire: CollaborateurAnnuaire[];
  onAjout: (c: CoffreOuvert) => void;
  onErreur: (e: string | null) => void;
}) {
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
  const admin = coffre.role === "admin";

  // --- membres (coffres partages, admin) ---
  const [gestion, setGestion] = useState(false);
  const [membres, setMembres] = useState<MembreAffiche[] | null>(null);

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
          {partage && admin && (
            <button
              onClick={() => (gestion ? setGestion(false) : chargerMembres())}
              className="flex items-center gap-1 text-[11.5px] text-ink-3 hover:text-ink"
            >
              <Users className="w-3.5 h-3.5" strokeWidth={1.5} /> Membres
            </button>
          )}
          <span className="text-[11px] text-ink-4 font-mono">{coffre.secrets.length} secret(s)</span>
        </div>
      </div>

      {gestion && partage && admin && (
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
        <div className="flex border-t border-line text-[12.5px]">
          <button
            onClick={() => setAjout(true)}
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
