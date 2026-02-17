import type { VLMProvider, VLMResponse } from "./vlm.ts";

export class PlaceholderVLM implements VLMProvider {
  private delayMs: number;

  constructor(delayMs = 500) {
    this.delayMs = delayMs;
  }

  canHandle(model: string): boolean {
    return model === "placeholder";
  }

  async query(_model: string, _video: Buffer, _question: string): Promise<VLMResponse> {
    await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    return { answer: "This is a placeholder VLM response." };
  }
}
