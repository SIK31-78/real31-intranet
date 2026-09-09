# reprise/ — dossiers de travail des reprises de copropriété

Ce dossier est **hors dépôt** (`.gitignore`). Il reçoit, en fin de reprise, le dossier
`travail/` (scripts, extractions JSON, contrôles) qui vivait jusque-là dans le dossier
de la copropriété sur SharePoint — les livrables destinés à la gestionnaire (`0x-*.md`,
`*_mapping-reprise.xlsx`, fichiers d'import) y restent.

Un sous-dossier par référence eStale : `reprise/S0305/travail/`.

    node scripts/reprise-archiver.mjs S0305 "C:\Users\...\Gaultier 4\Reprise"

Le script déplace, ne copie pas ; il refuse d'écraser un dossier déjà archivé.
