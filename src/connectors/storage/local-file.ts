import { mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { BlobStorage } from "./storage.ts";

export class LocalFileStorage implements BlobStorage {
  private dir: string;

  constructor(dir = "./data/videos") {
    this.dir = dir;
  }

  async init() {
    await mkdir(this.dir, { recursive: true });
  }

  async store(id: string, data: Buffer): Promise<void> {
    await Bun.write(join(this.dir, id), data);
  }

  async fetch(id: string): Promise<Buffer> {
    const file = Bun.file(join(this.dir, id));
    return Buffer.from(await file.arrayBuffer());
  }

  async delete(id: string): Promise<void> {
    await unlink(join(this.dir, id));
  }
}
