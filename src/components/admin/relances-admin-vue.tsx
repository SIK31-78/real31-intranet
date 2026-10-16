"use client";

// Les 4 règles de relance, éditables en ligne : quatre champs par sujet, un bouton Enregistrer
// par ligne (il n'apparaît que si la ligne a changé). En dessous, en lecture, les sujets dont
// le mail est armé : cela se change par une variable d'environnement, pas ici.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { modifierRegleAction } from "@/app/admin/relances/actions";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card, CardBody } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { Section } from "@/components/ui/section";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { LIBELLE_SUJET, SUJETS, type RegleRelance, type SujetSuivi } from "@/lib/domain/contrats-copro";

type Champ = "premierRappelJours" | "orangeJours" | "rougeJours" | "cadenceJours";
const CHAMPS: { cle: Champ; titre: string }[] = [
  { cle: "premierRappelJours", titre: "Premier rappel (j avant échéance)" },
  { cle: "orangeJours", titre: "Orange (j sans étape)" },
  { cle: "rougeJours", titre: "Rouge (j sans étape)" },
  { cle: "cadenceJours", titre: "Cadence des mails (j)" },
];

type Saisie = Record<Champ, string>;

const saisieDe = (r: RegleRelance): Saisie => ({
  premierRappelJours: String(r.premierRappelJours),
  orangeJours: String(r.orangeJours),
  rougeJours: String(r.rougeJours),
  cadenceJours: String(r.cadenceJours),
});

export function RelancesAdminVue({ regles, sujetsArmes }: { regles: Record<SujetSuivi, RegleRelance>; sujetsArmes: SujetSuivi[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, demarrer] = useTransition();
  const [saisies, setSaisies] = useState<Partial<Record<SujetSuivi, Saisie>>>({});

  const valeur = (sujet: SujetSuivi, champ: Champ) => saisies[sujet]?.[champ] ?? String(regles[sujet][champ]);
  const modifiee = (sujet: SujetSuivi) => CHAMPS.some((c) => valeur(sujet, c.cle) !== String(regles[sujet][c.cle]));

  function changer(sujet: SujetSuivi, champ: Champ, v: string) {
    setSaisies((s) => ({ ...s, [sujet]: { ...(s[sujet] ?? saisieDe(regles[sujet])), [champ]: v } }));
  }

  function enregistrer(sujet: SujetSuivi) {
    const lus = CHAMPS.map((c) => [c.cle, Number(valeur(sujet, c.cle).replace(",", "."))] as const);
    const illisible = lus.find(([, n]) => !Number.isInteger(n));
    if (illisible) return toast.err(`« ${CHAMPS.find((c) => c.cle === illisible[0])?.titre} » doit être un nombre entier de jours.`);
    const regle = { sujet, ...Object.fromEntries(lus) } as RegleRelance;
    demarrer(async () => {
      const res = await modifierRegleAction(regle);
      if (!res.ok) return toast.err(res.erreur);
      toast.ok(`Règle « ${LIBELLE_SUJET[sujet]} » enregistrée.`);
      setSaisies((s) => Object.fromEntries(Object.entries(s).filter(([k]) => k !== sujet)));
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <Section id="regles" titre="Règles par sujet" compte={SUJETS.length}>
        <Card>
          <CardBody className="p-0">
            <Table>
              <Thead>
                <tr>
                  <Th>Sujet</Th>
                  {CHAMPS.map((c) => (
                    <Th key={c.cle} numeric>{c.titre}</Th>
                  ))}
                  <Th numeric> </Th>
                </tr>
              </Thead>
              <Tbody>
                {SUJETS.map((sujet) => (
                  <Tr key={sujet}>
                    <Td principal>{LIBELLE_SUJET[sujet]}</Td>
                    {CHAMPS.map((c) => (
                      <Td key={c.cle} numeric>
                        <Input
                          aria-label={`${LIBELLE_SUJET[sujet]} : ${c.titre}`}
                          inputMode="numeric"
                          value={valeur(sujet, c.cle)}
                          onChange={(e) => changer(sujet, c.cle, e.target.value)}
                          largeur="auto"
                          className="w-20 text-right tabular-nums"
                        />
                      </Td>
                    ))}
                    <Td numeric>
                      {modifiee(sujet) && (
                        <Button type="button" variant="primary" size="sm" disabled={pending} onClick={() => enregistrer(sujet)}>
                          <Save strokeWidth={1.5} /> Enregistrer
                        </Button>
                      )}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </CardBody>
        </Card>
      </Section>

      <Section id="armement" titre="Sujets armés pour le mail">
        <Callout ton={sujetsArmes.length ? "info" : "neutral"} titre={sujetsArmes.length ? sujetsArmes.map((s) => LIBELLE_SUJET[s]).join(", ") : "Aucun sujet armé : le cron tourne et n'envoie rien."}>
          Se change par la variable CONTRATS_RAPPELS_SUJETS sur Vercel (ex. « assurance,gaz »), sujet par sujet, après nettoyage des échéances.
        </Callout>
      </Section>
    </div>
  );
}
