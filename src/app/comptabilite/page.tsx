import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Calculator,
  CalendarCheck,
  Clock,
  AlertTriangle,
  MessageSquare,
  ChevronRight,
} from "lucide-react";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { estVueComptable, peutVoirComptabilite } from "@/lib/auth/roles";
import { getDashboardComptable } from "@/lib/services/compta/dashboard-comptable";
import type { LigneComptable } from "@/lib/domain/comptabilite";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateLongue, formatHeure } from "@/lib/format-date";

export const metadata: Metadata = { title: "Comptabilité - REAL31 Intranet" };
export const dynamic = "force-dynamic";

const MOIS_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

/** "2026-05" -> "mai 2026" (libelle d'option du filtre mois). */
function libelleMois(ym: string): string {
  const [y, m] = ym.split("-");
  return `${MOIS_FR[Number(m) - 1]} ${y}`;
}

function LigneRow({ l, vueComptable }: { l: LigneComptable; vueComptable: boolean }) {
  // Aiguillage : le comptable PUR atterrit sur SON espace de preparation (/compta/[id]),
  // pas la fiche gestionnaire. Les autres profils (encadrement, super-admin) gardent la
  // fiche complete. L'id compta = CODE__DATE (meme convention que la supervision).
  const href = vueComptable
    ? `/compta/${l.coproCode}__${l.agDate}`
    : `/copropriete/${l.coproCode}`;
  return (
    <li>
      <Link
        href={href}
        className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2 transition-colors"
      >
        <span className="font-mono text-[12px] text-ink-2 w-[44px] shrink-0">{l.coproCode}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-ink truncate">{l.coproNom}</p>
          <p className="text-[12px] text-ink-3">
            AG du {formatDateLongue(l.agDate)}
            {l.agHeure ? ` · ${formatHeure(l.agHeure)}` : ""}
            {l.gestionnaireNom ? ` · ${l.gestionnaireNom}` : ""}
          </p>
        </div>
        {l.statutConfirmation === "confirme" ? (
          <Badge ton="ok" dot>confirmée</Badge>
        ) : (
          <Badge ton="warn" dot>à confirmer</Badge>
        )}
        {l.envoyerAvant && (
          <Badge ton="warn">
            <AlertTriangle strokeWidth={1.5} className="w-3 h-3" /> avant réunion
          </Badge>
        )}
        {l.notesOuvertes > 0 && (
          <Badge ton="neutral">
            <MessageSquare strokeWidth={1.5} className="w-3 h-3" /> {l.notesOuvertes}
          </Badge>
        )}
        {l.comptesVerifies ? (
          <Badge ton="ok">vérifiés</Badge>
        ) : (
          <Badge ton="outline">à vérifier</Badge>
        )}
        <ChevronRight strokeWidth={1.5} className="w-4 h-4 text-ink-4 shrink-0" />
      </Link>
    </li>
  );
}

function Section({
  titre,
  aide,
  icone,
  lignes,
  vide,
  vueComptable,
}: {
  titre: string;
  aide: string;
  icone: React.ReactNode;
  lignes: LigneComptable[];
  vide: string;
  vueComptable: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div>
        <h2 className="text-[15px] font-semibold text-ink flex items-center gap-2">
          {icone}
          {titre}
          <span className="text-[12px] font-normal text-ink-3">({lignes.length})</span>
        </h2>
        <p className="mt-0.5 text-[12px] text-ink-3">{aide}</p>
      </div>
      {lignes.length === 0 ? (
        <Card>
          <p className="px-4 py-6 text-[13px] text-ink-3 text-center">{vide}</p>
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {lignes.map((l) => (
              <LigneRow key={`${l.coproCode}-${l.agDate}`} l={l} vueComptable={vueComptable} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

export default async function ComptabilitePage({
  searchParams,
}: {
  searchParams: Promise<{ gestionnaire?: string; mois?: string }>;
}) {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  // Role transverse : seuls le pole compta (COMPTABLES) et les super-admins accedent.
  if (!peutVoirComptabilite(g.email, g.role)) redirect("/accueil");
  // Comptable PUR -> chaque ligne pointe vers SON espace de preparation (/compta/[id]) ;
  // l'encadrement / super-admin garde la fiche gestionnaire complete.
  const vueComptable = estVueComptable(g.email, g.role);

  const sp = await searchParams;
  const gestionnaire =
    typeof sp.gestionnaire === "string" && sp.gestionnaire.trim()
      ? sp.gestionnaire.trim().slice(0, 120)
      : undefined;
  const mois =
    typeof sp.mois === "string" && /^\d{4}-\d{2}$/.test(sp.mois) ? sp.mois : undefined;

  // Vraie data : aujourd'hui reel ; mock : ancre calee sur les donnees mockees (2026-05-27).
  const today =
    process.env.COPRO_SOURCE === "supabase"
      ? new Date().toISOString().slice(0, 10)
      : "2026-05-27";

  const { dashboard, gestionnaires, mois: moisDispo, total } = await getDashboardComptable(
    today,
    { gestionnaire, mois },
  );

  // Notes non traitees : derivees des lignes deja chargees (aucune requete de plus).
  const avecNotes = [...dashboard.confirmees, ...dashboard.aConfirmer]
    .filter((l) => l.notesOuvertes > 0)
    .sort((a, b) => b.notesOuvertes - a.notesOuvertes);

  return (
    <AppShell user={g} active="compta" breadcrumb="Comptabilité">
      <div className="mx-auto max-w-[1000px] px-4 py-6 sm:px-6 md:px-8 md:py-8 flex flex-col gap-6">
        <div>
          <h1 className="text-[20px] font-semibold text-ink flex items-center gap-2">
            <Calculator strokeWidth={1.5} className="w-5 h-5 text-green-700" />
            Comptabilité - AG à venir
          </h1>
          <p className="mt-1 text-[13px] text-ink-3">
            Les AG dont la date est posée, sur toutes les copropriétés. Quand la date est
            confirmée par le conseil syndical, il faut préparer les comptes.
          </p>
        </div>

        {/* Filtres (GET, sans JS) : par gestionnaire et par mois d'AG. */}
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-[12px] text-ink-3">
            Gestionnaire
            <select
              name="gestionnaire"
              defaultValue={gestionnaire ?? ""}
              className="h-8 min-w-[180px] rounded-md border border-line bg-surface px-2 text-[13px] text-ink"
            >
              <option value="">Tous</option>
              {gestionnaires.map((nom) => (
                <option key={nom} value={nom}>{nom}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-ink-3">
            Mois
            <select
              name="mois"
              defaultValue={mois ?? ""}
              className="h-8 min-w-[160px] rounded-md border border-line bg-surface px-2 text-[13px] text-ink"
            >
              <option value="">Tous</option>
              {moisDispo.map((ym) => (
                <option key={ym} value={ym}>{libelleMois(ym)}</option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="h-8 rounded-md bg-green-700 px-3 text-[13px] font-medium text-white hover:bg-green-800 transition-colors"
          >
            Filtrer
          </button>
          {(gestionnaire || mois) && (
            <Link
              href="/comptabilite"
              className="h-8 inline-flex items-center rounded-md border border-line px-3 text-[13px] text-ink-2 hover:bg-surface-2 transition-colors"
            >
              Réinitialiser
            </Link>
          )}
          <span className="ml-auto self-center text-[12px] text-ink-3">{total} AG</span>
        </form>

        <Section
          titre="Confirmées"
          aide="Date validée par le conseil syndical : préparer les comptes."
          icone={<CalendarCheck strokeWidth={1.5} className="w-4 h-4 text-ok-600" />}
          lignes={dashboard.confirmees}
          vide="Aucune AG confirmée à venir."
          vueComptable={vueComptable}
        />

        <Section
          titre="À confirmer"
          aide="Date posée mais pas encore validée par le conseil syndical (visibilité anticipée)."
          icone={<Clock strokeWidth={1.5} className="w-4 h-4 text-warn-600" />}
          lignes={dashboard.aConfirmer}
          vide="Aucune AG en attente de confirmation."
          vueComptable={vueComptable}
        />

        {avecNotes.length > 0 && (
          <Section
            titre="Notes à traiter"
            aide="Échanges gestionnaire ↔ comptable ouverts sur une AG à venir."
            icone={<MessageSquare strokeWidth={1.5} className="w-4 h-4 text-ink-3" />}
            lignes={avecNotes}
            vide="Aucune note en attente."
            vueComptable={vueComptable}
          />
        )}
      </div>
    </AppShell>
  );
}
