export interface BlobStorage {
  store(id: string, data: Buffer): Promise<void>;
  fetch(id: string): Promise<Buffer>;
  delete(id: string): Promise<void>;
}
