import fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import type { TranscriptionSegment } from "./openai";

const execAsync = promisify(exec);

const VIDEO_EXTENSIONS = [".mp4", ".mov", ".webm", ".mkv"];

export function isVideoFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Extracts only the audio track of a video as a small mono MP3 (16 kHz, 64 kbps).
 * A 1-minute reel goes from ~30 MB of video to ~0.5 MB of audio, far from Whisper's 25 MB limit.
 * Returns the path of the new MP3 and removes the original video.
 */
export async function extractAudioFromVideo(inputPath: string): Promise<string> {
  const outputPath = inputPath.replace(/\.[^.]+$/, "") + ".audio.mp3";
  const q = (p: string) => `'${p.replace(/'/g, "'\\''")}'`;
  try {
    await execAsync(`ffmpeg -y -i ${q(inputPath)} -vn -ac 1 -ar 16000 -codec:a libmp3lame -b:a 64k ${q(outputPath)}`);
    if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
      throw new Error("o vídeo não tem trilha de áudio");
    }
    fs.unlinkSync(inputPath);
    return outputPath;
  } catch (error) {
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    const msg = error instanceof Error ? error.message : "erro desconhecido";
    throw new Error(`Erro ao extrair o áudio do vídeo: ${msg}`);
  }
}

export interface SpeechCheck {
  hasSpeech: boolean;
  note: string | null;
}

/**
 * Whisper "hallucinates" on music-only audio: it returns short phrases repeated many times
 * (e.g. "E aí" x10). We treat the result as no-speech when:
 *  - most segments have a high no_speech_prob, or
 *  - the same short phrase repeats across most of the segments.
 */
export function checkSpeech(text: string, segments: TranscriptionSegment[]): SpeechCheck {
  if (!text.trim()) {
    return { hasSpeech: false, note: "Nenhuma fala detectada." };
  }
  if (segments.length === 0) {
    return { hasSpeech: true, note: null };
  }

  const silent = segments.filter((s) => s.noSpeechProb >= 0.6).length;
  if (silent / segments.length >= 0.7) {
    return { hasSpeech: false, note: "Provavelmente sem fala (só música ou ruído). O texto pode ser alucinação do transcritor." };
  }

  if (segments.length >= 4) {
    const norm = (t: string) => t.toLowerCase().replace(/[.,!?;:"'()\-]/g, "").replace(/\s+/g, " ").trim();
    const counts = new Map<string, number>();
    for (const s of segments) {
      const k = norm(s.text);
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    const top = Math.max(...Array.from(counts.values()));
    if (top / segments.length >= 0.6) {
      return { hasSpeech: false, note: "Texto repetitivo: provavelmente sem fala (só música). Conferir ouvindo." };
    }
  }

  return { hasSpeech: true, note: null };
}

function srtTime(seconds: number): string {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const r = ms % 1000;
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(h)}:${p(m)}:${p(s)},${p(r, 3)}`;
}

/** Builds an .srt subtitle file from the segments (useful to align speech with video frames). */
export function segmentsToSrt(segments: TranscriptionSegment[]): string {
  return segments
    .filter((s) => s.text)
    .map((s, i) => `${i + 1}\n${srtTime(s.start)} --> ${srtTime(s.end)}\n${s.text}\n`)
    .join("\n");
}
