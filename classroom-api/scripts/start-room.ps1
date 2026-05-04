param(
  [int]$Port = 4177,
  [string]$FigurateBaseUrl = "",
  [string]$FigurateApiKey = "",
  [string]$FigurateCharacterId = "",
  [string]$FigurateVisionApiKey = "",
  [string]$FigurateMode = "",
  [switch]$Https,
  [int]$HttpsPort = 4178,
  [switch]$Open
)

$ErrorActionPreference = "Stop"

$figurateParamProvided = $FigurateBaseUrl -or $FigurateApiKey -or $FigurateCharacterId -or $FigurateVisionApiKey -or $FigurateMode
if ($FigurateBaseUrl) { $env:FIGURATE_BASE_URL = $FigurateBaseUrl }
if ($FigurateApiKey) { $env:FIGURATE_API_KEY = $FigurateApiKey }
if ($FigurateCharacterId) { $env:FIGURATE_CHARACTER_ID = $FigurateCharacterId }
if ($FigurateVisionApiKey) { $env:FIGURATE_VISION_API_KEY = $FigurateVisionApiKey }
if ($FigurateMode) { $env:FIGURATE_MODE = $FigurateMode }

$httpsPfxPath = Join-Path (Get-Location) ".local\certs\smart-room-dev.pfx"
$httpsCerPath = Join-Path (Get-Location) ".local\certs\smart-room-dev.cer"
$publicCerPath = Join-Path (Get-Location) "public\smart-room-dev.cer"
$httpsPassphrase = "smart-room-dev"

function Get-ListeningPid {
  param([int]$Port)
  $lines = netstat -ano | Select-String ":$Port"
  foreach ($line in $lines) {
    $parts = ($line.ToString() -split "\s+") | Where-Object { $_ }
    if ($parts.Length -ge 5 -and $parts[1] -like "*:$Port" -and $parts[3] -eq "LISTENING" -and [int]$parts[-1] -gt 0) {
      return [int]$parts[-1]
    }
  }
  return $null
}

function Test-RoomHealth {
  param([int]$Port)
  try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 2
    return [bool]$health.ok
  } catch {
    return $false
  }
}

function Wait-RoomHealth {
  param([int]$Port)
  $deadline = (Get-Date).AddSeconds(6)
  while ((Get-Date) -lt $deadline) {
    if (Test-RoomHealth -Port $Port) {
      return $true
    }
    Start-Sleep -Milliseconds 250
  }
  return $false
}

function Get-LocalIps {
  $matches = ipconfig | Select-String -Pattern "IPv4"
  foreach ($match in $matches) {
    $ip = ($match.ToString() -split ":")[-1].Trim()
    if ($ip -and $ip -notlike "169.254*") {
      $ip
    }
  }
}

function Ensure-HttpsCertificate {
  param([string[]]$LocalIps)

  if ((Test-Path $httpsPfxPath) -and (Test-Path $publicCerPath)) {
    return
  }

  if (!(Get-Command New-SelfSignedCertificate -ErrorAction SilentlyContinue)) {
    throw "New-SelfSignedCertificate is unavailable. Install mkcert/cloudflared/ngrok, or run without -Https."
  }

  New-Item -ItemType Directory -Force (Split-Path $httpsPfxPath) | Out-Null
  $hostname = [System.Net.Dns]::GetHostName()
  $sanParts = @("DNS=localhost", "DNS=$hostname", "IPAddress=127.0.0.1")
  foreach ($ip in $LocalIps) {
    $sanParts += "IPAddress=$ip"
  }
  $textExtension = "2.5.29.17={text}$($sanParts -join '&')"

  $cert = New-SelfSignedCertificate `
    -Subject "CN=Smart Classroom Dev" `
    -CertStoreLocation "Cert:\CurrentUser\My" `
    -KeyExportPolicy Exportable `
    -KeyLength 2048 `
    -KeyAlgorithm RSA `
    -HashAlgorithm SHA256 `
    -NotAfter (Get-Date).AddDays(30) `
    -TextExtension @($textExtension)

  $password = ConvertTo-SecureString -String $httpsPassphrase -Force -AsPlainText
  Export-PfxCertificate -Cert $cert -FilePath $httpsPfxPath -Password $password | Out-Null
  Export-Certificate -Cert $cert -FilePath $httpsCerPath | Out-Null
  Copy-Item -LiteralPath $httpsCerPath -Destination $publicCerPath -Force
}

$localIps = @(Get-LocalIps)
if ($Https) {
  Ensure-HttpsCertificate -LocalIps $localIps
  $env:HTTPS_PORT = "$HttpsPort"
  $env:HTTPS_PFX_PATH = "$httpsPfxPath"
  $env:HTTPS_PFX_PASSPHRASE = "$httpsPassphrase"
}

$existing = Get-ListeningPid -Port $Port
if ($existing) {
  if (Test-RoomHealth -Port $Port) {
    Write-Host "Room server already listening on port $Port (PID $existing)"
    if ($Https -and !(Get-ListeningPid -Port $HttpsPort)) {
      Write-Warning "HTTPS was requested, but the server is already running without HTTPS. Run .\scripts\stop-room.ps1 -Port $Port, then start-room again with -Https."
    }
    if ($figurateParamProvided) {
      Write-Warning "Figurate parameters were provided, but the server is already running. Restart with .\scripts\stop-room.ps1 -Port $Port, then run start-room again to apply them."
    }
  } else {
    throw "Port $Port is in use by PID $existing, but /api/health did not respond. Run .\scripts\stop-room.ps1 -Port $Port, then retry."
  }
} else {
  New-Item -ItemType Directory -Force .local | Out-Null
  $node = (Get-Command node).Source
  $env:PORT = "$Port"
  $proc = Start-Process -FilePath $node -ArgumentList "server.js" -WorkingDirectory (Get-Location) -WindowStyle Hidden -PassThru
  if (!(Wait-RoomHealth -Port $Port)) {
    if (!$proc.HasExited) {
      Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    }
    throw "Server did not become healthy."
  }
  $existing = Get-ListeningPid -Port $Port
  if (!$existing) {
    throw "Server did not start."
  }
  Write-Host "Started room server on port $Port (PID $($proc.Id))"
}

Write-Host ""
Write-Host "Local URLs:"
Write-Host "  Console:      http://localhost:$Port"
Write-Host "  Start:        http://localhost:$Port/start.html"
Write-Host "  Projects:     http://localhost:$Port/projects.html"
Write-Host "  Project:      http://localhost:$Port/project.html?id=smart-stage"
Write-Host "  Heartbeat:    http://localhost:$Port/heartbeat"
Write-Host "  Timeline:     http://localhost:$Port/timeline.html"
Write-Host "  Report:       http://localhost:$Port/report.html"
Write-Host "  Cameras:      http://localhost:$Port/cameras.html"
Write-Host "  Events:       http://localhost:$Port/events.html"
Write-Host "  Board:        http://localhost:$Port/board.html"
Write-Host "  Projector:    http://localhost:$Port/projector.html"
Write-Host "  Camera Sim:   http://localhost:$Port/camera.html"
Write-Host "  Tag Test:     http://localhost:$Port/tag-debugger.html"
Write-Host "  Phone Board:  http://localhost:$Port/tag-board.html"
Write-Host "  Phone:        http://localhost:$Port/phone.html"
Write-Host "  Health:       http://127.0.0.1:$Port/api/health"
Write-Host "  Figurate:     http://127.0.0.1:$Port/api/figurate/status"

if ($Https) {
  Write-Host ""
  Write-Host "HTTPS URLs:"
  Write-Host "  Phone:        https://localhost:$HttpsPort/phone.html"
  Write-Host "  Health:       https://127.0.0.1:$HttpsPort/api/health"
  Write-Host "  Certificate:  http://localhost:$Port/smart-room-dev.cer"
}

$figurateStatus = if ($env:FIGURATE_BASE_URL -and $env:FIGURATE_API_KEY -and $env:FIGURATE_CHARACTER_ID) { "configured" } else { "local fallback" }
Write-Host ""
Write-Host "Figurate adapter: $figurateStatus"

Write-Host ""
Write-Host "LAN URLs to try from phone:"
foreach ($ip in $localIps) {
  Write-Host "  Phone:   http://$ip`:$Port/phone.html"
  Write-Host "  Board:   http://$ip`:$Port/tag-board.html"
  Write-Host "  Start:   http://$ip`:$Port/start.html"
  if ($Https) {
    Write-Host "  Secure Phone: https://$ip`:$HttpsPort/phone.html"
    Write-Host "  Cert:         http://$ip`:$Port/smart-room-dev.cer"
  }
}

if ($Open) {
  Start-Process "http://localhost:$Port"
  Start-Process "http://localhost:$Port/projector.html"
}
