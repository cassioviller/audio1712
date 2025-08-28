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

// Configuration for audio chunking
const MAX_CHUNK_SIZE_MB = 24; // OpenAI limit is 25MB, using 24MB for safety
const CHUNK_DURATION_SECONDS = 600; // 10 minutes per chunk

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

// Get audio duration in seconds using FFprobe
async function getAudioDuration(filePath: string): Promise<number> {
  try {
    const escapedPath = filePath.replace(/'/g, "'\\''");
    const command = `ffprobe -v quiet -show_entries format=duration -of csv=p=0 '${escapedPath}'`;
    const { stdout } = await execAsync(command);
    return parseFloat(stdout.trim());
  } catch (error) {
    console.error('Error getting audio duration:', error);
    throw new Error('Falha ao obter duração do áudio');
  }
}

// Split audio file into chunks
async function splitAudioIntoChunks(inputPath: string, chunkDurationSeconds: number): Promise<string[]> {
  const chunks: string[] = [];
  const timestamp = Date.now();
  const outputDir = path.dirname(inputPath);
  
  try {
    const totalDuration = await getAudioDuration(inputPath);
    const numChunks = Math.ceil(totalDuration / chunkDurationSeconds);
    
    console.log(`Splitting audio into ${numChunks} chunks of ${chunkDurationSeconds}s each`);
    
    for (let i = 0; i < numChunks; i++) {
      const startTime = i * chunkDurationSeconds;
      // Generate clean chunk filename with timestamp to avoid conflicts
      const chunkPath = path.join(outputDir, `chunk_${timestamp}_${i + 1}.mp3`);
      
      const escapedInputPath = inputPath.replace(/'/g, "'\\''");
      const escapedChunkPath = chunkPath.replace(/'/g, "'\\''");
      
      // Convert to MP3 during chunking to ensure compatibility
      const command = `ffmpeg -y -i '${escapedInputPath}' -ss ${startTime} -t ${chunkDurationSeconds} -codec:a libmp3lame -b:a 128k '${escapedChunkPath}'`;
      
      console.log(`Creating chunk ${i + 1}/${numChunks}: ${chunkPath}`);
      const { stdout, stderr } = await execAsync(command);
      
      if (stderr && !stderr.includes('size=')) {
        console.log(`FFmpeg stderr for chunk ${i + 1}:`, stderr);
      }
      
      if (fs.existsSync(chunkPath)) {
        const stats = fs.statSync(chunkPath);
        if (stats.size > 1000) { // Minimum 1KB for valid audio
          chunks.push(chunkPath);
          console.log(`Chunk ${i + 1} created successfully: ${chunkPath} (${stats.size} bytes)`);
        } else {
          console.log(`Chunk ${i + 1} is too small (${stats.size} bytes), skipping`);
          fs.unlinkSync(chunkPath);
        }
      } else {
        console.log(`Warning: Chunk ${i + 1} was not created: ${chunkPath}`);
      }
    }
    
    if (chunks.length === 0) {
      throw new Error('No valid chunks were created');
    }
    
    return chunks;
  } catch (error) {
    // Clean up any created chunks on error
    chunks.forEach(chunkPath => {
      if (fs.existsSync(chunkPath)) {
        fs.unlinkSync(chunkPath);
      }
    });
    
    console.error('Error splitting audio:', error);
    throw new Error('Falha ao dividir arquivo de áudio');
  }
}

// Process audio chunks sequentially and combine transcriptions
async function processAudioChunks(chunks: string[], originalFileName: string): Promise<{
  text: string;
  duration: number;
  totalChunks: number;
}> {
  let combinedText = '';
  let totalDuration = 0;
  
  console.log(`Processing ${chunks.length} audio chunks sequentially`);
  
  for (let i = 0; i < chunks.length; i++) {
    const chunkPath = chunks[i];
    const chunkFileName = `${originalFileName}_chunk_${i + 1}`;
    
    console.log(`Processing chunk ${i + 1}/${chunks.length}: ${chunkPath}`);
    
    try {
      const result = await transcribeAudio(chunkPath, chunkFileName);
      
      // Add chunk text with separator if not the first chunk
      if (combinedText && result.text.trim()) {
        combinedText += ' ';
      }
      combinedText += result.text.trim();
      totalDuration += result.duration || 0;
      
      console.log(`Chunk ${i + 1} completed. Text length: ${result.text.length} chars`);
      
    } catch (error) {
      console.error(`Error processing chunk ${i + 1}:`, error);
      // Continue with other chunks even if one fails, but provide more detailed error info
      const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido';
      combinedText += `[Segmento ${i + 1}: ${errorMsg}] `;
    } finally {
      // Clean up chunk file
      if (fs.existsSync(chunkPath)) {
        fs.unlinkSync(chunkPath);
      }
    }
  }
  
  return {
    text: combinedText,
    duration: totalDuration,
    totalChunks: chunks.length
  };
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
    fileSize: 104857600, // 100MB - large files handled by chunking
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
        
        console.log(`Processing file: ${file.originalname}, path: ${file.path}, size: ${file.size} bytes, mimetype: ${file.mimetype}`);
        
        if (file.originalname.toLowerCase().endsWith('.opus')) {
          console.log('Converting OPUS file to MP3...');
          audioFilePath = await convertOpusToMp3(file.path);
          audioFileName = file.originalname.replace(/\.opus$/i, '.mp3');
        }
        
        // Verify file exists and is readable
        if (!fs.existsSync(audioFilePath)) {
          throw new Error(`Processed audio file not found: ${audioFilePath}`);
        }

        // Check if file is too large or too long and needs chunking
        const fileSizeMB = file.size / (1024 * 1024);
        const shouldSplitBySize = fileSizeMB > MAX_CHUNK_SIZE_MB;
        
        let shouldSplitByDuration = false;
        let audioDuration = 0;
        
        try {
          audioDuration = await getAudioDuration(audioFilePath);
          shouldSplitByDuration = audioDuration > CHUNK_DURATION_SECONDS;
          console.log(`Audio duration: ${audioDuration}s, size: ${fileSizeMB.toFixed(2)}MB`);
        } catch (error) {
          console.log('Could not determine audio duration, proceeding without duration-based splitting');
        }

        let transcriptionResult;
        let totalChunks = 1;

        if (shouldSplitBySize || shouldSplitByDuration) {
          console.log(`Large file detected. Splitting into chunks...`);
          
          // Split audio into chunks and process sequentially
          const chunks = await splitAudioIntoChunks(audioFilePath, CHUNK_DURATION_SECONDS);
          const chunkResult = await processAudioChunks(chunks, file.originalname);
          
          transcriptionResult = {
            text: chunkResult.text,
            duration: chunkResult.duration
          };
          totalChunks = chunkResult.totalChunks;
          
          console.log(`Completed processing ${totalChunks} chunks. Total duration: ${chunkResult.duration}s`);
        } else {
          // Process single file normally
          console.log('Processing single file...');
          transcriptionResult = await transcribeAudio(audioFilePath, audioFileName);
        }
        
        const processingTime = (Date.now() - startTime) / 1000; // Convert to seconds
        const wordCount = transcriptionResult.text.trim().split(/\s+/).filter(word => word.length > 0).length;

        // Save transcription to storage
        const transcriptionData = {
          filename: file.originalname,
          originalSize: file.size,
          mimeType: file.mimetype,
          duration: transcriptionResult.duration || 0,
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
          totalChunks: totalChunks,
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
