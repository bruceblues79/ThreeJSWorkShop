param(
  [Parameter(Mandatory = $true)]
  [string]$Asset
)

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..\..')
Push-Location $root
try {
  $registry = Get-Content 'viewer\assets.ts' -Raw
  if ($registry -notmatch "id:\s*'$([regex]::Escape($Asset))'") {
    throw "asset '$Asset' is not registered in viewer/assets.ts"
  }

  npm run viewer:build -- $Asset | Out-Host
  if ($LASTEXITCODE -ne 0) { throw 'viewer build failed' }

  $raw = (& lark-cli contact +get-user --format json | Out-String)
  $start = $raw.IndexOf('{')
  if ($start -lt 0) { throw 'cannot resolve the current Feishu user' }
  $user = ($raw.Substring($start) | ConvertFrom-Json).data.user
  if (-not $user.open_id) { throw 'missing Feishu open_id' }

  # lark-cli writes progress to stderr; discard it so it cannot abort the script
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $send = (& lark-cli im +messages-send --user-id $user.open_id --file viewer/preview.html 2>$null | Out-String)
  $sendCode = $LASTEXITCODE
  $ErrorActionPreference = $previous
  Write-Output $send
  if ($sendCode -ne 0 -or $send -notmatch '"ok"\s*:\s*true') { throw 'Feishu send failed' }

  [pscustomobject]@{
    asset   = $Asset
    sent_to = $user.name
    file    = (Resolve-Path 'viewer\preview.html').Path
    bytes   = (Get-Item 'viewer\preview.html').Length
  } | Format-List
}
finally {
  Pop-Location
}
