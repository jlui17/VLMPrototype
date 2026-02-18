import { LocalFileStorage } from "./connectors/storage/local-file.ts";
import { GeminiFileStorage } from "./connectors/storage/gemini-file.ts";
import { StorageRegistry } from "./connectors/storage/registry.ts";
import { SQLiteDatabase } from "./connectors/database/sqlite.ts";
import { GeminiVLM } from "./connectors/vlm/gemini.ts";
import { OpenRouterVLM } from "./connectors/vlm/openrouter.ts";
import { VLMRegistry } from "./connectors/vlm/registry.ts";
import type { BlobStorage } from "./connectors/storage/storage.ts";
import type { Database } from "./connectors/database/database.ts";
import type { VLMProvider } from "./connectors/vlm/vlm.ts";

function createVLMRegistry(): VLMRegistry {
  const providers: VLMProvider[] = [];

  const apiKey = process.env["GEMINI_API_KEY"];
  if (apiKey) {
    providers.push(new GeminiVLM(apiKey));
  }

  const openRouterKey = process.env["OPENROUTER_API_KEY"];
  if (openRouterKey) {
    providers.push(new OpenRouterVLM(openRouterKey));
  }

  return new VLMRegistry(providers);
}

function createStorageRegistry(): StorageRegistry {
  const backends: BlobStorage[] = [
    new LocalFileStorage(process.env["STORAGE_DIR"] ?? "./data/videos"),
  ];

  const apiKey = process.env["GEMINI_API_KEY"];
  if (apiKey) {
    backends.push(new GeminiFileStorage(apiKey));
  }

  return new StorageRegistry(backends);
}

export interface Config {
  port: number;
  apiBaseUrl: string;
  storageRegistry: StorageRegistry;
  defaultStorageType: string;
  database: Database;
  vlmRegistry: VLMRegistry;
  workerPollIntervalMs: number;
}

const storageRegistry = createStorageRegistry();
const database = new SQLiteDatabase(process.env["DB_PATH"] ?? "./data/vlm.db");
const vlmRegistry = createVLMRegistry();

const port = Number(process.env["PORT"] ?? 3000);

export const config: Config = {
  port,
  apiBaseUrl: process.env["API_BASE_URL"] ?? `http://localhost:${port}`,
  storageRegistry,
  defaultStorageType: process.env["DEFAULT_STORAGE_TYPE"] ?? "local",
  database,
  vlmRegistry,
  workerPollIntervalMs: Number(process.env["WORKER_POLL_MS"] ?? 2000),
};

export async function initConfig() {
  await storageRegistry.initAll();
  await database.init();
}
