// Speech recognition (Web Speech API) and microphone recording (MediaRecorder).
// Recognition is only a transcript — it is never presented as a pronunciation score.

import { useCallback, useEffect, useRef, useState } from 'react';

interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

function recognitionCtor(): (new () => RecognitionLike) | null {
  const w = window as unknown as { SpeechRecognition?: new () => RecognitionLike; webkitSpeechRecognition?: new () => RecognitionLike };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function recognitionAvailable(): boolean {
  return typeof window !== 'undefined' && recognitionCtor() !== null;
}

export function recordingAvailable(): boolean {
  return typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';
}

function pickMime(): string | undefined {
  const options = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return options.find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(m));
}

export interface RecordingResult {
  blob: Blob | null;
  url: string | null;
  durationSec: number;
  transcript: string;
}

/**
 * Record audio and (when supported) transcribe it at the same time.
 * `useTranscription` can be switched off by the learner.
 */
export function useSpeechRecorder(opts: { lang?: string; useTranscription?: boolean } = {}) {
  const [state, setState] = useState<'idle' | 'recording' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<RecordingResult | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const recognizer = useRef<RecognitionLike | null>(null);
  const chunks = useRef<Blob[]>([]);
  const started = useRef(0);
  const timer = useRef<number | null>(null);
  const finalText = useRef('');
  const stream = useRef<MediaStream | null>(null);
  const transcribe = opts.useTranscription !== false && recognitionAvailable();

  const cleanup = useCallback(() => {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);

  useEffect(() => () => {
    cleanup();
    recognizer.current?.abort();
  }, [cleanup]);

  const start = useCallback(async () => {
    setError(null);
    setTranscript('');
    setInterim('');
    finalText.current = '';
    setResult(null);
    chunks.current = [];
    let micOk = false;
    if (recordingAvailable()) {
      try {
        stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mime = pickMime();
        const rec = new MediaRecorder(stream.current, mime ? { mimeType: mime } : undefined);
        rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
        rec.start(250);
        recorder.current = rec;
        micOk = true;
      } catch {
        setError('Microphone access was blocked. Allow the microphone in your browser settings to record.');
      }
    }
    if (transcribe) {
      const Ctor = recognitionCtor()!;
      const r = new Ctor();
      r.lang = opts.lang ?? 'en-US';
      r.continuous = true;
      r.interimResults = true;
      r.onresult = (e) => {
        let interimText = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          if (res.isFinal) finalText.current += `${res[0].transcript.trim()} `;
          else interimText += res[0].transcript;
        }
        setTranscript(finalText.current.trim());
        setInterim(interimText);
      };
      r.onerror = (e) => {
        if (e.error === 'not-allowed') setError('Speech recognition was blocked. You can still record and listen back.');
        else if (e.error === 'network') setError('Speech recognition needs an internet connection. Your recording still works.');
      };
      r.onend = () => {
        // Chrome stops recognition after silence; restart while still recording.
        if (recorder.current?.state === 'recording' || (!micOk && recognizer.current === r && timer.current)) {
          try {
            r.start();
          } catch {
            /* already running */
          }
        }
      };
      try {
        r.start();
        recognizer.current = r;
      } catch {
        /* ignore */
      }
    }
    if (!micOk && !transcribe) return;
    started.current = Date.now();
    setElapsed(0);
    timer.current = window.setInterval(() => setElapsed((Date.now() - started.current) / 1000), 250);
    setState('recording');
  }, [opts.lang, transcribe]);

  const stop = useCallback(async (): Promise<RecordingResult> => {
    const durationSec = (Date.now() - started.current) / 1000;
    const r = recognizer.current;
    recognizer.current = null;
    r?.stop();
    const rec = recorder.current;
    recorder.current = null;
    let blob: Blob | null = null;
    if (rec && rec.state !== 'inactive') {
      blob = await new Promise<Blob>((resolve) => {
        rec.onstop = () => resolve(new Blob(chunks.current, { type: rec.mimeType || 'audio/webm' }));
        rec.stop();
      });
    }
    cleanup();
    // Give recognition a moment to deliver its final result.
    await new Promise((res) => setTimeout(res, 400));
    const text = `${finalText.current} ${''}`.trim();
    const out: RecordingResult = { blob, url: blob ? URL.createObjectURL(blob) : null, durationSec, transcript: text };
    setResult(out);
    setInterim('');
    setState('done');
    return out;
  }, [cleanup]);

  const reset = useCallback(() => {
    setState('idle');
    setResult(null);
    setTranscript('');
    setInterim('');
    setElapsed(0);
  }, []);

  return { state, start, stop, reset, error, transcript, interim, elapsed, result, canRecord: recordingAvailable(), canTranscribe: transcribe, setTranscript };
}
