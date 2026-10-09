$ErrorActionPreference = 'Stop'
$cortanaRoot = [IO.Path]::GetFullPath((Split-Path $PSScriptRoot -Parent))
$cortanaElectronDir = Join-Path $cortanaRoot 'node_modules\electron\dist'
$cortanaExecutable = Join-Path $cortanaElectronDir 'electron.exe'
$cortanaBackup = Join-Path $cortanaElectronDir 'electron.backup.exe'
$cortanaMarker = Join-Path $cortanaElectronDir 'electron.backup.version'
$cortanaDebugLayout = Join-Path $cortanaRoot '.winapp\debug'
$cortanaVersion = (Get-Content -LiteralPath (Join-Path $cortanaRoot 'node_modules\electron\package.json') -Raw | ConvertFrom-Json).version

if (!(Test-Path -LiteralPath $cortanaBackup) -or !(Test-Path -LiteralPath $cortanaMarker) -or
    (Get-Content -LiteralPath $cortanaMarker -Raw).Trim() -ne $cortanaVersion -or
    [Diagnostics.FileVersionInfo]::GetVersionInfo($cortanaBackup).FileVersion -ne $cortanaVersion) {
    throw 'A version-matched original Electron backup is required before removing the development identity.'
}
$cortanaRunning = Get-CimInstance Win32_Process -Filter "name = 'electron.exe'" | Where-Object { $_.ExecutablePath -eq $cortanaExecutable }
if ($cortanaRunning) { throw 'Quit this workspace''s development Cortana from its tray before removing the identity.' }
$cortanaDebugPackage = Get-AppxPackage -Name 'cortana-electron.debug'
if ($cortanaDebugPackage) {
    if ([IO.Path]::GetFullPath($cortanaDebugPackage.InstallLocation) -ne $cortanaDebugLayout -or !$cortanaDebugPackage.IsDevelopmentMode) {
        throw 'The installed debug identity belongs to another location; it was not removed.'
    }
    Remove-AppxPackage -Package $cortanaDebugPackage.PackageFullName -ErrorAction Stop
}
Copy-Item -LiteralPath $cortanaBackup -Destination $cortanaExecutable -Force
function Get-CortanaFileHash([string]$Path) {
    $cortanaStream = [IO.File]::OpenRead($Path)
    $cortanaHasher = [Security.Cryptography.SHA256]::Create()
    try { [BitConverter]::ToString($cortanaHasher.ComputeHash($cortanaStream)) }
    finally { $cortanaStream.Dispose(); $cortanaHasher.Dispose() }
}
if ((Get-CortanaFileHash $cortanaExecutable) -ne (Get-CortanaFileHash $cortanaBackup)) {
    throw 'Restored Electron did not match its original backup.'
}
if (Get-AppxPackage -Name 'cortana-electron.debug') { throw 'The debug package is still registered.' }
Write-Output 'Temporary Cortana debug identity removed; original Electron restored. Windows settings and audio devices were not changed.'
