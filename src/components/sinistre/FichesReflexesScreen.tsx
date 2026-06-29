'use client';

import { useMemo, useState } from 'react';
import { nodes, parametres } from '@/lib/domain/sinistre/data';
import { normalize } from '@/lib/domain/sinistre/util/text';
import { Glose } from './Glossaire';
import { Card, GlosedList, References, SectionTitle, Button } from './ui';
import type { DecisionNode, EtapeNode, QuestionNode, ResultatNode } from '@/lib/domain/sinistre/types';

/**
 * Libellés français lisibles pour les clés de `meta.parametres` (qui sont des
 * identifiants techniques). Évite d'afficher « delai … repetitifs » à l'écran.
 */
const PARAM_LABELS: Record<string, string> = {
  plafond_tranche_1_ht: 'Plafond tranche 1 (€ HT)',
  plafond_convention_ht: 'Plafond convention (€ HT)',
  plafond_rdf_par_assureur_ht: 'Plafond RDF par assureur (€ HT)',
  seuil_recours_rdf_ht: 'Seuil de recours sur RDF (€ HT)',
  seuil_concertation_cidecop_ht: 'Seuil de concertation CIDECOP (€ HT)',
  delai_sinistres_repetitifs_mois: 'Délai sinistres répétitifs (mois)',
  delai_premiere_reunion_expertise_jours: "Délai 1re réunion d'expertise (jours)",
  delai_depot_rapport_expertise_jours: "Délai de dépôt du rapport d'expertise (jours)",
};

function labelParametre(key: string): string {
  return PARAM_LABELS[key] ?? key.replace(/_/g, ' ');
}

/** Reconstruit les 9 cas de désignation du gestionnaire depuis les options cas_213. */
function casGestionnaire() {
  const rows: { cas: number; situation: string; choix: string; gestionnaire: string }[] = [];
  for (const node of Object.values(nodes) as DecisionNode[]) {
    if (node.type !== 'question') continue;
    for (const opt of node.options) {
      if (opt.cas_213 === undefined) continue;
      const cible = nodes[opt.suivant];
      const gestionnaire =
        cible && cible.type === 'etape' && cible.gestionnaire
          ? cible.gestionnaire.replace(/_/g, ' ')
          : '—';
      rows.push({ cas: opt.cas_213, situation: node.question, choix: opt.label, gestionnaire });
    }
  }
  return rows.sort((a, b) => a.cas - b.cas);
}

function Fiche({
  titre,
  filtre,
  children,
  blob,
}: {
  titre: string;
  filtre: string;
  children: React.ReactNode;
  blob: string;
}) {
  if (filtre && !normalize(blob).includes(filtre)) return null;
  return (
    <Card className="mt-4">
      <h2 className="text-lg font-semibold text-ink">{titre}</h2>
      <div className="mt-2">{children}</div>
    </Card>
  );
}

export function FichesReflexesScreen() {
  const [q, setQ] = useState('');
  const filtre = normalize(q.trim());
  const cas = useMemo(() => casGestionnaire(), []);

  const rdf = nodes['etape_rdf'] as EtapeNode | undefined;
  const assiette = nodes['etape_assiette'] as EtapeNode | undefined;
  const cidecopQ = nodes['q_cidecop_conditions'] as QuestionNode | undefined;
  const cidecopR = nodes['r_cidecop'] as ResultatNode | undefined;
  const resultats = (Object.entries(nodes) as [string, DecisionNode][]).filter(
    ([, n]) => n.type === 'resultat' && (n.recours || n.bareme_dde),
  ) as [string, ResultatNode][];

  const casBlob = cas.map((c) => `${c.cas} ${c.situation} ${c.choix} ${c.gestionnaire}`).join(' ');

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink">Fiches réflexes</h1>
        <Button variant="secondary" onClick={() => window.print()}>
          Imprimer
        </Button>
      </div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Filtrer les fiches…"
        aria-label="Filtrer les fiches"
        className="no-print mt-3 w-full max-w-md rounded-md border border-line-2 px-3 py-2"
      />

      <Fiche titre="Désignation de l'assureur gestionnaire — 9 cas (IRSI 2.1.3)" filtre={filtre} blob={casBlob}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-ink-3">
                <th className="py-1 pr-2">Cas</th>
                <th className="py-1 pr-2">Situation</th>
                <th className="py-1 pr-2">Réponse</th>
                <th className="py-1">Assureur gestionnaire</th>
              </tr>
            </thead>
            <tbody>
              {cas.map((c) => (
                <tr key={c.cas} className="border-b border-surface-2 align-top">
                  <td className="py-1 pr-2 font-medium">{c.cas}</td>
                  <td className="py-1 pr-2 text-ink-3">{c.situation}</td>
                  <td className="py-1 pr-2 text-ink-3">{c.choix}</td>
                  <td className="py-1 font-medium text-green-700">{c.gestionnaire}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Fiche>

      {rdf && (
        <Fiche titre={rdf.titre} filtre={filtre} blob={JSON.stringify(rdf)}>
          {rdf.regles_organisation && (
            <>
              <SectionTitle>Qui organise</SectionTitle>
              <GlosedList items={rdf.regles_organisation} />
            </>
          )}
          {rdf.regles_prise_en_charge && (
            <div className="mt-3">
              <SectionTitle>Prise en charge</SectionTitle>
              <GlosedList items={rdf.regles_prise_en_charge} />
            </div>
          )}
          <References items={rdf.references} />
        </Fiche>
      )}

      {assiette && (
        <Fiche titre="Tranches & assiette" filtre={filtre} blob={JSON.stringify(assiette) + JSON.stringify(parametres)}>
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            {Object.entries(parametres).map(([k, v]) => (
              <div key={k} className="rounded bg-surface-2 p-2">
                <dt className="text-xs text-ink-3">{labelParametre(k)}</dt>
                <dd className="font-medium text-ink">{v.toLocaleString('fr-FR')}</dd>
              </div>
            ))}
          </dl>
          {assiette.composition_assiette &&
            Object.entries(assiette.composition_assiette).map(([key, items]) => (
              <div key={key} className="mt-3">
                <SectionTitle>{key.replace(/_/g, ' ')}</SectionTitle>
                <GlosedList items={items} />
              </div>
            ))}
          <References items={assiette.references} />
        </Fiche>
      )}

      <Fiche
        titre="Recours & barème dégât des eaux"
        filtre={filtre}
        blob={resultats.map(([, n]) => JSON.stringify(n)).join(' ')}
      >
        {resultats.map(([id, n]) => (
          <div key={id} className="mt-3 border-t border-surface-2 pt-3 first:border-0 first:pt-0">
            <h3 className="font-medium text-ink">{n.titre}</h3>
            {n.recours && (
              <p className="mt-1 text-sm text-ink-3">
                <Glose>{n.recours}</Glose>
              </p>
            )}
            {n.bareme_dde && (
              <dl className="mt-2 space-y-1 text-sm">
                {Object.entries(n.bareme_dde).map(([k, v]) => (
                  <div key={k}>
                    <dt className="font-medium text-ink-2">{k.replace(/_/g, ' ')}</dt>
                    <dd className="text-ink-3">
                      <Glose>{v}</Glose>
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        ))}
      </Fiche>

      {(cidecopQ || cidecopR) && (
        <Fiche titre="CIDECOP" filtre={filtre} blob={JSON.stringify(cidecopQ) + JSON.stringify(cidecopR)}>
          {cidecopQ?.aide && (
            <p className="text-sm text-ink-3">
              <Glose>{cidecopQ.aide}</Glose>
            </p>
          )}
          {cidecopR?.prise_en_charge && (
            <div className="mt-3">
              <SectionTitle>Prise en charge</SectionTitle>
              <GlosedList items={cidecopR.prise_en_charge} />
            </div>
          )}
          {cidecopR?.recours && (
            <div className="mt-3">
              <SectionTitle>Recours (risque d&apos;usager)</SectionTitle>
              <p className="text-sm text-ink-3">
                <Glose>{cidecopR.recours}</Glose>
              </p>
            </div>
          )}
          {cidecopR?.concertation && (
            <div className="mt-3">
              <SectionTitle>Concertation</SectionTitle>
              <p className="text-sm text-ink-3">
                <Glose>{cidecopR.concertation}</Glose>
              </p>
            </div>
          )}
          <References items={cidecopR?.references} />
        </Fiche>
      )}
    </div>
  );
}
