import { config, initConfig } from "./config.ts";

await initConfig();

console.log(`Worker started (polling every ${config.workerPollIntervalMs}ms)`);

while (true) {
  try {
    const job = await config.database.claimNextPendingJob();
    if (!job) {
      await Bun.sleep(config.workerPollIntervalMs);
      continue;
    }

    console.log(`Processing job ${job.id} (video=${job.videoId}, query="${job.query}")`);

    try {
      const video = await config.storage.fetch(job.videoId);
      const response = await config.vlm.query(video, job.query);
      await config.database.completeJob(job.id, response.answer);
      console.log(`Job ${job.id} completed`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await config.database.failJob(job.id, message);
      console.error(`Job ${job.id} failed: ${message}`);
    }
  } catch (err) {
    console.error("Worker loop error:", err);
    await Bun.sleep(config.workerPollIntervalMs);
  }
}
