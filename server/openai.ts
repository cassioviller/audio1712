import OpenAI from "openai";
import fs from "fs";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
// However, for audio transcription we use whisper-1 model specifically
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR || "default_key"
});

export interface TranscriptionResult {
  text: string;
  duration?: number;
}

/**
 * Transcribes audio file using OpenAI Whisper API
 * @param audioFilePath - Path to the audio file to transcribe
 * @returns Promise containing transcription text and duration
 */
export async function transcribeAudio(audioFilePath: string, originalFilename?: string): Promise<TranscriptionResult> {
  try {
    // Verify file exists
    if (!fs.existsSync(audioFilePath)) {
      throw new Error("Arquivo de áudio não encontrado.");
    }

    // For MP3 files, use directly; for chunks, they should already be MP3
    let fileToTranscribe = audioFilePath;

    // Create read stream for the audio file
    const audioReadStream = fs.createReadStream(fileToTranscribe);

    // Call OpenAI Whisper API for transcription
    const transcription = await openai.audio.transcriptions.create({
      file: audioReadStream,
      model: "whisper-1",
      response_format: "json",
      language: "pt", // Portuguese language hint for better accuracy
    });

    // No cleanup needed since we're using the file directly

    // Validate transcription result
    if (!transcription.text || transcription.text.trim().length === 0) {
      throw new Error("Não foi possível extrair texto do arquivo de áudio. Verifique se o arquivo contém fala audível.");
    }

    return {
      text: transcription.text.trim(),
      duration: undefined, // Whisper API response doesn't include duration in current version
    };

  } catch (error: any) {
    console.error("OpenAI transcription error:", error);
    
    // Handle specific OpenAI API errors
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
    
    // Network or other errors
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      throw new Error("Erro de conexão com o serviço de transcrição. Verifique sua conexão com a internet.");
    }
    
    // Generic error message
    throw new Error("Erro ao processar o arquivo de áudio. Verifique se o arquivo não está corrompido e tente novamente.");
  }
}
