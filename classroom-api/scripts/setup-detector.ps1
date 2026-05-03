param(
  [string]$VenvPath = ".venv-detector"
)

$ErrorActionPreference = "Stop"

function Find-Python {
  $py = Get-Command py -ErrorAction SilentlyContinue
  if ($py) {
    return "py -3"
  }

  $python = Get-Command python -ErrorAction SilentlyContinue
  if ($python) {
    return "python"
  }

  throw "Python was not found. Install Python 3.10+ from python.org, then rerun this script."
}

$pythonCommand = Find-Python

Write-Host "Creating detector venv at $VenvPath"
if ($pythonCommand -eq "py -3") {
  py -3 -m venv $VenvPath
} else {
  python -m venv $VenvPath
}

$pythonExe = Join-Path $VenvPath "Scripts\python.exe"
if (!(Test-Path $pythonExe)) {
  throw "Could not find venv Python at $pythonExe"
}

Write-Host "Installing detector requirements"
& $pythonExe -m pip install --upgrade pip
& $pythonExe -m pip install -r requirements-detector.txt

if (!(Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host "Created .env from .env.example"
}

Write-Host ""
Write-Host "Detector environment ready."
Write-Host "Run:"
Write-Host "  .\$VenvPath\Scripts\python.exe scripts\apriltag-detector.py --url http://localhost:4177 --camera 0 --display"
