import OpenAI from "openai";
import fs from "fs";

// For audio transcription we use the whisper-1 model specifically
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR || "default_key"
});

export interface TranscriptionSegment {
  start: number; // seconds from the start of the file
  end: number;
  text: string;
  noSpeechProb: number; // 0..1, Whisper's estimate that the segment has no speech
}

export interface TranscriptionResult {
  text: string;
  duration?: number;
  language?: string;
  segments: TranscriptionSegment[];
}

/**
 * Transcribes audio file using OpenAI Whisper API.
 * Uses verbose_json so we get per-segment timestamps and the no-speech probability.
 * @param audioFilePath - Path to the audio file to transcribe
 */
export async function transcribeAudio(audioFilePath: string, originalFilename?: string): Promise<TranscriptionResult> {
  try {
    if (!fs.existsSync(audioFilePath)) {
      throw new Error("Arquivo de áudio não encontrado.");
    }

    const audioReadStream = fs.createReadStream(audioFilePath);

    const transcription: any = await openai.audio.transcriptions.create({
      file: audioReadStream,
      model: "whisper-1",
      response_format: "verbose_json",
      timestamp_granularities: ["segment"],
      language: "pt", // Portuguese language hint for better accuracy
    });

    const text = (transcription.text || "").trim();
    const segments: TranscriptionSegment[] = (transcription.segments || []).map((s: any) => ({
      start: Number(s.start) || 0,
      end: Number(s.end) || 0,
      text: String(s.text || "").trim(),
      noSpeechProb: typeof s.no_speech_prob === "number" ? s.no_speech_prob : 0,
    }));

    // An empty result is valid now: videos with only music have no speech.
    // The caller decides what to do with it (see hasSpeech in routes.ts).
    return {
      text,
      duration: typeof transcription.duration === "number" ? transcription.duration : undefined,
      language: transcription.language,
      segments,
    };

  } catch (error: any) {
    console.error("OpenAI transcription error:", error);

    if (error.code === 'invalid_api_key') {
      throw new Error("Chave da API OpenAI inválida. Verifique a configuração.");
    }
    if (error.code === 'insufficient_quota') {
      throw new Error("Cota da API OpenAI excedida. Tente novamente mais tarde.");
    }
    if (error.code === 'model_not_found') {
      throw new Error("Modelo de transcrição não disponível. Tente novamente mais tarde.");
    }
    if (error.status === 413) {
      throw new Error("Arquivo muito grande para processamento. Reduza o tamanho do arquivo.");
    }
    if (error.status === 400) {
      if (originalFilename && originalFilename.toLowerCase().endsWith('.m4a')) {
        throw new Error("Este arquivo M4A não é compatível com o serviço de transcrição. Tente converter o arquivo para MP3 ou WAV antes de fazer o upload.");
      }
      throw new Error("Formato de arquivo não suportado ou arquivo corrompido.");
    }
    if (error.status >= 500) {
      throw new Error("Erro temporário do serviço de transcrição. Tente novamente em alguns minutos.");
    }
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      throw new Error("Erro de conexão com o serviço de transcrição. Verifique sua conexão com a internet.");
    }
    if (error instanceof Error && error.message.startsWith("Arquivo de áudio")) {
      throw error;
    }
    throw new Error("Erro ao processar o arquivo de áudio. Verifique se o arquivo não está corrompido e tente novamente.");
  }
}
