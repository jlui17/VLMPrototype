import type { VideoData } from "./video-data.ts";

export type StoreResult = { ref: string; uploadUrl?: string };

export interface BlobStorage {
  readonly storageType: string;
  init(): Promise<void>;
  store(id: string, data: Buffer): Promise<StoreResult>;
  fetch(ref: string): Promise<VideoData>;
  delete(ref: string): Promise<void>;
}
