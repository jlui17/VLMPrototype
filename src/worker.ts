import { config } from "./config.ts";
import type { Job, Video } from "./connectors/database/database.ts";

await config.storageRegistry.initAll();

const { apiBaseUrl, workerPollIntervalMs } = config;

console.log(`Worker started (api=${apiBaseUrl}, polling every ${workerPollIntervalMs}ms)`);

async function claimJob(): Promise<Job | null> {
  const res = await fetch(`${apiBaseUrl}/jobs/claim`, { method: "POST" });
  if (res.status === 204) return null;
  return res.json() as Promise<Job>;
}

async function getVideo(id: string): Promise<Video | null> {
  const res = await fetch(`${apiBaseUrl}/videos/${id}`);
  if (res.status === 404) return null;
  return res.json() as Promise<Video>;
}

async function completeJob(id: string, result: string): Promise<void> {
  await fetch(`${apiBaseUrl}/jobs/${id}/complete`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ result }),
  });
}

async function failJob(id: string, error: string): Promise<void> {
  await fetch(`${apiBaseUrl}/jobs/${id}/fail`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ error }),
  });
}

while (true) {
  try {
    const job = await claimJob();
    if (!job) {
      await Bun.sleep(workerPollIntervalMs);
      continue;
    }

    console.log(`Processing job ${job.id} (video=${job.videoId}, model=${job.model}, query="${job.query}")`);

    try {
      const provider = config.vlmRegistry.findProvider(job.model);
      if (!provider) {
        await failJob(job.id, `No provider available for model "${job.model}"`);
        console.error(`Job ${job.id} failed: no provider for model "${job.model}"`);
        continue;
      }

      const video = await getVideo(job.videoId);
      if (!video) {
        await failJob(job.id, `Video "${job.videoId}" not found`);
        console.error(`Job ${job.id} failed: video "${job.videoId}" not found`);
        continue;
      }

      const backend = config.storageRegistry.get(video.storageType);
      if (!backend) {
        await failJob(job.id, `No storage backend for type "${video.storageType}"`);
        console.error(`Job ${job.id} failed: no storage backend for type "${video.storageType}"`);
        continue;
      }

      const videoData = await backend.fetch(video.storageRef);
      const response = await provider.query(job.model, videoData, job.query);
      await completeJob(job.id, response.answer);
      console.log(`Job ${job.id} completed`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await failJob(job.id, message);
      console.error(`Job ${job.id} failed: ${message}`);
    }
  } catch (err) {
    console.error("Worker loop error:", err);
    await Bun.sleep(workerPollIntervalMs);
  }
}
