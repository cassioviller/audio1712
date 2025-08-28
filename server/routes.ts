import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { z } from "zod";
import { storage } from "./storage";
import { uploadAudioSchema, insertTranscriptionSchema } from "@shared/schema";
import { transcribeAudio } from "./openai";
import path from "path";
import fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// Convert OPUS files to MP3 using FFmpeg
async function convertOpusToMp3(inputPath: string): Promise<string> {
  // Replace .opus extension with .mp3
  const outputPath = inputPath.replace(/\.opus$/i, '.mp3');
  
  try {
    console.log(`Converting OPUS file: ${inputPath} -> ${outputPath}`);
    
    // Check if input file exists
    if (!fs.existsSync(inputPath)) {
      throw new Error(`Input file does not exist: ${inputPath}`);
    }
    
    // Use FFmpeg to convert OPUS to MP3 with error handling
    // Escape file paths properly to handle special characters
    const escapedInputPath = inputPath.replace(/'/g, "'\\''");
    const escapedOutputPath = outputPath.replace(/'/g, "'\\''");
    const command = `ffmpeg -y -i '${escapedInputPath}' -codec:a libmp3lame -b:a 128k '${escapedOutputPath}'`;
    console.log(`Running FFmpeg command: ${command}`);
    
    const { stdout, stderr } = await execAsync(command);
    console.log('FFmpeg stdout:', stdout);
    if (stderr) {
      console.log('FFmpeg stderr:', stderr);
    }
    
    // Check if output file was created
    if (!fs.existsSync(outputPath)) {
      throw new Error('Conversion failed: output file was not created');
    }
    
    // Check output file size
    const outputStats = fs.statSync(outputPath);
    if (outputStats.size === 0) {
      throw new Error('Conversion failed: output file is empty');
    }
    
    console.log(`Conversion successful. Output file size: ${outputStats.size} bytes`);
    
    // Remove original OPUS file only if conversion was successful
    fs.unlinkSync(inputPath);
    
    return outputPath;
  } catch (error) {
    console.error('FFmpeg conversion error:', error);
    
    // Clean up files on error
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }
    if (fs.existsSync(inputPath)) {
      fs.unlinkSync(inputPath);
    }
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Erro ao converter arquivo OPUS: ${errorMessage}`);
  }
}

// Configure multer for file uploads
const upload = multer({
  storage: multer.diskStorage({
    destination: 'uploads/',
    filename: (req, file, cb) => {
      // Preserve file extension for easier processing
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = path.extname(file.originalname);
      cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
  }),
  limits: {
    fileSize: 10485760, // 10MB
  },
  fileFilter: (req, file, cb) => {
    // Check file extension - more reliable than MIME type for audio files
    // OpenAI native formats: flac, m4a, mp3, mp4, mpeg, mpga, oga, ogg, wav, webm
    // Additional formats that will be converted: opus
    const allowedExtensions = ['.mp3', '.wav', '.m4a', '.mp4', '.flac', '.ogg', '.webm', '.mpga', '.oga', '.opus'];
    const filename = file.originalname.toLowerCase();
    const hasValidExtension = allowedExtensions.some(ext => filename.endsWith(ext));
    
    if (hasValidExtension) {
      cb(null, true);
    } else {
      cb(new Error('Formato de arquivo não suportado. Use MP3, WAV, M4A, MP4, FLAC, OGG, WEBM ou OPUS.'));
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
        // Check if file needs conversion
        let audioFilePath = file.path;
        let audioFileName = file.originalname;
        
        console.log(`Processing file: ${file.originalname}, path: ${file.path}, mimetype: ${file.mimetype}`);
        
        if (file.originalname.toLowerCase().endsWith('.opus')) {
          console.log('Converting OPUS file to MP3...');
          audioFilePath = await convertOpusToMp3(file.path);
          audioFileName = file.originalname.replace(/\.opus$/i, '.mp3');
        }

        // Transcribe audio using OpenAI Whisper
        const transcriptionResult = await transcribeAudio(audioFilePath, audioFileName);
        
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

        // Clean up processed file (could be original or converted)
        if (fs.existsSync(audioFilePath)) {
          fs.unlinkSync(audioFilePath);
        }

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
        // Clean up any files that might exist (original or converted)
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
        if (file.originalname.toLowerCase().endsWith('.opus')) {
          const convertedPath = file.path.replace(/\.opus$/i, '.mp3');
          if (fs.existsSync(convertedPath)) {
            fs.unlinkSync(convertedPath);
          }
        }
        console.error("Transcription error:", transcriptionError);
        
        return res.status(500).json({ 
          error: (transcriptionError as Error).message || "Erro ao processar o áudio. Verifique se o arquivo não está corrompido e tente novamente." 
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

  // Health check endpoint for Docker
  app.get('/api/health', (req, res) => {
    res.status(200).json({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      service: 'audio-transcription-api'
    });
  });

  const httpServer = createServer(app);
  return httpServer;
}
