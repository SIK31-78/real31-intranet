"use client";

// Vue « Envoyés » de l'écran E-mails (REA-341, 16/10/2026, en pilote) : les 30 derniers
// mails partis de la boîte affichée, en lecture seule. Objet, destinataires, date, aperçu
// dans la liste ; le texte complet à l'ouverture. On ne répond ni ne transfère d'ici : le
// suivi d'un envoyé se fait depuis le mail reçu, ou dans Outlook.
// « Relancer si pas de réponse » (ADR-053, décision 9, 29/10/2026) : le même menu que « En
// attente » (sans « De côté ») ; à la date, s'il n'y a pas eu de réponse dans le fil, l'envoi
// réapparaît en tête de « À traiter » (« Relance : pas de réponse depuis le … »).

import { useEffect, useState } from "react";
import { ExternalLink, Paperclip, Send } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { libelleRetour, type ChoixAttente } from "@/lib/domain/boite-equipe";
import { relancerSiPasDeReponseAction } from "@/app/mes-emails/actions-equipe";
import { MenuAttente } from "./equipe-mail";
import { Callout } from "@/components/ui/callout";
import type { EchangeTrouve } from "@/lib/domain/echanges";
import { chargerEnvoyesAction, lireEnvoyeAction } from "@/app/mes-emails/actions";
import { TexteAvecLiens } from "@/components/mes-emails/texte-avec-liens";

const dateHeure = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", {
    timeZone: "Europe/Paris",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

type Etat = { enCours: true } | { enCours: false; envoyes: EchangeTrouve[] } | { enCours: false; erreur: string };

export function EnvoyesVue({
  boite,
  partagee = false,
  relance = false,
}: {
  boite: string;
  /** Boîte partagée : filtrée au binôme (REA-408). */
  partagee?: boolean;
  /** « Relancer si pas de réponse » proposé (boîte d'équipe active). */
  relance?: boolean;
}) {
  const [etat, setEtat] = useState<Etat>({ enCours: true });
  const [choisiId, setChoisiId] = useState<string | null>(null);

  useEffect(() => {
    let actif = true;
    void chargerEnvoyesAction({ boite }).then((r) => {
      if (!actif) return;
      setEtat(r.ok ? { enCours: false, envoyes: r.donnees ?? [] } : { enCours: false, erreur: r.erreur });
    });
    return () => {
      actif = false;
    };
  }, [boite]);

  if (etat.enCours) return <p className="text-body text-ink-3">Chargement des mails envoyés…</p>;
  if ("erreur" in etat) return <Callout ton="warn">{etat.erreur}</Callout>;
  const { envoyes } = etat;
  if (envoyes.length === 0) {
    return (
      <Card className="px-6 py-16 text-center">
        <Send strokeWidth={1.25} className="w-8 h-8 text-ink-3 mx-auto" />
        <p className="text-body font-medium text-ink mt-3">Aucun mail envoyé</p>
        {partagee ? <p className="text-meta text-ink-3 mt-1">Seuls les envoyés de {boite} liés à vos mails apparaissent ici.</p> : null}
      </Card>
    );
  }
  const choisi = envoyes.find((e) => e.id === choisiId) ?? envoyes[0]!;

  return (
    <div className="flex flex-col lg:flex-row gap-4 items-start">
      <aside className="w-full lg:w-[340px] shrink-0">
        <Card className="overflow-hidden">
          <p className="px-3.5 py-2 border-b border-line text-meta text-ink-3">
            {partagee
              ? `Les ${envoyes.length} derniers envoyés de ${boite} liés à vos mails`
              : `Les ${envoyes.length} derniers mails partis de ${boite}`}
          </p>
          <ul className="divide-y divide-line max-h-[calc(100vh-260px)] overflow-auto">
            {envoyes.map((e) => (
              <li key={e.id} className={e.id === choisi.id ? "bg-green-50" : "hover:bg-surface-2"}>
                <button type="button" onClick={() => setChoisiId(e.id)} className="w-full text-left px-3.5 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-body text-ink font-medium truncate flex-1">{e.objet}</span>
                    {e.aPiecesJointes ? (
                      <Paperclip strokeWidth={1.75} className="w-3.5 h-3.5 shrink-0 text-ink-3" aria-label="Pièce jointe" />
                    ) : null}
                    <span className="shrink-0 text-meta text-ink-3">{dateHeure(e.date)}</span>
                  </div>
                  <p className="mt-0.5 text-meta text-ink-2 truncate">À {e.a.join(", ") || "?"}</p>
                  {e.apercu ? <p className="mt-0.5 text-meta text-ink-3 truncate">{e.apercu}</p> : null}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </aside>
      <section className="flex-1 min-w-0">
        <DetailEnvoye key={choisi.id} e={choisi} relance={relance} />
      </section>
    </div>
  );
}

function DetailEnvoye({ e, relance }: { e: EchangeTrouve; relance: boolean }) {
  const toast = useToast();
  const [corps, setCorps] = useState<string | null>(null);
  const [relanceLe, setRelanceLe] = useState<string | null>(null);
  async function relancer(choix: ChoixAttente): Promise<boolean> {
    if (choix === "de-cote" || !e.conversationId) return false;
    const r = await relancerSiPasDeReponseAction({ emailId: e.internetMessageId, boite: e.boite, conversationId: e.conversationId, envoyeLe: e.date, choix });
    if (!r.ok) {
      toast.err(r.erreur);
      return false;
    }
    setRelanceLe(r.donnees!.jusquAu);
    toast.ok(`S'il n'y a pas de réponse, il reviendra dans « À traiter » le ${libelleRetour(r.donnees!.jusquAu)}.`);
    return true;
  }
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let actif = true;
    void lireEnvoyeAction({ boite: e.boite, id: e.id }).then((r) => {
      if (!actif) return;
      if (r.ok) setCorps(r.donnees ?? "");
      else setErreur(r.erreur);
    });
    return () => {
      actif = false;
    };
  }, [e.boite, e.id]);

  return (
    // Pas d'overflow-hidden : le menu « Relancer si pas de réponse » déborde sous l'en-tête.
    <Card>
      <div className="px-5 pt-4 pb-3 border-b border-line">
        <div className="flex items-start gap-3">
          <h2 className="flex-1 text-title font-semibold text-ink leading-snug">{e.objet}</h2>
          {relance && e.conversationId && e.internetMessageId ? (
            relanceLe ? (
              <span className="shrink-0 text-meta text-ink-3">Relance le {libelleRetour(relanceLe)}</span>
            ) : (
              <MenuAttente
                taille="sm"
                libelle="Relancer si pas de réponse"
                titre="Le mail reviendra dans « À traiter » à la date choisie si personne n'a répondu"
                deCote={false}
                onChoisir={relancer}
              />
            )
          ) : null}
          {e.lienOutlook ? (
            <a
              href={e.lienOutlook}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 inline-flex items-center gap-1 text-meta text-green-700 hover:underline"
            >
              Ouvrir dans Outlook <ExternalLink strokeWidth={1.5} className="w-3.5 h-3.5" aria-hidden="true" />
            </a>
          ) : null}
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
          <dt className="text-ink-3">Envoyé le</dt>
          <dd className="text-ink-2">{dateHeure(e.date)}</dd>
        </dl>
      </div>
      <div className="px-5 py-4 text-body text-ink-2 whitespace-pre-wrap leading-relaxed max-h-[60vh] overflow-auto">
        {erreur ? <span className="text-err-700">{erreur}</span> : corps === null ? <span className="text-ink-3">Chargement…</span> : <TexteAvecLiens texte={corps.trim() || e.apercu} />}
      </div>
    </Card>
  );
}
