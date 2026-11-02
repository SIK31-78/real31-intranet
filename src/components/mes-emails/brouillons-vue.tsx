"use client";

// Vue « Brouillons » de l'écran E-mails (02/11/2026), sur le modèle des « Envoyés » : les 30
// brouillons les plus récents de MA boîte perso (ceux enregistrés depuis l'intranet comme ceux
// d'Outlook). Objet, destinataires, date, aperçu dans la liste ; le texte à l'ouverture. On
// peut l'envoyer tel quel (après confirmation), le finir dans Outlook, ou le mettre à la
// corbeille (« Éléments supprimés », réversible ; jamais de suppression définitive).
// Pas de boîte partagée : Graph ne dit pas qui a créé un brouillon dans une boîte commune.
// « Modifier » (02/11/2026, décision Sekou, option a) : le brouillon se rouvre dans une fenêtre
// d'écriture avec l'éditeur riche (modifier-brouillon), seulement quand cet éditeur est ouvert
// à la personne.
// 02/11/2026 (décision Sekou) : un brouillon dont la signature a été posée dans Outlook ne se
// rouvre pas dans l'éditeur (elle y perdrait sa mise en page) : « Modifier » laisse la place à
// « Finir dans Outlook », et le serveur refuse de toute façon (actions-brouillons).

import { useEffect, useState } from "react";
import { ExternalLink, FilePen, Paperclip, PenLine, Send, Trash2 } from "lucide-react";
import { Button, classesBouton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Callout } from "@/components/ui/callout";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import type { EchangeTrouve } from "@/lib/domain/echanges";
import {
  brouillonModifiableAction,
  chargerBrouillonsAction,
  envoyerBrouillonAction,
  lireBrouillonAction,
  supprimerBrouillonAction,
} from "@/app/mes-emails/actions-brouillons";
import { TexteAvecLiens } from "@/components/mes-emails/texte-avec-liens";
import { ModifierBrouillon } from "@/components/mes-emails/modifier-brouillon";

const dateHeure = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", {
    timeZone: "Europe/Paris",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

type Etat = { enCours: true } | { enCours: false; brouillons: EchangeTrouve[] } | { enCours: false; erreur: string };

export function BrouillonsVue({ boite, editeurRiche = false }: { boite: string; /** « Modifier » proposé : l'éditeur riche est ouvert à la personne. */ editeurRiche?: boolean }) {
  const [etat, setEtat] = useState<Etat>({ enCours: true });
  const [choisiId, setChoisiId] = useState<string | null>(null);
  // Relire la liste après un brouillon modifié (objet, destinataires changés).
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let actif = true;
    void chargerBrouillonsAction({ boite }).then((r) => {
      if (!actif) return;
      setEtat(r.ok ? { enCours: false, brouillons: r.donnees ?? [] } : { enCours: false, erreur: r.erreur });
    });
    return () => {
      actif = false;
    };
  }, [boite, version]);

  if (etat.enCours) return <p className="text-body text-ink-3">Chargement des brouillons…</p>;
  if ("erreur" in etat) return <Callout ton="warn">{etat.erreur}</Callout>;
  const { brouillons } = etat;
  if (brouillons.length === 0) {
    return (
      <Card className="px-6 py-16 text-center">
        <FilePen strokeWidth={1.25} className="w-8 h-8 text-ink-3 mx-auto" />
        <p className="text-body font-medium text-ink mt-3">Aucun brouillon</p>
        <p className="text-meta text-ink-3 mt-1">« Enregistrer en brouillon » dans un nouveau mail le garde ici.</p>
      </Card>
    );
  }
  const choisi = brouillons.find((e) => e.id === choisiId) ?? brouillons[0]!;
  // Envoyé ou mis à la corbeille : il sort de la liste.
  const retirer = (id: string) => setEtat({ enCours: false, brouillons: brouillons.filter((b) => b.id !== id) });

  return (
    <div className="flex flex-col lg:flex-row gap-4 items-start">
      <aside className="w-full lg:w-[340px] shrink-0">
        <Card className="overflow-hidden">
          <p className="px-3.5 py-2 border-b border-line text-meta text-ink-3">Les {brouillons.length} derniers brouillons de {boite}</p>
          <ul className="divide-y divide-line max-h-[calc(100vh-260px)] overflow-auto">
            {brouillons.map((e) => (
              <li key={e.id} className={e.id === choisi.id ? "bg-green-50" : "hover:bg-surface-2"}>
                <button type="button" onClick={() => setChoisiId(e.id)} className="w-full text-left px-3.5 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-body text-ink font-medium truncate flex-1">{e.objet}</span>
                    {e.aPiecesJointes ? (
                      <Paperclip strokeWidth={1.75} className="w-3.5 h-3.5 shrink-0 text-ink-3" aria-label="Pièce jointe" />
                    ) : null}
                    <span className="shrink-0 text-meta text-ink-3">{dateHeure(e.date)}</span>
                  </div>
                  <p className="mt-0.5 text-meta text-ink-2 truncate">À {e.a.join(", ") || "personne pour l'instant"}</p>
                  {e.apercu ? <p className="mt-0.5 text-meta text-ink-3 truncate">{e.apercu}</p> : null}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </aside>
      <section className="flex-1 min-w-0">
        <DetailBrouillon
          key={`${choisi.id}-${version}`}
          e={choisi}
          onRetire={() => retirer(choisi.id)}
          {...(editeurRiche ? { onModifie: () => setVersion((v) => v + 1) } : {})}
        />
      </section>
    </div>
  );
}

const TITRE_SIGNATURE_OUTLOOK = "La signature de ce brouillon a été posée dans Outlook : finissez-le dans Outlook pour ne pas l'abîmer";

function DetailBrouillon({ e, onRetire, onModifie }: { e: EchangeTrouve; onRetire: () => void; /** Absent : pas d'éditeur riche, pas de « Modifier ». */ onModifie?: () => void }) {
  const toast = useToast();
  const confirmer = useConfirm();
  const [corps, setCorps] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [edition, setEdition] = useState(false);
  // « Modifier » possible ? null tant que le serveur n'a pas répondu (bouton grisé). Un échec de
  // la vérification laisse « Modifier » : l'ouverture revérifie côté serveur.
  const [modifiable, setModifiable] = useState<boolean | null>(null);
  const avecModifier = Boolean(onModifie);

  useEffect(() => {
    if (!avecModifier) return;
    let actif = true;
    void brouillonModifiableAction({ boite: e.boite, id: e.id }).then((r) => {
      if (actif) setModifiable(r.ok ? (r.donnees?.modifiable ?? true) : true);
    });
    return () => {
      actif = false;
    };
  }, [e.boite, e.id, avecModifier]);

  useEffect(() => {
    let actif = true;
    void lireBrouillonAction({ boite: e.boite, id: e.id }).then((r) => {
      if (!actif) return;
      if (r.ok) setCorps(r.donnees ?? "");
      else setErreur(r.erreur);
    });
    return () => {
      actif = false;
    };
  }, [e.boite, e.id]);

  async function envoyer() {
    if (enCours) return;
    if (e.a.length === 0) return void toast.err("Ce brouillon n'a pas de destinataire : à compléter dans Outlook.");
    const ok = await confirmer({
      titre: "Envoyer ce brouillon ?",
      message: `« ${e.objet} » part tel qu'il est dans Outlook, à ${e.a.join(", ")}${e.cc.length ? ` (copie : ${e.cc.join(", ")})` : ""}, pièces jointes comprises.`,
      confirmer: "Envoyer",
    });
    if (!ok) return;
    setEnCours(true);
    const r = await envoyerBrouillonAction({ boite: e.boite, id: e.id });
    setEnCours(false);
    if (!r.ok) return void toast.err(r.erreur);
    toast.ok(`« ${e.objet} » est parti.`);
    onRetire();
  }

  async function supprimer() {
    if (enCours) return;
    const ok = await confirmer({
      titre: "Mettre ce brouillon à la corbeille ?",
      message: "Il part dans « Éléments supprimés » d'Outlook, d'où on peut le récupérer.",
      confirmer: "Mettre à la corbeille",
      danger: true,
    });
    if (!ok) return;
    setEnCours(true);
    const r = await supprimerBrouillonAction({ boite: e.boite, id: e.id });
    setEnCours(false);
    if (!r.ok) return void toast.err(r.erreur);
    toast.ok("Brouillon mis dans « Éléments supprimés ».");
    onRetire();
  }

  const signatureOutlook = modifiable === false;

  return (
    <Card>
      {edition && onModifie ? (
        <ModifierBrouillon boite={e.boite} id={e.id} onFermer={() => setEdition(false)} onEnvoye={onRetire} onEnregistre={onModifie} />
      ) : null}
      <div className="px-5 pt-4 pb-3 border-b border-line">
        <div className="flex flex-wrap items-start gap-2">
          <h2 className="flex-1 min-w-[200px] text-title font-semibold text-ink leading-snug">{e.objet}</h2>
          {onModifie && signatureOutlook && e.lienOutlook ? (
            <a href={e.lienOutlook} target="_blank" rel="noreferrer" className={classesBouton({ size: "sm" })} title={TITRE_SIGNATURE_OUTLOOK}>
              <ExternalLink strokeWidth={1.75} />
              Finir dans Outlook
            </a>
          ) : onModifie && signatureOutlook ? (
            <Button size="sm" disabled title={TITRE_SIGNATURE_OUTLOOK}>
              <ExternalLink strokeWidth={1.75} />
              Finir dans Outlook
            </Button>
          ) : onModifie ? (
            <Button
              size="sm"
              onClick={() => setEdition(true)}
              disabled={enCours || modifiable === null}
              title="Rouvre le brouillon dans l'éditeur : destinataires, objet, texte, pièces jointes"
            >
              <PenLine strokeWidth={1.75} />
              Modifier
            </Button>
          ) : null}
          <Button size="sm" variant="primary" onClick={() => void envoyer()} disabled={enCours}>
            <Send strokeWidth={1.75} />
            Envoyer
          </Button>
          {e.lienOutlook && !(onModifie && signatureOutlook) ? (
            <a
              href={e.lienOutlook}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 inline-flex items-center gap-1 h-7 px-2 text-meta text-green-700 hover:underline"
            >
              Finir dans Outlook <ExternalLink strokeWidth={1.5} className="w-3.5 h-3.5" aria-hidden="true" />
            </a>
          ) : null}
          <Button size="sm" variant="danger" onClick={() => void supprimer()} disabled={enCours} title="Met le brouillon dans « Éléments supprimés » d'Outlook (récupérable)">
            <Trash2 strokeWidth={1.75} />
            Corbeille
          </Button>
        </div>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-meta">
          <dt className="text-ink-3">À</dt>
          <dd className="text-ink-2 break-words">{e.a.join(" ; ") || "-"}</dd>
          {e.cc.length > 0 ? (
            <>
              <dt className="text-ink-3">Cc</dt>
              <dd className="text-ink-2 break-words">{e.cc.join(" ; ")}</dd>
            </>
          ) : null}
          <dt className="text-ink-3">Modifié le</dt>
          <dd className="text-ink-2">{dateHeure(e.date)}</dd>
          {e.aPiecesJointes ? (
            <>
              <dt className="text-ink-3">Pièces</dt>
              <dd className="text-ink-2">jointes au brouillon (elles partent avec lui)</dd>
            </>
          ) : null}
        </dl>
      </div>
      <div className="px-5 py-4 text-body text-ink-2 whitespace-pre-wrap leading-relaxed max-h-[60vh] overflow-auto">
        {erreur ? <span className="text-err-700">{erreur}</span> : corps === null ? <span className="text-ink-3">Chargement…</span> : <TexteAvecLiens texte={corps.trim() || e.apercu} />}
      </div>
    </Card>
  );
}
