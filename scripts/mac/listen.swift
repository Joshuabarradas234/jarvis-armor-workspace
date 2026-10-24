// jarvis-listen: JARVIS's ears on a Mac (macOS 12 or later, Intel or Apple chip).
// It listens to the microphone with Apple's speech recogniser (on the Mac itself when the Mac supports it) and prints
// one JSON line per thing it hears, the same lines scripts/windows/listen.ps1 prints on Windows, so
// src/voice/windows.js reads it unchanged:
//   {"status": "LISTENING", ...}   {"level": 0.12}   {"detected": true}   {"text": "jarvis open mark 5", "confidence": 0.8}
// scripts/release/build-mac.mjs compiles it (with an embedded Info.plist, so macOS can ask for the microphone and
// speech recognition) into the app's Resources/mac folder.
//   jarvis-listen [--locale en-GB]      jarvis-listen --version
import Foundation
import Speech
import AVFoundation

setvbuf(stdout, nil, _IOLBF, 0)
func emit(_ obj: [String: Any]) {
  if let data = try? JSONSerialization.data(withJSONObject: obj), let line = String(data: data, encoding: .utf8) { print(line); fflush(stdout) }
}
let args = CommandLine.arguments
if args.contains("--version") { emit(["status": "jarvis-listen 1", "engine": "Apple speech"]); exit(0) }
let localeId = args.firstIndex(of: "--locale").flatMap { $0 + 1 < args.count ? args[$0 + 1] : nil } ?? "en-GB"
guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: localeId)) else {
  emit(["status": "VOICE CONTROL UNAVAILABLE", "error": "This Mac has no speech recogniser for \(localeId)."]); exit(1)
}

// permission: speech recognition, then the microphone (macOS asks once, naming JARVIS)
let wait = DispatchSemaphore(value: 0)
var speechOK = false, micOK = false
SFSpeechRecognizer.requestAuthorization { status in speechOK = status == .authorized; wait.signal() }
wait.wait()
AVCaptureDevice.requestAccess(for: .audio) { granted in micOK = granted; wait.signal() }
wait.wait()
if !speechOK || !micOK {
  emit(["status": "VOICE CONTROL UNAVAILABLE", "error": "Allow JARVIS in System Preferences → Security & Privacy → Privacy, under \(speechOK ? "" : "Speech Recognition and ")Microphone, then switch the microphone on again."]); exit(2)
}

let engine = AVAudioEngine()
var request: SFSpeechAudioBufferRecognitionRequest?
var task: SFSpeechRecognitionTask?
var heard = "", changed = Date(), began = Date()
let onDevice = recognizer.supportsOnDeviceRecognition

/** Say what was heard (once), then start listening afresh: Apple's recogniser stops after about a minute. */
func finish(_ text: String, confidence: Double) {
  let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
  if !t.isEmpty { emit(["text": t, "confidence": confidence, "dictation": true]) }
  start()
}
var generation = 0   // each listening session has a number; reports from an old one are ignored
func start() {
  generation += 1; let mine = generation
  task?.cancel(); request?.endAudio()
  let r = SFSpeechAudioBufferRecognitionRequest()
  r.shouldReportPartialResults = true
  if onDevice { r.requiresOnDeviceRecognition = true }   // nothing leaves the Mac where it can listen on its own
  request = r; heard = ""; changed = Date(); began = Date()
  task = recognizer.recognitionTask(with: r) { result, error in
    DispatchQueue.main.async {
      guard mine == generation else { return }
      if let result = result {
        let text = result.bestTranscription.formattedString
        if result.isFinal {
          let segs = result.bestTranscription.segments, avg = segs.isEmpty ? 0.8 : segs.map { Double($0.confidence) }.reduce(0, +) / Double(segs.count)
          finish(text, confidence: avg > 0 ? avg : 0.8)
        } else if text != heard { heard = text; changed = Date(); emit(["detected": true]) }
      } else if error != nil {
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) { if mine == generation { start() } }
      }
    }
  }
}

let input = engine.inputNode
let format = input.outputFormat(forBus: 0)
var lastLevel = Date.distantPast
input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
  request?.append(buffer)
  if let ch = buffer.floatChannelData?[0], Date().timeIntervalSince(lastLevel) > 0.15 {
    let n = Int(buffer.frameLength); var sum: Float = 0
    for i in 0..<n { sum += ch[i] * ch[i] }
    let rms = n > 0 ? sqrt(sum / Float(n)) : 0
    lastLevel = Date(); emit(["level": min(1.0, Double(rms) * 8)])
  }
}
do { engine.prepare(); try engine.start() }
catch { emit(["status": "VOICE CONTROL UNAVAILABLE", "error": "The microphone could not start: \(error.localizedDescription)"]); exit(3) }
emit(["status": "LISTENING", "engine": "Apple speech", "recognizer": "Apple", "culture": localeId, "note": onDevice ? "Listening on this Mac." : "Listening with Apple's speech service (this Mac can't do it on its own)."])
start()

// a pause of 1.2 s ends a phrase; a fresh start every 50 s keeps Apple's one-minute limit away
Timer.scheduledTimer(withTimeInterval: 0.3, repeats: true) { _ in
  if !heard.isEmpty && Date().timeIntervalSince(changed) > 1.2 { let t = heard; heard = ""; finish(t, confidence: 0.8) }
  else if heard.isEmpty && Date().timeIntervalSince(began) > 50 { start() }
}
RunLoop.main.run()
