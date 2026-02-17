import type { BlobStorage } from "./storage.ts";

export class StorageRegistry {
  private backends: Map<string, BlobStorage>;

  constructor(backends: BlobStorage[]) {
    this.backends = new Map(backends.map((b) => [b.storageType, b]));
  }

  get(storageType: string): BlobStorage | null {
    return this.backends.get(storageType) ?? null;
  }

  has(storageType: string): boolean {
    return this.backends.has(storageType);
  }

  async initAll(): Promise<void> {
    for (const backend of this.backends.values()) {
      await backend.init();
    }
  }

  types(): string[] {
    return [...this.backends.keys()];
  }
}
