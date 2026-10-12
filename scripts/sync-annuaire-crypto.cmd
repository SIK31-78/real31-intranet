@echo off
rem Synchro de l'annuaire des expediteurs depuis l'export Crypto (REA-291).
rem Double-clic : synchronise et laisse la fenetre ouverte pour lire le resultat.
rem La tache planifiee l'appelle avec /auto (pas de pause) ; la sortie va dans le journal.
rem Ajouter --forcer pour resynchroniser un export deja synchronise.

cd /d "%~dp0.."
set "JOURNAL=%LOCALAPPDATA%\real31\sync-annuaire-crypto.log"
if not exist "%LOCALAPPDATA%\real31" mkdir "%LOCALAPPDATA%\real31"

if /i "%~1"=="/auto" (
  echo ==== %date% %time% >> "%JOURNAL%"
  node --max-old-space-size=3072 scripts\sync-annuaire-crypto.mjs >> "%JOURNAL%" 2>&1
  exit /b %errorlevel%
)

node --max-old-space-size=3072 scripts\sync-annuaire-crypto.mjs %*
echo.
pause
