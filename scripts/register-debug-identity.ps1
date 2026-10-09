param([Parameter(Mandatory)][string]$ManifestPath, [Parameter(Mandatory)][string]$ExternalLocation, [switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
try {
    $developerSetting = Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock' -ErrorAction SilentlyContinue
    if ($developerSetting.AllowDevelopmentWithoutDevLicense -ne 1) {
        throw 'Developer Mode is needed only for the development identity. Install a signed AppX release for normal use.'
    }
    if (!$CheckOnly) { Add-AppxPackage -Register $ManifestPath -ExternalLocation $ExternalLocation -ErrorAction Stop }
} catch { Write-Error $_; exit 1 }
