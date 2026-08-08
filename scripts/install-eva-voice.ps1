param(
    [string]$VoiceDataDir,
    [string]$LogPath = "",
    [ValidateSet("Install", "Uninstall")]
    [string]$Action = "Install"
)

$ErrorActionPreference = "Stop"

function Write-Log([string]$msg) {
    Write-Output $msg
    if ($LogPath) {
        Add-Content -LiteralPath $LogPath -Value $msg -Encoding UTF8
    }
}

$ttsDir = "C:\Windows\Speech_OneCore\Engines\TTS\en-US"
$nusDir = Join-Path $ttsDir "NUSData"
$tokenName = "MSTTS_V110_enUS_EvaM"
$voiceName = "Microsoft Eva Mobile"
$tokens = @(
    "HKLM:\SOFTWARE\Microsoft\Speech\Voices\Tokens\$tokenName",
    "HKLM:\SOFTWARE\Microsoft\Speech_OneCore\Voices\Tokens\$tokenName",
    "HKLM:\SOFTWARE\WOW6432Node\Microsoft\SPEECH\Voices\Tokens\$tokenName",
    "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Speech_OneCore\Voices\Tokens\$tokenName"
)
$attributes = @{
    Age          = "Adult"
    Gender       = "Female"
    Version      = "11.0"
    Language     = "409"
    Name         = "Microsoft Eva Mobile"
    Vendor       = "Microsoft"
    DataVersion  = "11.0.2013.1022"
    SayAsSupport = "spell=NativeSupported; cardinal=GlobalSupported; ordinal=NativeSupported; date=GlobalSupported; time=GlobalSupported; telephone=NativeSupported; currency=NativeSupported; net=NativeSupported; url=NativeSupported; address=NativeSupported; alphanumeric=NativeSupported; Name=NativeSupported; media=NativeSupported; message=NativeSupported; companyName=NativeSupported; computer=NativeSupported; math=NativeSupported; duration=NativeSupported"
}

function Copy-VoiceFile([string]$src, [string]$dest) {
    if (Test-Path -LiteralPath $dest) {
        & takeown /F $dest /A 2>$null | Out-Null
        & icacls $dest /grant "Administrators:F" 2>$null | Out-Null
    }
    Copy-Item -LiteralPath $src -Destination $dest -Force
    Write-Log "  FILE:$([System.IO.Path]::GetFileName($dest))"
}

if ($Action -eq "Install") {
    if (-not $VoiceDataDir -or -not (Test-Path -LiteralPath $VoiceDataDir)) {
        Write-Log "ERROR:Voice data folder not found: $VoiceDataDir"
        exit 1
    }

    Write-Log "STATUS:Copying voice model files..."
    New-Item -ItemType Directory -Force -Path $ttsDir | Out-Null
    Get-ChildItem -LiteralPath $VoiceDataDir -File | ForEach-Object {
        Copy-VoiceFile $_.FullName (Join-Path $ttsDir $_.Name)
    }
    $srcNus = Join-Path $VoiceDataDir "NUSData"
    if (Test-Path -LiteralPath $srcNus) {
        New-Item -ItemType Directory -Force -Path $nusDir | Out-Null
        Get-ChildItem -LiteralPath $srcNus -File | ForEach-Object {
            Copy-VoiceFile $_.FullName (Join-Path $nusDir $_.Name)
        }
    }

    Write-Log "STATUS:Registering voice token..."
    $langDataPath = Join-Path "%windir%\Speech_OneCore\Engines\TTS\en-US" "MSTTSLocEnUS.dat"
    $voicePath = Join-Path "%windir%\Speech_OneCore\Engines\TTS\en-US" "M1033Eva"
    foreach ($token in $tokens) {
        $attrsKey = Join-Path $token "Attributes"
        New-Item -Path $token -Force | Out-Null
        New-Item -Path $attrsKey -Force | Out-Null
        Set-ItemProperty -Path $token -Name "(default)" -Value $voiceName -Type String
        Set-ItemProperty -Path $token -Name "409" -Value $voiceName -Type String
        Set-ItemProperty -Path $token -Name "CLSID" -Value "{179F3D56-1B0B-42B2-A962-59B7EF59FE1B}" -Type String
        Set-ItemProperty -Path $token -Name "LangDataPath" -Value $langDataPath -Type ExpandString
        Set-ItemProperty -Path $token -Name "VoicePath" -Value $voicePath -Type ExpandString
        foreach ($attr in $attributes.Keys) {
            Set-ItemProperty -Path $attrsKey -Name $attr -Value $attributes[$attr] -Type String
        }
        Write-Log "  REG:$token"
    }

    Write-Log "OK:Eva voice installed. Restart Cortana (or Windows) to make it available to Windows TTS."
    exit 0
}

if ($Action -eq "Uninstall") {
    Write-Log "STATUS:Removing voice token..."
    foreach ($token in $tokens) {
        if (Test-Path -LiteralPath $token) {
            Remove-Item -LiteralPath $token -Recurse -Force
            Write-Log "  REG-:$token"
        }
    }

    Write-Log "STATUS:Removing voice model files..."
    Get-ChildItem -LiteralPath $ttsDir -Filter "M1033Eva*" -File -ErrorAction SilentlyContinue | ForEach-Object {
        & takeown /F $_.FullName /A 2>$null | Out-Null
        & icacls $_.FullName /grant "Administrators:F" 2>$null | Out-Null
        Remove-Item -LiteralPath $_.FullName -Force
        Write-Log "  DEL:$($_.Name)"
    }
    if (Test-Path -LiteralPath $nusDir) {
        Get-ChildItem -LiteralPath $nusDir -Filter "M1033Eva*" -File -ErrorAction SilentlyContinue | ForEach-Object {
            Remove-Item -LiteralPath $_.FullName -Force
            Write-Log "  DEL:$($_.Name)"
        }
    }

    Write-Log "OK:Eva voice uninstalled."
    exit 0
}
