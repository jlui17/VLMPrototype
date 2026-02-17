import { LocalFileStorage } from "./connectors/storage/local-file.ts";
import { SQLiteDatabase } from "./connectors/database/sqlite.ts";
import { PlaceholderVLM } from "./connectors/vlm/placeholder.ts";
import type { BlobStorage } from "./connectors/storage/storage.ts";
import type { Database } from "./connectors/database/database.ts";
import type { VLMProvider } from "./connectors/vlm/vlm.ts";

export interface Config {
  port: number;
  apiBaseUrl: string;
  storage: BlobStorage;
  database: Database;
  vlm: VLMProvider;
  workerPollIntervalMs: number;
}

const storage = new LocalFileStorage(process.env["STORAGE_DIR"] ?? "./data/videos");
const database = new SQLiteDatabase(process.env["DB_PATH"] ?? "./data/vlm.db");
const vlm = new PlaceholderVLM();

const port = Number(process.env["PORT"] ?? 3000);

export const config: Config = {
  port,
  apiBaseUrl: process.env["API_BASE_URL"] ?? `http://localhost:${port}`,
  storage,
  database,
  vlm,
  workerPollIntervalMs: Number(process.env["WORKER_POLL_MS"] ?? 2000),
};

export async function initConfig() {
  await storage.init();
  await database.init();
}
