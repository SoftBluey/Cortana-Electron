// Development only. The signed AppX release gets identity during installation.
// Avoid winapp's current debug-manifest capability-ordering and SDK dependency
// bugs: inbox speech needs no Windows App SDK package dependency.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const electronDir = path.join(root, 'node_modules/electron/dist');
const executable = path.join(electronDir, 'electron.exe');
const layout = path.join(root, '.winapp/debug');
const manifest = path.join(layout, 'appxmanifest.xml');
const registrationArgs = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'scripts/register-debug-identity.ps1'), '-ManifestPath', manifest, '-ExternalLocation', electronDir];
// Fail before modifying Electron if this optional development setup is off.
execFileSync('powershell.exe', [...registrationArgs, '-CheckOnly'], { stdio: 'inherit', windowsHide: true });
fs.mkdirSync(layout, { recursive: true });
const backup = path.join(electronDir, 'electron.backup.exe');
// Never restore a backup from another Electron version.
const version = require('electron/package.json').version;
const marker = path.join(electronDir, 'electron.backup.version');
// Windows rejects re-registration of a changed development manifest at the
// same version. Advance only our debug package; never uninstall a user build.
const installedVersion = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "Get-AppxPackage -Name 'cortana-electron.debug' | Select-Object -ExpandProperty Version"], { encoding: 'utf8', windowsHide: true }).trim();
const debugParts = /^\d+\.\d+\.\d+\.\d+$/.test(installedVersion) ? installedVersion.split('.').map(Number) : [1, 0, 0, 0];
if (installedVersion) {
  for (let i = 3; i >= 0; i--) {
    if (debugParts[i] < 65535) { debugParts[i]++; break; }
    debugParts[i] = 0;
    if (i === 0) throw new Error('Debug package version exhausted. Remove only the debug identity before retrying.');
  }
}
const debugVersion = debugParts.join('.');
if (!fs.existsSync(backup) || !fs.existsSync(marker) || fs.readFileSync(marker, 'utf8').trim() !== version) {
  fs.copyFileSync(executable, backup); fs.writeFileSync(marker, version);
}
fs.mkdirSync(path.join(electronDir, 'Assets'), { recursive: true });
for (const name of ['StoreLogo.png', 'MedTile.png', 'AppList.png', 'WideTile.png']) {
  fs.copyFileSync(path.join(root, 'assets', name), path.join(electronDir, 'Assets', name));
}
fs.writeFileSync(manifest, `<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
 xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
 xmlns:uap10="http://schemas.microsoft.com/appx/manifest/uap/windows10/10"
 xmlns:desktop6="http://schemas.microsoft.com/appx/manifest/desktop/windows10/6"
 xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
 IgnorableNamespaces="uap uap10 desktop6 rescap">
 <Identity Name="cortana-electron.debug" Publisher="CN=bluey" Version="${debugVersion}" ProcessorArchitecture="${process.arch === 'arm64' ? 'arm64' : 'x64'}" />
 <Properties><DisplayName>Cortana Electron</DisplayName><PublisherDisplayName>BlueySoft</PublisherDisplayName>
  <Logo>Assets\\StoreLogo.png</Logo><uap10:AllowExternalContent>true</uap10:AllowExternalContent>
  <desktop6:RegistryWriteVirtualization>disabled</desktop6:RegistryWriteVirtualization></Properties>
 <Dependencies><TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.19041.0" MaxVersionTested="10.0.26300.0" /></Dependencies>
 <Resources><Resource Language="en-us" /></Resources>
 <Applications><Application Id="cortanaElectron.debug" Executable="electron.exe" uap10:RuntimeBehavior="win32App" uap10:TrustLevel="mediumIL">
  <uap:VisualElements AppListEntry="none" DisplayName="Cortana Electron" Description="Cortana development" BackgroundColor="transparent" Square150x150Logo="Assets\\MedTile.png" Square44x44Logo="Assets\\AppList.png" />
 </Application></Applications>
 <Capabilities><Capability Name="internetClient" /><rescap:Capability Name="runFullTrust" /><rescap:Capability Name="unvirtualizedResources" /><DeviceCapability Name="microphone" /></Capabilities>
</Package>`);
execFileSync(process.execPath, [path.join(root, 'node_modules/@microsoft/winappcli/dist/cli.js'), 'embed-identity', executable, '--manifest', manifest], { cwd: root, stdio: 'inherit', windowsHide: true });
execFileSync('powershell.exe', registrationArgs, { stdio: 'inherit', windowsHide: true });
console.log('Development identity registered. No device, certificate or Windows setting was changed.');
