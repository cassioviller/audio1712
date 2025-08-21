import { type Transcription, type InsertTranscription } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  getTranscription(id: string): Promise<Transcription | undefined>;
  createTranscription(transcription: InsertTranscription): Promise<Transcription>;
}

export class MemStorage implements IStorage {
  private transcriptions: Map<string, Transcription>;

  constructor() {
    this.transcriptions = new Map();
  }

  async getTranscription(id: string): Promise<Transcription | undefined> {
    return this.transcriptions.get(id);
  }

  async createTranscription(insertTranscription: InsertTranscription): Promise<Transcription> {
    const id = randomUUID();
    const transcription: Transcription = { 
      ...insertTranscription, 
      id,
      createdAt: new Date(),
      duration: insertTranscription.duration ?? null,
      confidence: insertTranscription.confidence ?? null,
    };
    this.transcriptions.set(id, transcription);
    return transcription;
  }
}

export const storage = new MemStorage();
