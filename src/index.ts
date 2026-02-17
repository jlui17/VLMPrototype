import express from "express";
import { config, initConfig } from "./config.ts";
import videosRouter from "./routes/videos.ts";
import jobsRouter from "./routes/jobs.ts";

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/videos", videosRouter);
app.use("/jobs", jobsRouter);

await initConfig();

app.listen(config.port, () => {
  console.log(`API server listening on http://localhost:${config.port}`);
});
