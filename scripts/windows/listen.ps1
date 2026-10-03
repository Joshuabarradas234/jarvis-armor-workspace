param(
  [string]$GrammarFile = '',
  [string]$Names = 'jarvis',
  [switch]$Diagnose
)
$ErrorActionPreference = 'Stop'
function Emit($obj) { [Console]::WriteLine(($obj | ConvertTo-Json -Compress -Depth 4)); [Console]::Out.Flush() }

# ---------- Side engine: double-clap watch + "open a map of <anywhere>" dictation ----------
# Runs on the older offline Windows recogniser next to the main one. Its events fire on their own
# thread, so claps are timed to the millisecond even while the main loop is waiting for speech.
$script:sideReady = $false
try {
  Add-Type -AssemblyName System.Speech
  $speechDll = [System.Speech.Recognition.SpeechRecognitionEngine].Assembly.Location
  Add-Type -ReferencedAssemblies $speechDll -Language CSharp -TypeDefinition @"
using System;
using System.Globalization;
using System.Speech.Recognition;
public static class JvSide {
  static SpeechRecognitionEngine own;
  static readonly object gate = new object();
  static int prev = 0; static bool inSpike = false; static DateTime spikeStart = DateTime.MinValue;
  static DateTime lastClap = DateTime.MinValue; static bool haveClap = false;
  public static void Emit(string json) { lock (gate) { Console.Out.WriteLine(json); Console.Out.Flush(); } }
  static string Esc(string s) { return (s ?? "").Replace("\\", "\\\\").Replace("\"", "\\\""); }
  // Two short, sharp spikes out of quiet, 0.15-1 s apart. Speech stays loud for longer, so it does not count.
  public static void OnLevel(object sender, AudioLevelUpdatedEventArgs e) {
    int lvl = e.AudioLevel; DateTime now = DateTime.UtcNow;
    lock (gate) {
      if (!inSpike) {
        if (lvl >= 55 && prev <= 30) { inSpike = true; spikeStart = now; }
      } else {
        double held = (now - spikeStart).TotalMilliseconds;
        if (lvl <= 35) {
          inSpike = false;
          if (held <= 350) {
            if (haveClap) {
              double gap = (spikeStart - lastClap).TotalMilliseconds;
              if (gap >= 150 && gap <= 1000) { haveClap = false; Console.Out.WriteLine("{\"clap\":2}"); Console.Out.Flush(); }
              else { lastClap = spikeStart; }
            } else { lastClap = spikeStart; haveClap = true; }
          } else { haveClap = false; }
        } else if (held > 350) { inSpike = false; haveClap = false; }
      }
      prev = lvl;
    }
  }
  public static void OnRecognized(object sender, SpeechRecognizedEventArgs e) {
    if (e.Result == null || e.Result.Grammar == null || e.Result.Grammar.Name != "jarvis-dictation" || string.IsNullOrEmpty(e.Result.Text)) return;
    Emit("{\"text\":\"" + Esc(e.Result.Text) + "\",\"confidence\":" + e.Result.Confidence.ToString(CultureInfo.InvariantCulture) + ",\"dictation\":true}");
  }
  public static Grammar Dictation(string[] names, CultureInfo culture) {
    GrammarBuilder gb = new GrammarBuilder();
    gb.Culture = culture;
    gb.Append(new GrammarBuilder(new Choices(names)), 0, 1);   // the name can be left off right after he answers
    gb.Append(new Choices(new string[] { "open a map of", "open a map for", "show me a map of", "show me the map of", "show me a satellite map of", "pull up a map of", "take me to", "fly to", "fly me to", "zoom in on", "where is", "search for", "look up", "google",
      "note that", "make a note that", "take a note", "remind me to", "add to my list", "remember to", "new idea", "i have an idea", "save an idea",
      "tell the tower to", "ask the tower to", "give the tower",
      "wake me up at", "wake me up in", "wake me at", "call me at", "call me in", "set an alarm for", "set a wake up call for",
      "add a feature", "add the ability to", "i want you to", "can you", "could you", "ask", "tell me", "message me", "whatsapp me", "text me",
      "approve", "approve number", "deny", "deny number", "decline", "decline number", "yes to", "no to", "ring me at", "ring me in",
      "what", "whats", "how", "how many", "who", "is", "are", "did", "do i", "have i", "why", "when" }));
    gb.AppendDictation();
    Grammar g = new Grammar(gb);
    g.Name = "jarvis-dictation";
    return g;
  }
  static RecognizerInfo Pick() {
    RecognizerInfo pick = null;
    foreach (RecognizerInfo i in SpeechRecognitionEngine.InstalledRecognizers()) { if (i.Culture.Name == "en-GB") { pick = i; break; } }
    if (pick == null) foreach (RecognizerInfo i in SpeechRecognitionEngine.InstalledRecognizers()) { if (i.Culture.TwoLetterISOLanguageName == "en") { pick = i; break; } }
    return pick;
  }
  // Main engine is the modern one: run our own listener beside it.
  public static bool Start(string[] names) {
    try {
      RecognizerInfo pick = Pick();
      if (pick == null) return false;
      own = new SpeechRecognitionEngine(pick);
      own.SetInputToDefaultAudioDevice();
      own.LoadGrammar(Dictation(names, pick.Culture));
      own.AudioLevelUpdated += OnLevel;
      own.SpeechRecognized += OnRecognized;
      own.RecognizeAsync(RecognizeMode.Multiple);
      return true;
    } catch (Exception ex) { Emit("{\"error\":\"side listener: " + Esc(ex.Message) + "\"}"); return false; }
  }
  // The modern engine gave up: switch our side listener off, or both engines would hear everything twice
  public static void Stop() {
    if (own != null) { try { own.RecognizeAsyncCancel(); } catch {} try { own.Dispose(); } catch {} own = null; }
    inSpike = false; haveClap = false;
  }
  // Main engine is the older one: hang the clap watch and the dictation grammar on it.
  public static void Attach(SpeechRecognitionEngine e, string[] names, CultureInfo culture) {
    e.AudioLevelUpdated += OnLevel;
    try { e.LoadGrammar(Dictation(names, culture)); } catch (Exception ex) { Emit("{\"error\":\"dictation: " + Esc(ex.Message) + "\"}"); }
  }
}
"@
  $script:sideReady = $true
} catch { [Console]::Error.WriteLine('Side listener unavailable: ' + $_.Exception.Message) }
$script:nameList = [string[]]@($Names -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
if ($script:nameList.Count -eq 0) { $script:nameList = [string[]]@('jarvis') }

# ---------- WinRT helpers (the modern Windows speech engine used by Voice Access / Cortana) ----------
$script:winrtReady = $false
function Init-WinRT {
  if ($script:winrtReady) { return }
  [Windows.Media.SpeechRecognition.SpeechRecognizer, Windows.Media.SpeechRecognition, ContentType=WindowsRuntime] | Out-Null
  [Windows.Media.SpeechRecognition.SpeechRecognitionListConstraint, Windows.Media.SpeechRecognition, ContentType=WindowsRuntime] | Out-Null
  [Windows.Globalization.Language, Windows.Globalization, ContentType=WindowsRuntime] | Out-Null
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $script:asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
  $script:asTaskAction = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction' })[0]
  $script:winrtReady = $true
}
function Await-Op($op, $resultType) {
  $t = $script:asTaskGeneric.MakeGenericMethod($resultType).Invoke($null, @($op))
  $t.Wait(-1) | Out-Null
  return $t.Result
}
function Await-Action($op) {
  $t = $script:asTaskAction.Invoke($null, @($op))
  $t.Wait(-1) | Out-Null
}
# Windows PowerShell 5.1 shows the recogniser's constraint list as a bare COM object with no visible Add method,
# so "$recognizer.Constraints.Add(...)" failed and the modern engine never started. Add through the .NET collection
# interface the list is projected as; try the direct call first in case a later PowerShell exposes it.
function Add-Constraint($recognizer, $constraint) {
  try { $recognizer.Constraints.Add($constraint); return } catch {}
  $iface = [System.Collections.Generic.ICollection[Windows.Media.SpeechRecognition.ISpeechRecognitionConstraint]]
  $iface.GetMethod('Add').Invoke($recognizer.Constraints, [object[]]@($constraint)) | Out-Null
}
function Pick-Language {
  $supported = @([Windows.Media.SpeechRecognition.SpeechRecognizer]::SupportedGrammarLanguages)
  $lang = $supported | Where-Object { $_.LanguageTag -eq 'en-GB' } | Select-Object -First 1
  if (-not $lang) { $lang = $supported | Where-Object { $_.LanguageTag -like 'en-*' } | Select-Object -First 1 }
  if (-not $lang) { $lang = [Windows.Media.SpeechRecognition.SpeechRecognizer]::SystemSpeechLanguage }
  return $lang
}

# ---------- Diagnostics ----------
if ($Diagnose) {
  $out = @{ modern = @{}; legacy = @{}; }
  try {
    Init-WinRT
    $out.modern.available = $true
    $out.modern.systemLanguage = [Windows.Media.SpeechRecognition.SpeechRecognizer]::SystemSpeechLanguage.LanguageTag
    $out.modern.languages = @([Windows.Media.SpeechRecognition.SpeechRecognizer]::SupportedGrammarLanguages | ForEach-Object { $_.LanguageTag })
    try {
      $r = [Windows.Media.SpeechRecognition.SpeechRecognizer]::new((Pick-Language))
      $c = [Windows.Media.SpeechRecognition.SpeechRecognitionListConstraint]::new([string[]]@('jarvis test'), 'jv')
      Add-Constraint $r $c
      $res = Await-Op $r.CompileConstraintsAsync() ([Windows.Media.SpeechRecognition.SpeechRecognitionCompilationResult])
      $out.modern.compile = [string]$res.Status
      $r.Dispose()
    } catch { $out.modern.compile = 'FAILED: ' + $_.Exception.Message }
  } catch { $out.modern.available = $false; $out.modern.error = $_.Exception.Message }
  try {
    Add-Type -AssemblyName System.Speech
    $rec = @([System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers())
    $out.legacy.recognizers = @($rec | ForEach-Object { "$($_.Description) [$($_.Culture.Name)]" })
    $out.legacy.available = $rec.Count -gt 0
    $syn = New-Object System.Speech.Synthesis.SpeechSynthesizer
    $out.voices = @($syn.GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object { "$($_.VoiceInfo.Name) [$($_.VoiceInfo.Culture.Name)]" })
    $syn.Dispose()
  } catch { $out.legacy.available = $false; $out.legacy.error = $_.Exception.Message }
  try {
    $mic = Get-CimInstance Win32_SoundDevice -ErrorAction Stop | Where-Object { $_.Status -eq 'OK' } | Select-Object -ExpandProperty Name
    $out.audioDevices = @($mic)
  } catch {}
  try {
    $k = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone' -ErrorAction Stop
    $out.microphonePrivacy = $k.Value
    $k2 = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone\NonPackaged' -ErrorAction SilentlyContinue
    if ($k2) { $out.desktopAppsMicrophone = $k2.Value }
  } catch {}
  Emit $out
  exit 0
}

if (-not $GrammarFile) { Emit @{ status = 'VOICE CONTROL UNAVAILABLE · HOTKEY CONTROL ACTIVE'; error = 'No grammar file supplied.' }; exit 1 }
$phrases = @(Get-Content -LiteralPath $GrammarFile -Raw | ConvertFrom-Json)
$phrases = @($phrases | Where-Object { $_ -and $_.Trim() } | ForEach-Object { $_.Trim() } | Select-Object -Unique)
$errors = @()

# ---------- Engine 1: modern Windows speech (Windows.Media.SpeechRecognition) ----------
$recognizer = $null
try {
  Init-WinRT
  $lang = Pick-Language
  $recognizer = [Windows.Media.SpeechRecognition.SpeechRecognizer]::new($lang)
  $constraint = [Windows.Media.SpeechRecognition.SpeechRecognitionListConstraint]::new([string[]]$phrases, 'jarvis-commands')
  Add-Constraint $recognizer $constraint
  $compiled = Await-Op $recognizer.CompileConstraintsAsync() ([Windows.Media.SpeechRecognition.SpeechRecognitionCompilationResult])
  if ([string]$compiled.Status -ne 'Success') { throw "Command list could not be compiled ($($compiled.Status))." }
  $recognizer.Timeouts.InitialSilenceTimeout = [TimeSpan]::FromSeconds(6)
  $recognizer.Timeouts.BabbleTimeout = [TimeSpan]::FromSeconds(6)
  # People say "Jarvis..." then pause before the command. Waiting 1.1 s of silence keeps "Jarvis <pause> open Hulk Buster"
  # as one sentence instead of cutting it off after the name.
  $recognizer.Timeouts.EndSilenceTimeout = [TimeSpan]::FromMilliseconds(1100)
  $recognizer.UIOptions.IsReadBackEnabled = $false
  $recognizer.UIOptions.ShowConfirmation = $false
  if ($script:sideReady) { [void][JvSide]::Start($script:nameList) }
  Emit @{ status = 'MICROPHONE LISTENING'; recognizer = 'Windows voice engine'; culture = $lang.LanguageTag; engine = 'modern' }
  $failures = 0
  while ($true) {
    try {
      $result = Await-Op $recognizer.RecognizeAsync() ([Windows.Media.SpeechRecognition.SpeechRecognitionResult])
      $failures = 0
      $st = [string]$result.Status
      if ($st -eq 'Success') {
        if ($result.Text) {
          $conf = [double]$result.RawConfidence
          $lvl = [string]$result.Confidence
          $rejected = ($lvl -eq 'Rejected')   # 'Low' still counts: JARVIS decides using the name and the confidence
          Emit @{ detected = $true }
          Emit @{ text = $result.Text; confidence = $conf; rejected = $rejected; level = $lvl }
        }
      } elseif ($st -eq 'MicrophoneUnavailable') { throw 'Microphone unavailable. Check the microphone is plugged in / enabled and that Settings > Privacy & security > Microphone allows desktop apps.' }
      elseif ($st -eq 'UserCanceled' -or $st -eq 'NetworkFailure' -or $st -eq 'AudioQualityFailure') { Emit @{ audioState = $st } }
      # InitialSilenceTimeout / TimeoutExceeded: nothing said, loop again
    } catch {
      $failures++
      $msg = $_.Exception.Message
      if ($msg -match 'Microphone unavailable' -or $failures -ge 5) { throw $msg }
      Emit @{ audioState = 'RETRY'; error = $msg }
      Start-Sleep -Milliseconds 400
    }
  }
} catch {
  $errors += 'Modern engine: ' + $_.Exception.Message
  if ($recognizer) { try { $recognizer.Dispose() } catch {} }
  if ($script:sideReady) { try { [JvSide]::Stop() } catch {} }
}

# ---------- Engine 2: legacy System.Speech (Windows Speech Recognition) ----------
$engine = $null
try {
  Add-Type -AssemblyName System.Speech
  $available = @([System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers())
  if ($available.Count -eq 0) { throw 'No legacy recognizer installed.' }
  $preferred = $available | Where-Object { $_.Culture.Name -eq 'en-GB' } | Select-Object -First 1
  if (-not $preferred) { $preferred = $available | Where-Object { $_.Culture.TwoLetterISOLanguageName -eq 'en' } | Select-Object -First 1 }
  if (-not $preferred) { throw 'No English legacy recognizer installed.' }
  $engine = [System.Speech.Recognition.SpeechRecognitionEngine]::new($preferred)
  $choices = New-Object System.Speech.Recognition.Choices
  $choices.Add([string[]]$phrases)
  $builder = New-Object System.Speech.Recognition.GrammarBuilder
  $builder.Culture = $preferred.Culture
  $builder.Append($choices)
  $grammar = [System.Speech.Recognition.Grammar]::new($builder)
  $grammar.Name = 'jarvis-commands'
  $engine.LoadGrammar($grammar)
  $engine.InitialSilenceTimeout = [TimeSpan]::Zero
  $engine.BabbleTimeout = [TimeSpan]::Zero
  $engine.EndSilenceTimeout = [TimeSpan]::FromMilliseconds(650)
  $engine.EndSilenceTimeoutAmbiguous = [TimeSpan]::FromMilliseconds(1400)   # "Jarvis" could go on: wait for the rest of the command
  $engine.SetInputToDefaultAudioDevice()
  Register-ObjectEvent -InputObject $engine -EventName SpeechRecognized -SourceIdentifier 'jv.recognized' | Out-Null
  Register-ObjectEvent -InputObject $engine -EventName SpeechRecognitionRejected -SourceIdentifier 'jv.rejected' | Out-Null
  Register-ObjectEvent -InputObject $engine -EventName SpeechDetected -SourceIdentifier 'jv.detected' | Out-Null
  Register-ObjectEvent -InputObject $engine -EventName AudioLevelUpdated -SourceIdentifier 'jv.level' | Out-Null
  Register-ObjectEvent -InputObject $engine -EventName AudioStateChanged -SourceIdentifier 'jv.audiostate' | Out-Null
  if ($script:sideReady) { [JvSide]::Attach($engine, $script:nameList, $preferred.Culture) }
  $engine.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple)
  Emit @{ status = 'MICROPHONE LISTENING'; recognizer = $preferred.Description; culture = $preferred.Culture.Name; engine = 'legacy'; note = ($errors -join ' | ') }
  $lastLevel = -1; $lastLevelAt = Get-Date
  while ($true) {
    $ev = Wait-Event -Timeout 5
    if ($null -eq $ev) { continue }
    Remove-Event -EventIdentifier $ev.EventIdentifier
    $a = $ev.SourceEventArgs
    switch ($ev.SourceIdentifier) {
      'jv.recognized' { if ($a.Result -and $a.Result.Text) { Emit @{ text = $a.Result.Text; confidence = $a.Result.Confidence } } }
      'jv.rejected'   { if ($a.Result -and $a.Result.Text) { Emit @{ text = $a.Result.Text; confidence = $a.Result.Confidence; rejected = $true } } }
      'jv.detected'   { Emit @{ detected = $true } }
      'jv.audiostate' { Emit @{ audioState = [string]$a.AudioState } }
      'jv.level'      { $lvl = [int]$a.AudioLevel; $now = Get-Date; if ($lvl -ne $lastLevel -and ($now - $lastLevelAt).TotalMilliseconds -ge 120) { $lastLevel = $lvl; $lastLevelAt = $now; Emit @{ level = $lvl } } }
    }
  }
} catch {
  $errors += 'Legacy engine: ' + $_.Exception.Message
  $hint = 'Check: Settings > Privacy & security > Microphone > "Let desktop apps access your microphone" is ON, and an English language pack with Speech is installed under Settings > Time & language > Language & region.'
  Emit @{ status = 'VOICE CONTROL UNAVAILABLE · HOTKEY CONTROL ACTIVE'; error = (($errors -join ' | ') + ' — ' + $hint) }
  [Console]::Error.WriteLine(($errors -join ' | '))
  exit 1
} finally { if ($engine) { try { $engine.RecognizeAsyncCancel() } catch {}; $engine.Dispose() } }
