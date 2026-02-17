import { Router } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { config } from "../config.ts";

const upload = multer({ storage: multer.memoryStorage() });
const router = Router();

router.post("/", upload.single("file"), async (req, res) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  const id = randomUUID();
  await config.storage.store(id, file.buffer);
  res.status(201).json({ id });
});

export default router;
