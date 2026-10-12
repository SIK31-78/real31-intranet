# Installe la tache planifiee Windows de la synchro de l'annuaire Crypto (REA-291).
# A lancer UNE fois, dans PowerShell, depuis le dossier de l'intranet :
#   powershell -ExecutionPolicy Bypass -File scripts\installer-tache-annuaire-crypto.ps1
# Relancer le script remplace la tache (pratique si le dossier de l'intranet change).
#
# Tous les jours a 4 h ; si le PC etait eteint ou en veille, Windows la lance des son
# retour (StartWhenAvailable). Tourne sous le compte courant, session ouverte ou non
# n'importe pas : le mot de passe Windows n'est pas demande (LogonType S4U), mais alors
# la tache n'a pas acces au reseau authentifie, ce qui ne sert pas ici (OneDrive local
# + Supabase en HTTPS).

$ErrorActionPreference = "Stop"
$racine = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$cmd = Join-Path $racine "scripts\sync-annuaire-crypto.cmd"
if (-not (Test-Path $cmd)) { throw "Introuvable : $cmd" }

$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$cmd`" /auto" -WorkingDirectory $racine
$declencheur = New-ScheduledTaskTrigger -Daily -At 4am
$reglages = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun -ExecutionTimeLimit (New-TimeSpan -Minutes 30) `
  -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 30) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$compte = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType S4U

Register-ScheduledTask -TaskName "REAL31 - Synchro annuaire Crypto" -Action $action -Trigger $declencheur `
  -Settings $reglages -Principal $compte -Description "Annuaire des expéditeurs de l'intranet, depuis l'export Crypto (REA-291)." -Force | Out-Null

Write-Host "Tâche installée : tous les jours à 4 h, rattrapage au réveil."
Write-Host "Journal : $env:LOCALAPPDATA\real31\sync-annuaire-crypto.log"
Write-Host "Lancer tout de suite : Start-ScheduledTask -TaskName 'REAL31 - Synchro annuaire Crypto'"
