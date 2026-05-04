param(
  [string]$Url = $env:SMART_ROOM_URL,
  [string]$Camera = $env:SMART_ROOM_CAMERA,
  [string]$Surface = $env:SMART_ROOM_SURFACE,
  [string]$Family = $env:SMART_ROOM_TAG_FAMILY,
  [switch]$Display,
  [switch]$Once,
  [switch]$AutoCalibrate,
  [switch]$AutoSolve,
  [string]$VenvPath = ".venv-detector"
)

$ErrorActionPreference = "Stop"

if (!$Url) { $Url = "http://localhost:4177" }
if (!$Camera) { $Camera = "0" }
if (!$Surface) { $Surface = "board" }
if (!$Family) { $Family = "tag36h11" }

$pythonExe = Join-Path $VenvPath "Scripts\python.exe"
if (!(Test-Path $pythonExe)) {
  throw "Detector venv not found. Run scripts\setup-detector.ps1 first."
}

$argsList = @(
  "scripts\apriltag-detector.py",
  "--url", $Url,
  "--camera", $Camera,
  "--surface", $Surface,
  "--family", $Family
)

if ($Display) { $argsList += "--display" }
if ($Once) { $argsList += "--once" }
if ($AutoCalibrate) { $argsList += "--auto-calibrate" }
if ($AutoSolve) { $argsList += "--auto-solve" }

& $pythonExe @argsList
