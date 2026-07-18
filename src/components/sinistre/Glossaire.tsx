/**
 * Glose : souligne les termes du lexique avec une infobulle (CLAUDE.md §6.2).
 * Matching simple, insensible à la casse et aux accents, sur des formes de
 * surface dérivées des clés du lexique. Le contenu reste la source de vérité.
 */

import { Fragment, type ReactNode } from 'react';
import { lexique } from '@/lib/domain/sinistre/data';

/** Formes de surface lisibles pour quelques clés snake_case du lexique. */
const SURFACES: Record<string, string[]> = {
  parties_immobilieres_privatives: ['parties immobilières privatives'],
  cno_pno: ['CNO', 'PNO'],
  appareil_a_effet_d_eau: ["appareil à effet d'eau", "appareils à effet d'eau"],
  non_assurance: ['non-assurance', 'non assurance'],
  risque_d_usager: ["risque d'usager"],
  responsable_conventionnel: ['responsable conventionnel'],
  frais_afferents: ['frais afférents'],
  assureur_gestionnaire: ['assureur gestionnaire'],
  embellissements: ['embellissements'],
  contenu: ['contenu'],
};

const ACCENTS: Record<string, string> = {
  à: 'a', â: 'a', ä: 'a', é: 'e', è: 'e', ê: 'e', ë: 'e',
  î: 'i', ï: 'i', ô: 'o', ö: 'o', ù: 'u', û: 'u', ü: 'u', ç: 'c',
};

/** Minuscule + désaccentuation en conservant la longueur (alignement d'index). */
function normalize(s: string): string {
  let out = '';
  for (const ch of s.toLowerCase()) out += ACCENTS[ch] ?? ch;
  return out;
}

interface Term {
  surface: string;
  norm: string;
  def: string;
}

const TERMS: Term[] = Object.entries(lexique)
  .flatMap(([key, def]) => {
    const surfaces = SURFACES[key] ?? [key.replace(/_/g, ' ')];
    return surfaces.map((surface) => ({ surface, norm: normalize(surface), def }));
  })
  .sort((a, b) => b.norm.length - a.norm.length);

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /[a-zà-ÿ0-9]/i.test(ch);
}

/** Souligne le premier terme trouvé à chaque position (sans chevauchement). */
type Segment = { kind: 'text'; value: string } | { kind: 'term'; value: string; def: string };

export function Glose({ children }: { children: string }): ReactNode {
  const text = children;
  const hay = normalize(text);
  const segments: Segment[] = [];
  let i = 0;

  const pushText = (ch: string) => {
    const last = segments[segments.length - 1];
    if (last?.kind === 'text') last.value += ch;
    else segments.push({ kind: 'text', value: ch });
  };

  while (i < text.length) {
    let matched: Term | null = null;
    for (const term of TERMS) {
      if (hay.startsWith(term.norm, i)) {
        const before = text[i - 1];
        const after = text[i + term.norm.length];
        if (!isWordChar(before) && !isWordChar(after)) {
          matched = term;
          break;
        }
      }
    }
    if (matched) {
      segments.push({ kind: 'term', value: text.slice(i, i + matched.norm.length), def: matched.def });
      i += matched.norm.length;
    } else {
      pushText(text[i]!);
      i++;
    }
  }

  return (
    <>
      {segments.map((seg, idx) =>
        seg.kind === 'text' ? (
          <Fragment key={idx}>{seg.value}</Fragment>
        ) : (
          <abbr
            key={idx}
            title={seg.def}
            tabIndex={0}
            className="cursor-help underline decoration-dotted decoration-ink-4 underline-offset-2 focus:outline focus:outline-2 focus:outline-green-700"
          >
            {seg.value}
          </abbr>
        ),
      )}
    </>
  );
}
