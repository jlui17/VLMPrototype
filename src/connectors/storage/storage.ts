export interface BlobStorage {
  init(): Promise<void>;
  store(id: string, data: Buffer): Promise<void>;
  fetch(id: string): Promise<Buffer>;
  delete(id: string): Promise<void>;
}
