"use client";

// Panneau d'import CSV (ADR-025). Le fichier est lu et parse 100% dans le
// navigateur ; chaque ligne devient un secret chiffre cote client avant envoi.
// Le serveur ne recoit que des blobs chiffres.

import { useState, type ChangeEvent } from "react";
import { Upload, Loader2, FileText } from "lucide-react";
import { chiffrerSecret, CRYPTO_VERSION } from "@/lib/coffre/coffre-client";
import { importerSecretsAction } from "@/app/coffre/actions";
import {
  parserCsv,
  decoderTexte,
  detecterColonnes,
  versSecret,
  cleDedup,
  CHAMPS,
  type CsvParse,
  type Mapping,
  type ChampSecret,
} from "@/lib/coffre/import-csv";
import type { SecretClair } from "@/lib/domain/coffre";

const champClasse =
  "h-8 px-2 rounded-md border border-line bg-surface text-[12.5px] text-ink focus:outline-none focus:ring-1 focus:ring-green-600";

export function ImportPanel({
  coffreId,
  vaultKey,
  secretsExistants,
  onTermine,
  onErreur,
}: {
  coffreId: string;
  vaultKey: CryptoKey;
  secretsExistants: SecretClair[];
  onTermine: () => Promise<void>;
  onErreur: (e: string | null) => void;
}) {
  const [parse, setParse] = useState<CsvParse | null>(null);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [nomFichier, setNomFichier] = useState("");
  const [busy, setBusy] = useState(false);
  const [resultat, setResultat] = useState<string | null>(null);

  async function onFichier(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    onErreur(null);
    setResultat(null);
    try {
      const p = parserCsv(decoderTexte(await f.arrayBuffer()));
      setParse(p);
      setMapping(detecterColonnes(p.entetes));
      setNomFichier(f.name);
    } catch (err) {
      onErreur((err as Error).message);
    }
  }

  // Transformation + deduplication (vs existants ET dans le fichier).
  const valides: SecretClair[] =
    parse && mapping
      ? parse.lignes.map((l) => versSecret(l, mapping)).filter((s): s is SecretClair => s !== null)
      : [];
  const existKeys = new Set(secretsExistants.map(cleDedup));
  const vus = new Set<string>();
  const nouveaux = valides.filter((s) => {
    const k = cleDedup(s);
    if (existKeys.has(k) || vus.has(k)) return false;
    vus.add(k);
    return true;
  });
  const doublons = valides.length - nouveaux.length;

  function setColonne(cle: ChampSecret, valeur: string) {
    if (!mapping) return;
    setMapping({ ...mapping, [cle]: valeur === "" ? null : Number(valeur) });
  }

  async function importer() {
    if (!mapping) return;
    if (mapping.motDePasse === null) return onErreur("Indique la colonne du mot de passe.");
    if (nouveaux.length === 0) return onErreur("Rien a importer.");
    setBusy(true);
    onErreur(null);
    try {
      const items = await Promise.all(
        nouveaux.map(async (s) => ({ blob: await chiffrerSecret(vaultKey, s), cryptoVersion: CRYPTO_VERSION })),
      );
      await importerSecretsAction(coffreId, items);
      await onTermine();
      setResultat(`${items.length} mot(s) de passe importe(s).`);
      setParse(null);
      setMapping(null);
      setNomFichier("");
    } catch (e) {
      onErreur((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-4 py-3 border-t border-line flex flex-col gap-3">
      {resultat && <p className="text-[12px] text-green-700">{resultat}</p>}

      {!parse ? (
        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-2 w-fit cursor-pointer text-[12.5px] text-green-700 border border-green-200 hover:bg-green-50 rounded-md px-3 py-1.5">
            <Upload className="w-3.5 h-3.5" strokeWidth={1.5} /> Choisir un fichier CSV
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={onFichier} />
          </label>
          <p className="text-[11.5px] text-ink-4">
            Depuis Excel : Fichier &gt; Enregistrer sous &gt; CSV UTF-8. Le fichier reste sur ton poste.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 text-[12px] text-ink-3">
            <FileText className="w-3.5 h-3.5" strokeWidth={1.5} /> {nomFichier} - {parse.lignes.length} ligne(s)
          </div>

          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 items-center max-w-md">
            {CHAMPS.map(({ cle, libelle }) => (
              <div key={cle} className="contents">
                <label className="text-[12px] text-ink-2 text-right">{libelle}</label>
                <select
                  className={champClasse}
                  value={mapping?.[cle] ?? ""}
                  onChange={(e) => setColonne(cle, e.target.value)}
                >
                  <option value="">(aucune)</option>
                  {parse.entetes.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `Colonne ${i + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <p className="text-[12px] text-ink-3">
            <strong className="text-ink">{nouveaux.length}</strong> a importer
            {doublons > 0 && <span> - {doublons} doublon(s) ignore(s)</span>}
          </p>

          {nouveaux.length > 0 && (
            <ul className="text-[11.5px] text-ink-3 border border-line rounded-md divide-y divide-line max-h-40 overflow-auto">
              {nouveaux.slice(0, 8).map((s, i) => (
                <li key={i} className="px-2.5 py-1 flex gap-2">
                  <span className="text-ink truncate flex-1">{s.titre}</span>
                  <span className="truncate flex-1">{s.login}</span>
                  <span className="font-mono text-ink-4">........</span>
                </li>
              ))}
              {nouveaux.length > 8 && <li className="px-2.5 py-1 text-ink-4">... et {nouveaux.length - 8} autre(s)</li>}
            </ul>
          )}

          <div className="flex gap-2">
            <button
              onClick={importer}
              disabled={busy || nouveaux.length === 0}
              className="flex items-center justify-center gap-1.5 h-8 px-3 rounded-md bg-green-700 text-white text-[12.5px] font-medium hover:bg-green-800 disabled:opacity-60"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" strokeWidth={2} />}
              Importer {nouveaux.length} mot(s) de passe
            </button>
            <button
              onClick={() => {
                setParse(null);
                setMapping(null);
              }}
              className="text-[12px] text-ink-3 hover:text-ink px-3"
            >
              Annuler
            </button>
          </div>
        </>
      )}
    </div>
  );
}
