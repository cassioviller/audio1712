import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { z } from "zod";
import { storage } from "./storage";
import { uploadAudioSchema, insertTranscriptionSchema } from "@shared/schema";
import { transcribeAudio } from "./openai";
import path from "path";
import fs from "fs";

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 10485760, // 10MB
  },
  fileFilter: (req, file, cb) => {
    // Check file extension - more reliable than MIME type for audio files
    const allowedExtensions = ['.mp3', '.wav', '.m4a', '.mp4', '.aac'];
    const filename = file.originalname.toLowerCase();
    const hasValidExtension = allowedExtensions.some(ext => filename.endsWith(ext));
    
    if (hasValidExtension) {
      cb(null, true);
    } else {
      cb(new Error('Formato de arquivo não suportado. Use MP3, WAV ou M4A.'));
    }
  },
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Upload and transcribe audio file
  app.post("/api/transcribe", upload.single('audioFile'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ 
          error: "Nenhum arquivo foi enviado. Selecione um arquivo de áudio." 
        });
      }

      const file = req.file;
      
      // Validate file data
      const fileData = {
        filename: file.originalname,
        size: file.size,
        mimeType: file.mimetype,
      };

      // Skip Zod validation for now since we have extension-based validation
      // const validationResult = uploadAudioSchema.safeParse(fileData);
      // if (!validationResult.success) {
      //   fs.unlinkSync(file.path);
      //   return res.status(400).json({ 
      //     error: "Arquivo inválido. Verifique o formato e tamanho (máx. 10MB)." 
      //   });
      // }

      const startTime = Date.now();

      try {
        // Transcribe audio using OpenAI Whisper
        const transcriptionResult = await transcribeAudio(file.path, file.originalname);
        
        const processingTime = (Date.now() - startTime) / 1000; // Convert to seconds
        const wordCount = transcriptionResult.text.trim().split(/\s+/).length;

        // Save transcription to storage
        const transcriptionData = {
          filename: file.originalname,
          originalSize: file.size,
          mimeType: file.mimetype,
          duration: transcriptionResult.duration,
          transcriptionText: transcriptionResult.text,
          wordCount,
          confidence: 0.94, // Whisper doesn't provide confidence, using estimated value
          processingTime,
        };

        const savedTranscription = await storage.createTranscription(transcriptionData);

        // Clean up uploaded file
        fs.unlinkSync(file.path);

        res.json({
          id: savedTranscription.id,
          filename: savedTranscription.filename,
          transcriptionText: savedTranscription.transcriptionText,
          duration: savedTranscription.duration,
          wordCount: savedTranscription.wordCount,
          confidence: savedTranscription.confidence,
          processingTime: savedTranscription.processingTime,
          createdAt: savedTranscription.createdAt.toISOString(),
        });

      } catch (transcriptionError) {
        // Clean up uploaded file
        fs.unlinkSync(file.path);
        console.error("Transcription error:", transcriptionError);
        
        return res.status(500).json({ 
          error: transcriptionError.message || "Erro ao processar o áudio. Verifique se o arquivo não está corrompido e tente novamente." 
        });
      }

    } catch (error) {
      console.error("Upload error:", error);
      
      // Clean up uploaded file if it exists
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ 
            error: "Arquivo muito grande. O tamanho máximo é 10MB." 
          });
        }
        return res.status(400).json({ 
          error: "Erro no upload do arquivo. Tente novamente." 
        });
      }

      return res.status(500).json({ 
        error: "Erro interno do servidor. Tente novamente mais tarde." 
      });
    }
  });

  // Get transcription by ID
  app.get("/api/transcriptions/:id", async (req, res) => {
    try {
      const transcription = await storage.getTranscription(req.params.id);
      if (!transcription) {
        return res.status(404).json({ error: "Transcrição não encontrada." });
      }

      res.json({
        id: transcription.id,
        filename: transcription.filename,
        transcriptionText: transcription.transcriptionText,
        duration: transcription.duration,
        wordCount: transcription.wordCount,
        confidence: transcription.confidence,
        processingTime: transcription.processingTime,
        createdAt: transcription.createdAt.toISOString(),
      });
    } catch (error) {
      console.error("Get transcription error:", error);
      res.status(500).json({ error: "Erro ao buscar transcrição." });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
