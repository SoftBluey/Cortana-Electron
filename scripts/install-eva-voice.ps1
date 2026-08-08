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
        for ($i = 0; $i -lt 3; $i++) {
            try {
                Add-Content -LiteralPath $LogPath -Value $msg -Encoding UTF8
                return
            } catch {
                Start-Sleep -Milliseconds 150
            }
        }
    }
}

function Invoke-Silent([scriptblock]$Body) {
    $saved = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try { & $Body } catch {}
    $ErrorActionPreference = $saved
}

try {
    $MoveFileEx = Add-Type -MemberDefinition @"
[DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
public static extern bool MoveFileEx(string lpExistingFileName, string lpNewFileName, int dwFlags);
"@ -Name "NativeMethods" -Namespace "Win32" -PassThru
} catch {
    $MoveFileEx = $null
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

function Grant-Access([string]$path) {
    Invoke-Silent { & takeown /F $path /A }
    Invoke-Silent { & icacls $path /grant "Administrators:F" }
}

function Copy-VoiceFile([string]$src, [string]$dest) {
    $name = [System.IO.Path]::GetFileName($dest)
    if (Test-Path -LiteralPath $dest) {
        Grant-Access $dest
        # If the file is already present and identical, skip it
        try {
            $srcHash = (Get-FileHash -LiteralPath $src -Algorithm SHA256).Hash
            $destHash = (Get-FileHash -LiteralPath $dest -Algorithm SHA256).Hash
            if ($srcHash -eq $destHash) {
                Write-Log "  SKIP:$name (already up to date)"
                return
            }
        } catch {
            # Hash failed — fall through and try copy
        }
    }
    try {
        Copy-Item -LiteralPath $src -Destination $dest -Force -ErrorAction Stop
        Write-Log "  FILE:$name"
        return
    } catch {
        $copyError = $_.Exception.Message
    }
    # File is locked (user-mapped section open or in use).
    # Rename the in-use destination, copy fresh, then schedule the old for reboot delete.
    if ($MoveFileEx) {
        try {
            $oldDest = "$dest.cortana-old"
            if ($MoveFileEx::MoveFileEx($dest, $oldDest, 0x1)) { # MOVEFILE_REPLACE_EXISTING
                try {
                    Copy-Item -LiteralPath $src -Destination $dest -Force -ErrorAction Stop
                    Write-Log "  FILE:$name (replaced; old scheduled for reboot cleanup)"
                    # Schedule the old file for deletion on reboot
                    $MoveFileEx::MoveFileEx($oldDest, $null, 0x4) | Out-Null # MOVEFILE_DELAY_UNTIL_REBOOT
                    return
                } catch {
                    # Copy to clean dest failed — rename back and fall through to error
                    $MoveFileEx::MoveFileEx($oldDest, $dest, 0x1) | Out-Null
                }
            }
        } catch {}
    }
    Write-Log "  COPYFAIL:$name - $copyError"
    throw
}

function Remove-VoiceFile([string]$path) {
    $name = [System.IO.Path]::GetFileName($path)
    try {
        Remove-Item -LiteralPath $path -Force -ErrorAction Stop
        Write-Log "  DEL:$name"
        return
    } catch {
        $locked = $_.Exception.Message
    }
    Start-Sleep -Milliseconds 300
    try {
        Remove-Item -LiteralPath $path -Force -ErrorAction Stop
        Write-Log "  DEL:$name"
        return
    } catch {}
    if ($MoveFileEx) {
        try {
            if ($MoveFileEx::MoveFileEx($path, $null, 0x4)) {
                Write-Log "  DELREBOOT:$name"
                return
            }
        } catch {}
    }
    Write-Log "  DELFAIL:$name - $locked"
}

try {
    if ($Action -eq "Install") {
        if (-not $VoiceDataDir -or -not (Test-Path -LiteralPath $VoiceDataDir)) {
            Write-Log "ERROR:Voice data folder not found: $VoiceDataDir"
            exit 1
        }

        Write-Log "STATUS:Taking ownership of TTS directories..."
        New-Item -ItemType Directory -Force -Path $ttsDir | Out-Null
        Grant-Access $ttsDir

        Write-Log "STATUS:Copying voice model files..."
        Get-ChildItem -LiteralPath $VoiceDataDir -File | ForEach-Object {
            Copy-VoiceFile $_.FullName (Join-Path $ttsDir $_.Name)
        }
        $srcNus = Join-Path $VoiceDataDir "NUSData"
        if (Test-Path -LiteralPath $srcNus) {
            New-Item -ItemType Directory -Force -Path $nusDir | Out-Null
            Grant-Access $nusDir
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
            Grant-Access $_.FullName
            Remove-VoiceFile $_.FullName
        }
        if (Test-Path -LiteralPath $nusDir) {
            Get-ChildItem -LiteralPath $nusDir -Filter "M1033Eva*" -File -ErrorAction SilentlyContinue | ForEach-Object {
                Grant-Access $_.FullName
                Remove-VoiceFile $_.FullName
            }
        }

        $stuck = Get-ChildItem -LiteralPath $ttsDir -Filter "M1033Eva*" -File -ErrorAction SilentlyContinue
        if ($stuck) {
            Write-Log "WARN:$($stuck.Count) file(s) still present (locked by a running app). They will be removed on next reboot."
        }

        Write-Log "OK:Eva voice uninstalled."
        exit 0
    }
} catch {
    Write-Log "ERROR:$($_.Exception.Message)"
    Write-Log "DETAILS:$($_.InvocationInfo.PositionMessage)"
    exit 1
}
