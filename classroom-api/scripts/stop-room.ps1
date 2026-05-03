param(
  [int]$Port = 4177
)

$ErrorActionPreference = "Stop"

$lines = netstat -ano | Select-String ":$Port"
$ids = @()
foreach ($line in $lines) {
  $parts = ($line.ToString() -split "\s+") | Where-Object { $_ }
  if ($parts.Length -ge 5 -and $parts[1] -like "*:$Port" -and $parts[3] -eq "LISTENING" -and [int]$parts[-1] -gt 0) {
    $ids += $parts[-1]
  }
}

$ids = $ids | Sort-Object -Unique
if (!$ids.Count) {
  Write-Host "No process found for port $Port"
  exit 0
}

foreach ($procId in $ids) {
  try {
    Stop-Process -Id ([int]$procId) -Force -ErrorAction Stop
    Write-Host "Stopped PID $procId"
  } catch {
    Write-Host "Could not stop PID $procId`: $($_.Exception.Message)"
  }
}
