import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { z } from "zod";
import { storage } from "./storage";
import { uploadAudioSchema, insertTranscriptionSchema } from "@shared/schema";
import { transcribeAudio, type TranscriptionSegment } from "./openai";
import { isVideoFile, extractAudioFromVideo, checkSpeech, segmentsToSrt } from "./speech";
import { buildVideoPackage } from "./package";
import os from "os";
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
async function processAudioChunks(chunks: string[], originalFileName: string, chunkDurationSeconds: number): Promise<{
  text: string;
  duration: number;
  totalChunks: number;
  segments: TranscriptionSegment[];
}> {
  let combinedText = '';
  let totalDuration = 0;
  const allSegments: TranscriptionSegment[] = [];
  
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
      // Chunk timestamps start at 0: shift them so they match the original file
      const offset = i * chunkDurationSeconds;
      for (const seg of result.segments) {
        allSegments.push({ ...seg, start: seg.start + offset, end: seg.end + offset });
      }
      
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
    totalChunks: chunks.length,
    segments: allSegments,
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
    const allowedExtensions = ['.mp3', '.wav', '.m4a', '.mp4', '.mov', '.mkv', '.flac', '.ogg', '.webm', '.mpga', '.oga', '.opus'];
    const filename = file.originalname.toLowerCase();
    const hasValidExtension = allowedExtensions.some(ext => filename.endsWith(ext));
    
    if (hasValidExtension) {
      cb(null, true);
    } else {
      cb(new Error('Formato de arquivo não suportado. Use MP3, WAV, M4A, MP4, MOV, FLAC, OGG, WEBM ou OPUS.'));
    }
  },
});

// Segments are kept next to the stored transcription (MemStorage has no column for them)
const segmentsById = new Map<string, TranscriptionSegment[]>();

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
        } else if (isVideoFile(file.originalname)) {
          // Reels/TikToks: keep only the audio track, much smaller than the video
          console.log('Extracting audio from video...');
          audioFilePath = await extractAudioFromVideo(file.path);
          audioFileName = file.originalname.replace(/\.[^.]+$/, '.mp3');
        }
        
        // Verify file exists and is readable
        if (!fs.existsSync(audioFilePath)) {
          throw new Error(`Processed audio file not found: ${audioFilePath}`);
        }

        // Check if file is too large or too long and needs chunking
        const fileSizeMB = fs.statSync(audioFilePath).size / (1024 * 1024);
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
          const chunkResult = await processAudioChunks(chunks, file.originalname, CHUNK_DURATION_SECONDS);
          
          transcriptionResult = {
            text: chunkResult.text,
            duration: chunkResult.duration,
            segments: chunkResult.segments,
          };
          totalChunks = chunkResult.totalChunks;
          
          console.log(`Completed processing ${totalChunks} chunks. Total duration: ${chunkResult.duration}s`);
        } else {
          // Process single file normally
          console.log('Processing single file...');
          transcriptionResult = await transcribeAudio(audioFilePath, audioFileName);
        }
        
        const processingTime = (Date.now() - startTime) / 1000; // Convert to seconds
        const speech = checkSpeech(transcriptionResult.text, transcriptionResult.segments);
        const finalDuration = transcriptionResult.duration || audioDuration || 0;
        const wordCount = transcriptionResult.text.trim().split(/\s+/).filter(word => word.length > 0).length;

        // Save transcription to storage
        const transcriptionData = {
          filename: file.originalname,
          originalSize: file.size,
          mimeType: file.mimetype,
          duration: finalDuration,
          transcriptionText: transcriptionResult.text,
          wordCount,
          confidence: 0.94, // Whisper doesn't provide confidence, using estimated value
          processingTime,
        };

        const savedTranscription = await storage.createTranscription(transcriptionData);
        segmentsById.set(savedTranscription.id, transcriptionResult.segments);

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
          // New fields (additive: old clients keep working)
          hasSpeech: speech.hasSpeech,
          speechNote: speech.note,
          segments: transcriptionResult.segments,
          srt: segmentsToSrt(transcriptionResult.segments),
        });

      } catch (transcriptionError) {
        // Clean up any files that might exist (original or converted)
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
        for (const leftover of [file.path.replace(/\.opus$/i, '.mp3'), file.path.replace(/\.[^.]+$/, '') + '.audio.mp3']) {
          if (leftover !== file.path && fs.existsSync(leftover)) {
            fs.unlinkSync(leftover);
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
            error: "Arquivo muito grande. O tamanho máximo é 100MB." 
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
        segments: segmentsById.get(transcription.id) || [],
        srt: segmentsToSrt(segmentsById.get(transcription.id) || []),
      });
    } catch (error) {
      console.error("Get transcription error:", error);
      res.status(500).json({ error: "Erro ao buscar transcrição." });
    }
  });

  // Video -> study package (frames + mosaic + cover + audio + transcription) as a zip download.
  // Form fields: videoFile (file), fps (default 8), format ("webp" | "jpg"), transcribe ("0" to skip),
  // name (folder/zip name), and optional texts: legenda, comentarios, leiaMe.
  app.post("/api/package", upload.single('videoFile'), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "Envie o vídeo no campo videoFile." });
    }
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pacote-"));
    const cleanup = () => {
      fs.rmSync(workDir, { recursive: true, force: true });
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    };
    try {
      const body = req.body || {};
      const fps = Math.min(30, Math.max(1, parseFloat(body.fps) || 8));
      const format = body.format === "jpg" ? "jpg" : "webp";
      const safeName = String(body.name || path.parse(req.file.originalname).name)
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^A-Za-z0-9._ -]/g, "_").slice(0, 120) || "video";
      const zipPath = await buildVideoPackage(req.file.path, workDir, {
        fps, format,
        transcribe: body.transcribe !== "0",
        name: safeName,
        legenda: body.legenda, comentarios: body.comentarios, leiaMe: body.leiaMe,
      });
      res.download(zipPath, `${safeName}.zip`, () => cleanup());
    } catch (error) {
      console.error("Package error:", error);
      cleanup();
      res.status(500).json({ error: (error as Error).message || "Erro ao gerar o pacote." });
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
