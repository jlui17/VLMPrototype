import { config } from "./config.ts";
import type { Job } from "./connectors/database/database.ts";

await config.storage.init();

const { apiBaseUrl, workerPollIntervalMs } = config;

console.log(`Worker started (api=${apiBaseUrl}, polling every ${workerPollIntervalMs}ms)`);

async function claimJob(): Promise<Job | null> {
  const res = await fetch(`${apiBaseUrl}/jobs/claim`, { method: "POST" });
  if (res.status === 204) return null;
  return res.json() as Promise<Job>;
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

    console.log(`Processing job ${job.id} (video=${job.videoId}, query="${job.query}")`);

    try {
      const video = await config.storage.fetch(job.videoId);
      const response = await config.vlm.query(video, job.query);
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
