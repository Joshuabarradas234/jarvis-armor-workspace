# Meeting transcription, offline: the Windows speech engine reads each recorded chunk (a 16 kHz WAV file).
# Paths arrive on stdin, one per line. For each, one JSON line comes back: {"file":..., "parts":[{"at":sec,"text":...}]}
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
function Emit($obj) { [Console]::Out.WriteLine((ConvertTo-Json -InputObject $obj -Compress -Depth 5)); [Console]::Out.Flush() }
try {
  Add-Type -AssemblyName System.Speech
  $speechDll = [System.Speech.Recognition.SpeechRecognitionEngine].Assembly.Location
  Add-Type -ReferencedAssemblies $speechDll -Language CSharp -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Speech.Recognition;
using System.Threading;
public static class JvTranscribe {
  public static List<object[]> Run(SpeechRecognitionEngine e, string file) {
    var parts = new List<object[]>();
    var done = new ManualResetEvent(false);
    EventHandler<SpeechRecognizedEventArgs> onRec = (s, a) => {
      if (a.Result == null || string.IsNullOrEmpty(a.Result.Text) || a.Result.Confidence < 0.1) return;
      double at = a.Result.Audio != null ? a.Result.Audio.AudioPosition.TotalSeconds : 0.0;
      lock (parts) parts.Add(new object[] { at, a.Result.Text });
    };
    EventHandler<RecognizeCompletedEventArgs> onDone = (s, a) => done.Set();
    e.SpeechRecognized += onRec; e.RecognizeCompleted += onDone;
    try {
      e.SetInputToWaveFile(file);
      e.RecognizeAsync(RecognizeMode.Multiple);
      if (!done.WaitOne(TimeSpan.FromMinutes(4))) { e.RecognizeAsyncCancel(); done.WaitOne(TimeSpan.FromSeconds(5)); }
    } finally {
      e.SpeechRecognized -= onRec; e.RecognizeCompleted -= onDone;
      try { e.SetInputToNull(); } catch { }
    }
    return parts;
  }
}
"@
  $available = @([System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers())
  $pick = $available | Where-Object { $_.Culture.Name -eq 'en-GB' } | Select-Object -First 1
  if (-not $pick) { $pick = $available | Where-Object { $_.Culture.TwoLetterISOLanguageName -eq 'en' } | Select-Object -First 1 }
  if (-not $pick) { Emit @{ ready = $false; error = 'No English Windows speech recognizer is installed. Add one in Windows Settings > Time & language > Speech.' }; exit 1 }
  $engine = [System.Speech.Recognition.SpeechRecognitionEngine]::new($pick)
  $engine.LoadGrammar([System.Speech.Recognition.DictationGrammar]::new())
  $engine.BabbleTimeout = [TimeSpan]::Zero
  $engine.InitialSilenceTimeout = [TimeSpan]::Zero
  Emit @{ ready = $true; recognizer = $pick.Description; culture = $pick.Culture.Name }
} catch {
  Emit @{ ready = $false; error = $_.Exception.Message }
  exit 1
}
while ($null -ne ($line = [Console]::In.ReadLine())) {
  $file = $line.Trim(); if (-not $file) { continue }
  try {
    $parts = @([JvTranscribe]::Run($engine, $file) | ForEach-Object { @{ at = [math]::Round([double]$_[0], 2); text = [string]$_[1] } })
    Emit @{ file = $file; parts = $parts }
  } catch {
    Emit @{ file = $file; parts = @(); error = $_.Exception.Message }
  }
}
