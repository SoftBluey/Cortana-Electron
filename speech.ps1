Add-Type -AssemblyName System.Speech -ErrorAction Stop

$bestEngine = $null
try {
    $engines = @([System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers())
    foreach ($eng in $engines) {
        if ($eng.Culture.Name -eq 'en-US') {
            if ($eng.Name -match 'Telephony|Server' -or $eng.Name -notmatch 'DESK') {
                $bestEngine = $eng
                break
            }
        }
    }
    if (-not $bestEngine) {
        $bestEngine = $engines | Where-Object { $_.Culture.Name -eq 'en-US' } | Select-Object -First 1
    }
} catch {}

if ($bestEngine) {
    $recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine($bestEngine)
    [Console]::WriteLine("ENGINE:SAPI:$($bestEngine.Name)")
} else {
    $recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine
    [Console]::WriteLine("ENGINE:SAPI:default")
}

try {
    $recognizer.SetInputToDefaultAudioDevice()
} catch {
    [Console]::WriteLine("ERROR:Microphone not accessible")
    exit 1
}

$grammar = New-Object System.Speech.Recognition.DictationGrammar
$recognizer.LoadGrammar($grammar)
$recognizer.InitialSilenceTimeout = [TimeSpan]::FromSeconds(10)
$recognizer.BabbleTimeout = [TimeSpan]::FromSeconds(3)
$recognizer.EndSilenceTimeout = [TimeSpan]::FromSeconds(2)

[Console]::WriteLine("READY")

while ($true) {
    try {
        $result = $recognizer.Recognize()
        if ($result -and $result.Text) {
            [Console]::WriteLine("FINAL:$($result.Text)")
        }
    } catch {
        if ($_.Exception.Message -match "operation was canceled|disposed|stopped") { break }
        [Console]::WriteLine("ERROR:$($_.Exception.Message)")
        break
    }
}
$recognizer.Dispose()
