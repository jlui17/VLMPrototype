import { InvalidVideoError } from "./vlm.ts";
import type { VLMProvider, VLMResponse } from "./vlm.ts";
import type { VideoData } from "../storage/video-data.ts";

export class OpenRouterVLM implements VLMProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  canHandle(model: string): boolean {
    return model.includes("/");
  }

  validateVideo(video: { storageType: string; size: number }): InvalidVideoError | null {
    if (video.storageType === "gemini-file") {
      return new InvalidVideoError(
        "unsupported-storage",
        `OpenRouter cannot consume Gemini file URIs. Re-upload the video with storageType "local".`,
      );
    }
    return null;
  }

  async query(model: string, video: VideoData, question: string): Promise<VLMResponse> {
    if (video.kind !== "buffer") {
      throw new InvalidVideoError(
        "unsupported-video-kind",
        `OpenRouter requires a buffer video, got "${video.kind}".`,
      );
    }

    const dataUrl = `data:video/mp4;base64,${video.data.toString("base64")}`;

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: [
              { type: "video_url", video_url: { url: dataUrl } },
              { type: "text", text: question },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`OpenRouter returned ${res.status}: ${body}`);
    }

    const json = await res.json();

    if (json.error) {
      throw new Error(`OpenRouter error: ${json.error.message ?? JSON.stringify(json.error)}`);
    }

    const answer = json.choices?.[0]?.message?.content ?? "";
    return { answer };
  }
}
