import type { VLMProvider, VLMResponse } from "./vlm.ts";

export class PlaceholderVLM implements VLMProvider {
  private delayMs: number;

  constructor(delayMs = 500) {
    this.delayMs = delayMs;
  }

  async query(_video: Buffer, _question: string): Promise<VLMResponse> {
    await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    return { answer: "This is a placeholder VLM response." };
  }
}
