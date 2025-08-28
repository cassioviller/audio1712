import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const transcriptions = pgTable("transcriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  filename: text("filename").notNull(),
  originalSize: integer("original_size").notNull(),
  mimeType: text("mime_type").notNull(),
  duration: real("duration"),
  transcriptionText: text("transcription_text").notNull(),
  wordCount: integer("word_count").notNull(),
  confidence: real("confidence"),
  processingTime: real("processing_time").notNull(),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
});

export const insertTranscriptionSchema = createInsertSchema(transcriptions).omit({
  id: true,
  createdAt: true,
});

export type InsertTranscription = z.infer<typeof insertTranscriptionSchema>;
export type Transcription = typeof transcriptions.$inferSelect;

// Request/Response schemas
export const uploadAudioSchema = z.object({
  filename: z.string().min(1),
  size: z.number().max(104857600), // 100MB - chunking handles large files
  mimeType: z.string().regex(/^(audio\/(mpeg|wav|x-m4a|mp4|m4a|mp3|aac|opus|flac|ogg|webm)|application\/octet-stream)$/),
});

export const transcriptionResponseSchema = z.object({
  id: z.string(),
  filename: z.string(),
  transcriptionText: z.string(),
  duration: z.number().optional(),
  wordCount: z.number(),
  confidence: z.number().optional(),
  processingTime: z.number(),
  totalChunks: z.number().optional(),
  createdAt: z.string(),
});

export type UploadAudioRequest = z.infer<typeof uploadAudioSchema>;
export type TranscriptionResponse = z.infer<typeof transcriptionResponseSchema>;
