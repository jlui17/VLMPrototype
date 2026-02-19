import { GoogleGenAI, FileState } from "@google/genai";
import type { BlobStorage, StoreResult } from "./storage.ts";
import type { VideoData } from "./video-data.ts";

export class GeminiFileStorage implements BlobStorage {
  readonly storageType = "gemini-file";
  private ai: GoogleGenAI;

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async init(): Promise<void> {}

  async store(id: string, data: Buffer): Promise<StoreResult> {
    const blob = new Blob([data], { type: "video/mp4" });
    let file = await this.ai.files.upload({
      file: blob,
      config: { displayName: id },
    });

    while (file.state === FileState.PROCESSING) {
      await new Promise((r) => setTimeout(r, 2000));
      file = await this.ai.files.get({ name: file.name! });
    }

    if (file.state === FileState.FAILED) {
      throw new Error(`Gemini file upload failed for ${id}: ${file.name}`);
    }

    return { ref: file.name! };
  }

  async fetch(ref: string): Promise<VideoData> {
    const file = await this.ai.files.get({ name: ref });

    if (file.state === FileState.FAILED) {
      throw new Error(`Gemini file "${ref}" is in FAILED state`);
    }

    if (!file.uri) {
      throw new Error(
        `Gemini file "${ref}" has no URI — it may have expired (files expire after 48h)`
      );
    }

    return {
      kind: "gemini-file",
      fileUri: file.uri,
      mimeType: file.mimeType ?? "video/mp4",
    };
  }

  async delete(ref: string): Promise<void> {
    try {
      await this.ai.files.delete({ name: ref });
    } catch (err: any) {
      if (err?.status === 404 || err?.message?.includes("404")) return;
      throw err;
    }
  }
}
