import { GoogleGenAI, createPartFromBase64 } from "@google/genai";
import { InvalidVideoError } from "./vlm.ts";
import type { VLMProvider, VLMResponse } from "./vlm.ts";
import type { VideoData } from "../storage/video-data.ts";

const TWENTY_MB = 20 * 1024 * 1024;

export class GeminiVLM implements VLMProvider {
  private ai: GoogleGenAI;
  private inlineThreshold: number;

  constructor(apiKey: string, inlineThreshold = TWENTY_MB) {
    this.ai = new GoogleGenAI({ apiKey });
    this.inlineThreshold = inlineThreshold;
  }

  canHandle(model: string): boolean {
    return model.startsWith("gemini-");
  }

  validateVideo(video: { storageType: string; size: number }): InvalidVideoError | null {
    if (video.storageType !== "gemini-file" && video.size > this.inlineThreshold) {
      return new InvalidVideoError(
        "exceeds-inline-threshold",
        `Video is ${video.size} bytes which exceeds the ${this.inlineThreshold}-byte inline limit. Re-upload with storageType "gemini-file".`,
      );
    }
    return null;
  }

  async query(model: string, video: VideoData, question: string): Promise<VLMResponse> {
    const part = this.toPart(video);

    const response = await this.ai.models.generateContent({
      model,
      contents: [
        { role: "user", parts: [part, { text: question }] },
      ],
    });

    return { answer: response.text ?? "" };
  }

  private toPart(video: VideoData) {
    switch (video.kind) {
      case "gemini-file":
        return { fileData: { fileUri: video.fileUri, mimeType: video.mimeType } };
      case "buffer":
        if (video.data.byteLength > this.inlineThreshold) {
          throw new InvalidVideoError(
            "exceeds-inline-threshold",
            `Buffer is ${video.data.byteLength} bytes which exceeds the ${this.inlineThreshold}-byte inline limit. Use gemini-file storage for large videos.`,
          );
        }
        return createPartFromBase64(video.data.toString("base64"), "video/mp4");
      default:
        throw new InvalidVideoError(
          "unknown-video-kind",
          `Unknown video kind: ${(video as { kind: string }).kind}`,
        );
    }
  }
}
