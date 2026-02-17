import { Router } from "express";
import { config } from "../config.ts";

const router = Router();

router.post("/", async (req, res) => {
  const { videoId, query } = req.body ?? {};
  if (!videoId || !query) {
    res.status(400).json({ error: "videoId and query are required" });
    return;
  }

  const job = await config.database.createJob(videoId, query);
  res.status(201).json({ jobId: job.id });
});

router.get("/", async (_req, res) => {
  const jobs = await config.database.listJobs();
  res.json(jobs.map((job) => ({
    id: job.id,
    videoId: job.videoId,
    status: job.status,
    createdAt: job.createdAt,
  })));
});

router.get("/:id", async (req, res) => {
  const job = await config.database.getJob(req.params.id);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  res.json({
    id: job.id,
    status: job.status,
    result: job.result,
    createdAt: job.createdAt,
  });
});

export default router;
