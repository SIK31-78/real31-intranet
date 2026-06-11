-- Etend la contrainte de type de public.intranet_jalons pour accepter les jalons
-- ajoutes (relance pouvoirs + cycle post-AG). A executer une fois dans le SQL editor.
-- Sans ca, marquer un jalon RELANCE_POUVOIRS / SCAN_CONTRAT / NOTIF_PV / ARCHIVAGE
-- echoue (violation de la contrainte CHECK).

alter table public.intranet_jalons
  drop constraint if exists intranet_jalons_type_check;

alter table public.intranet_jalons
  add constraint intranet_jalons_type_check
  check (type in (
    'ODJ_CS', 'DEVIS', 'CONVOC', 'RELANCE_POUVOIRS', 'POUVOIRS', 'TENUE',
    'SCAN_CONTRAT', 'NOTIF_PV', 'ARCHIVAGE'
  ));
