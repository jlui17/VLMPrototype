import type { VideoData } from "../storage/video-data.ts";

export class InvalidVideoError extends Error {
  readonly reason: string;

  constructor(reason: string, message: string) {
    super(message);
    this.name = "InvalidVideoError";
    this.reason = reason;
  }
}

export interface VLMResponse {
  answer: string;
}

export interface VLMProvider {
  canHandle(model: string): boolean;
  validateVideo(video: { storageType: string; size: number }): InvalidVideoError | null;
  query(model: string, video: VideoData, question: string): Promise<VLMResponse>;
}
