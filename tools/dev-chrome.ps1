# Lance Chrome avec un profil persistant + extension chargée.
# 1er lancement : connecte-toi sur MAL + clique Agree -> cookies sauvés dans .chrome-profile/
# Lancements suivants : session + consent conservés, plus besoin de re-cliquer.
$Root = Split-Path -Parent $PSScriptRoot
$Profile = Join-Path $Root ".chrome-profile"
$Chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
if (-not (Test-Path $Chrome)) { $Chrome = "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe" }

& $Chrome `
  "--user-data-dir=$Profile" `
  --no-first-run `
  --no-default-browser-check `
  "--load-extension=$Root" `
  --disable-features=Translate `
  "https://myanimelist.net/"
