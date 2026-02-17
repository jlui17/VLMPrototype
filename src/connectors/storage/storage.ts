import type { VideoData } from "./video-data.ts";

export interface BlobStorage {
  readonly storageType: string;
  init(): Promise<void>;
  store(id: string, data: Buffer): Promise<string>;
  fetch(ref: string): Promise<VideoData>;
  delete(ref: string): Promise<void>;
}
