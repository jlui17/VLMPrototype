import { Router } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { config } from "../config.ts";

const upload = multer({ storage: multer.memoryStorage() });
const router = Router();

router.post("/", upload.single("file"), async (req, res) => {
  const file = req.file;
  const storageType = (req.body?.storageType as string) || config.defaultStorageType;
  const backend = config.storageRegistry.get(storageType);
  if (!backend) {
    res.status(422).json({
      error: `Unknown storage type "${storageType}". Available: ${config.storageRegistry.types().join(", ")}`,
    });
    return;
  }

  let filename: string;
  let size: number;

  if (backend.storageType === "s3") {
    filename = req.body?.filename as string;
    size = Number(req.body?.size);
    if (!filename || !Number.isFinite(size) || size <= 0) {
      res.status(400).json({ error: "S3 storage requires filename and size in the request body" });
      return;
    }
  } else {
    if (!file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }
    filename = file.originalname;
    size = file.size;
  }

  const id = randomUUID();
  const result = await backend.store(id, file?.buffer ?? Buffer.alloc(0));
  await config.database.createVideo(id, filename, size, storageType, result.ref);

  const response: Record<string, string> = { id };
  if (result.uploadUrl) response.uploadUrl = result.uploadUrl;
  res.status(201).json(response);
});

router.get("/", async (_req, res) => {
  const videos = await config.database.listVideos();
  res.json(videos);
});

router.get("/:id", async (req, res) => {
  const video = await config.database.getVideo(req.params.id);
  if (!video) {
    res.status(404).json({ error: "Video not found" });
    return;
  }
  res.json(video);
});

router.patch("/:id", async (req, res) => {
  const { filename } = req.body;
  if (!filename || typeof filename !== "string") {
    res.status(400).json({ error: "filename is required and must be a non-empty string" });
    return;
  }
  const video = await config.database.renameVideo(req.params.id, filename);
  if (!video) {
    res.status(404).json({ error: "Video not found" });
    return;
  }
  res.json(video);
});

router.delete("/:id", async (req, res) => {
  const video = await config.database.getVideo(req.params.id);
  if (!video) {
    res.status(404).json({ error: "Video not found" });
    return;
  }

  const deleted = await config.database.deleteVideo(req.params.id);
  if (!deleted) {
    res.status(404).json({ error: "Video not found" });
    return;
  }

  const backend = config.storageRegistry.get(video.storageType);
  if (backend) {
    await backend.delete(video.storageRef);
  }

  res.status(204).end();
});

export default router;
