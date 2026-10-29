# Installe la tache planifiee Windows de la synchro de l'annuaire Crypto (REA-291).
# A lancer UNE fois, dans PowerShell, depuis le dossier de l'intranet :
#   powershell -ExecutionPolicy Bypass -File scripts\installer-tache-annuaire-crypto.ps1
# Relancer le script remplace la tache (pratique si le dossier de l'intranet change).
#
# Tous les jours a 4 h ; si le PC etait eteint, en veille ou la session fermee, Windows la
# lance des son retour (StartWhenAvailable). Tourne dans la session ouverte du compte
# courant (LogonType Interactive).
#
# PAS de LogonType S4U (« session ouverte ou non ») : avec un compte Microsoft Entra
# (AzureAD\...), S4U ne peut pas ouvrir de session et la tache ne demarre JAMAIS, sans
# erreur visible (code 0x41303 « pas encore executee »). Installee ainsi le 19/10/2026,
# elle n'a pas tourne une seule fois avant le 29/10 (REA-402).

$ErrorActionPreference = "Stop"
$racine = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$cmd = Join-Path $racine "scripts\sync-annuaire-crypto.cmd"
if (-not (Test-Path $cmd)) { throw "Introuvable : $cmd" }

$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$cmd`" /auto" -WorkingDirectory $racine
$declencheur = New-ScheduledTaskTrigger -Daily -At 4am
$reglages = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun -ExecutionTimeLimit (New-TimeSpan -Minutes 30) `
  -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 30) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$compte = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive

Register-ScheduledTask -TaskName "REAL31 - Synchro annuaire Crypto" -Action $action -Trigger $declencheur `
  -Settings $reglages -Principal $compte -Description "Annuaire des expéditeurs de l'intranet, depuis l'export Crypto (REA-291)." -Force | Out-Null

Write-Host "Tâche installée : tous les jours à 4 h, rattrapage au réveil."
Write-Host "Journal : $env:LOCALAPPDATA\real31\sync-annuaire-crypto.log"
Write-Host "Lancer tout de suite : Start-ScheduledTask -TaskName 'REAL31 - Synchro annuaire Crypto'"
