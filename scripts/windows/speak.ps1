$ErrorActionPreference = 'Stop'
try {
  Add-Type -AssemblyName System.Speech
  $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
  if ($request.soundFile -and (Test-Path -LiteralPath $request.soundFile)) {
    # SpeechSynthesizer can play a WAV prompt through the same volume control.
    $speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
    $speaker.Volume = [Math]::Max(0,[Math]::Min(100,[int]$request.volume))
    $prompt = New-Object System.Speech.Synthesis.PromptBuilder
    $prompt.AppendAudio([string]$request.soundFile)
    $speaker.Speak($prompt)
    exit 0
  }
  $speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $voices = @($speaker.GetInstalledVoices() | Where-Object { $_.Enabled })
  $chosen = $null
  # 1. an exact voice the user pinned in Settings wins
  if ($request.voice) { $chosen = $voices | Where-Object { $_.VoiceInfo.Name -eq $request.voice } | Select-Object -First 1 }
  # 2. otherwise walk this hall's preference list, matching on name fragments
  if (-not $chosen -and $request.prefer) {
    foreach ($want in @($request.prefer)) {
      $chosen = $voices | Where-Object { $_.VoiceInfo.Name -like "*$want*" } | Select-Object -First 1
      if (-not $chosen) { $chosen = $voices | Where-Object { $_.VoiceInfo.Culture.Name -eq $want } | Select-Object -First 1 }
      if ($chosen) { break }
    }
  }
  # 3. fall back to any English voice
  if (-not $chosen) { $chosen = $voices | Where-Object { $_.VoiceInfo.Culture.Name -eq 'en-GB' } | Select-Object -First 1 }
  if (-not $chosen) { $chosen = $voices | Where-Object { $_.VoiceInfo.Culture.TwoLetterISOLanguageName -eq 'en' } | Select-Object -First 1 }
  if ($chosen) { $speaker.SelectVoice($chosen.VoiceInfo.Name) }
  $speaker.Volume = [Math]::Max(0,[Math]::Min(100,[int]$request.volume))
  $rate = -1
  if ($request.PSObject.Properties.Name -contains 'rate') { $rate = [Math]::Max(-10,[Math]::Min(10,[int]$request.rate)) }
  $speaker.Rate = $rate
  $speaker.Speak([string]$request.text)
} catch { [Console]::Error.WriteLine($_.Exception.Message) } finally { if ($speaker) { $speaker.Dispose() } }
