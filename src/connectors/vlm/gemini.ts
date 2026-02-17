import { GoogleGenAI, createPartFromBase64, FileState } from "@google/genai";
import type { VLMProvider, VLMResponse } from "./vlm.ts";

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

  async query(model: string, video: Buffer, question: string): Promise<VLMResponse> {
    const videoPart = video.byteLength <= this.inlineThreshold
      ? this.inlinePart(video)
      : await this.uploadPart(video);

    const response = await this.ai.models.generateContent({
      model,
      contents: [
        { role: "user", parts: [videoPart, { text: question }] },
      ],
    });

    return { answer: response.text ?? "" };
  }

  private inlinePart(video: Buffer) {
    return createPartFromBase64(video.toString("base64"), "video/mp4");
  }

  private async uploadPart(video: Buffer) {
    const blob = new Blob([video], { type: "video/mp4" });
    const upload = await this.ai.files.upload({ file: blob });

    let file = upload;
    while (file.state === FileState.PROCESSING) {
      await new Promise((r) => setTimeout(r, 2000));
      file = await this.ai.files.get({ name: file.name! });
    }

    if (file.state === FileState.FAILED) {
      throw new Error(`Gemini file upload failed: ${file.name}`);
    }

    return { fileData: { fileUri: file.uri!, mimeType: "video/mp4" } };
  }
}
