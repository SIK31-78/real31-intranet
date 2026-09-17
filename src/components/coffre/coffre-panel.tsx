"use client";

import { useState } from "react";
import { Plus, Users, Upload, History } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import {
  enroberCoffrePour,
  chiffrerSecret,
  dechiffrerSecret,
  CRYPTO_VERSION,
} from "@/lib/coffre/coffre-client";
import {
  chargerSecretsAction,
  ajouterSecretAction,
  octroyerAccesAction,
  retirerAccesAction,
  listerMembresAction,
  modifierSecretAction,
  supprimerSecretAction,
  listerAuditAction,
  type MembreAffiche,
  type EntreeAuditAffichee,
} from "@/app/coffre/actions";
import { ImportPanel } from "@/components/coffre/import-panel";
import type { SecretClair, CollaborateurAnnuaire } from "@/lib/domain/coffre";
import { Button } from "@/components/ui/button";
import { MembresCoffre } from "./membres-coffre";
import { HistoriqueCoffre } from "./historique-coffre";
import { LigneSecret } from "./ligne-secret";
import { FormulaireSecret } from "./formulaire-secret";
import { LIBELLE_SCOPE, type CoffreOuvert, type SecretOuvert } from "./coffre.utils";

// --- Un coffre + ses secrets + (si partage et admin) ses membres -----------

export function CoffrePanel({
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
          <span className="text-body font-medium text-ink">{coffre.nom}</span>
          {partage && (
            <span className="text-meta uppercase tracking-wide text-ink-3 bg-surface-2 rounded-sm px-1.5 py-0.5">
              {LIBELLE_SCOPE[coffre.scope]}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {partage && suisAdmin && (
            <Button
              onClick={() => (gestion ? setGestion(false) : chargerMembres())}
              variant="ghost"
            >
              <Users className="w-3.5 h-3.5" strokeWidth={1.5} /> Membres
            </Button>
          )}
          <Button
            onClick={() => (historique ? setHistorique(false) : chargerAudit())}
            variant="ghost"
          >
            <History className="w-3.5 h-3.5" strokeWidth={1.5} /> Historique
          </Button>
          <span className="text-meta text-ink-3 font-mono">
            {filtreActif ? `${secretsAffiches.length}/${coffre.secrets.length}` : `${coffre.secrets.length} secret(s)`}
          </span>
        </div>
      </div>

      {gestion && partage && suisAdmin && (
        <MembresCoffre
          membres={membres}
          candidats={candidats}
          monUserId={monUserId}
          busy={busy}
          onRetirer={retirer}
          onOctroyer={octroyer}
        />
      )}

      {historique && <HistoriqueCoffre entrees={entrees} />}

      {coffre.secrets.length === 0 && !ajout && (
        <p className="px-4 py-6 text-body text-ink-3 text-center">Aucun mot de passe pour l&apos;instant.</p>
      )}

      {filtreActif && secretsAffiches.length === 0 && coffre.secrets.length > 0 && (
        <p className="px-4 py-4 text-body text-ink-3 text-center">Aucun resultat dans ce coffre.</p>
      )}

      <ul className="divide-y divide-line">
        {secretsAffiches.map((s) => (
          <LigneSecret
            key={s.id}
            s={s}
            revele={reveles.has(s.id)}
            busy={busy}
            onBasculer={() => basculer(s.id)}
            onEditer={() => ouvrirEdition(s)}
            onSupprimer={() => supprimer(s)}
          />
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
        <FormulaireSecret
          edition={editId !== null}
          form={form}
          onForm={setForm}
          busy={busy}
          onEnregistrer={enregistrer}
          onAnnuler={() => {
            setAjout(false);
            setEditId(null);
          }}
        />
      ) : (
        <div className="flex border-t border-line text-body">
          <Button
            onClick={ouvrirAjout}
            variant="ghost" size="lg" className="flex-1"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={2} /> Ajouter un mot de passe
          </Button>
          <Button
            onClick={() => setImporter(true)}
            variant="secondary" size="lg"
          >
            <Upload className="w-3.5 h-3.5" strokeWidth={1.5} /> Importer (CSV)
          </Button>
        </div>
      )}
    </div>
  );
}
