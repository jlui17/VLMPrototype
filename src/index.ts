import express from "express";
import { config, initConfig } from "./config.ts";
import videosRouter from "./routes/videos.ts";
import jobsRouter from "./routes/jobs.ts";
import type { Server } from "node:http";

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/videos", videosRouter);
app.use("/jobs", jobsRouter);

export async function startServer(): Promise<Server> {
  await initConfig();
  return new Promise((resolve) => {
    const server = app.listen(config.port, () => {
      console.log(`API server listening on http://localhost:${config.port}`);
      resolve(server);
    });
  });
}

if (import.meta.main) {
  await startServer();
}
