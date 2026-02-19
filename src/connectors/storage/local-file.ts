import { mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { BlobStorage, StoreResult } from "./storage.ts";
import type { VideoData } from "./video-data.ts";

export class LocalFileStorage implements BlobStorage {
  readonly storageType = "local";
  private dir: string;

  constructor(dir = "./data/videos") {
    this.dir = dir;
  }

  async init() {
    await mkdir(this.dir, { recursive: true });
  }

  async store(id: string, data: Buffer): Promise<StoreResult> {
    await Bun.write(join(this.dir, id), data);
    return { ref: id };
  }

  async fetch(ref: string): Promise<VideoData> {
    const file = Bun.file(join(this.dir, ref));
    return { kind: "buffer", data: Buffer.from(await file.arrayBuffer()) };
  }

  async delete(ref: string): Promise<void> {
    await unlink(join(this.dir, ref));
  }
}
