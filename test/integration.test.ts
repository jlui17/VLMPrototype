// Set test-specific env vars BEFORE any imports that read config.
// NOTE: static imports are hoisted, so we use dynamic import() for
// startServer/startWorker inside beforeAll to ensure env vars are set first.
process.env["STORAGE_DIR"] = "/tmp/VLMPrototype/data/test-videos";
process.env["DB_PATH"] = "/tmp/VLMPrototype/data/test-vlm.db";

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import type { Server } from "node:http";

// ---------------------------------------------------------------------------
// Environment-based skip flags
// ---------------------------------------------------------------------------
const HAS_GEMINI_KEY = !!process.env["GEMINI_API_KEY"];
const HAS_S3_BUCKET = !!process.env["S3_BUCKET"];
const HAS_OPENROUTER = !!process.env["OPENROUTER_API_KEY"];
const HAS_ANY_VLM = HAS_GEMINI_KEY || HAS_OPENROUTER;
const HAS_S3_VLM = HAS_S3_BUCKET && HAS_ANY_VLM;

const TEST_VIDEO_PATH = process.env["TEST_VIDEO_PATH"];
const HAS_TEST_VIDEO = !!TEST_VIDEO_PATH && existsSync(TEST_VIDEO_PATH);

// Pick the first available model for generic job tests
const TEST_MODEL = HAS_GEMINI_KEY
  ? "gemini-3-flash-preview"
  : "openrouter/free"; // OpenRouter free model

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const BASE_URL = process.env["TEST_BASE_URL"] || "http://localhost:3000";

async function api(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, init);
}

async function uploadVideo(
  buffer: Buffer,
  filename: string,
  storageType?: string,
): Promise<Response> {
  const form = new FormData();
  form.append("file", new Blob([buffer]), filename);
  if (storageType) form.append("storageType", storageType);
  return api("/videos", { method: "POST", body: form });
}

async function createJob(body: Record<string, unknown>): Promise<Response> {
  return api("/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function waitForJob(jobId: string, timeoutMs = 60_000): Promise<{ status: string; result?: string; error?: string }> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await api(`/jobs/${jobId}`);
    if (res.status !== 200) throw new Error(`GET /jobs/${jobId} returned ${res.status}`);
    const job = await res.json();
    if (job.status === "completed" || job.status === "failed") return job;
    await Bun.sleep(500);
  }
  throw new Error(`Job ${jobId} did not finish within ${timeoutMs}ms`);
}

// ---------------------------------------------------------------------------
// Server & worker lifecycle
// ---------------------------------------------------------------------------
let server: Server;

let sharedVideoId: string;
let testVideoBuffer: Buffer;

beforeAll(async () => {
  const { startServer } = await import("../src/index.ts");
  server = await startServer();

  // Load real video file for gemini-file tests if provided
  if (HAS_TEST_VIDEO) {
    testVideoBuffer = Buffer.from(await Bun.file(TEST_VIDEO_PATH!).arrayBuffer());
  }

  // Upload a shared local video for use across tests
  const buf = testVideoBuffer;
  const uploadRes = await uploadVideo(buf, "shared-test.mp4");
  expect(uploadRes.status).toBe(201);
  const body = await uploadRes.json();
  sharedVideoId = body.id;
});

afterAll(async () => {
  // Sweep: delete all videos via API (cleans up storage backends too)
  try {
    const listRes = await api("/videos");
    if (listRes.status === 200) {
      const videos: { id: string }[] = await listRes.json();
      for (const video of videos) {
        try { await api(`/videos/${video.id}`, { method: "DELETE" }); } catch {}
      }
    }
  } catch {}

  // Stop server
  await new Promise<void>((resolve) => server.close(() => resolve()));

  // Clean up test storage directory and database
  await rm("/tmp/VLMPrototype/data/test-videos", { recursive: true, force: true });
  await rm("/tmp/VLMPrototype/data/test-vlm.db", { force: true });
});

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------
describe("Health", () => {
  test("GET /health returns 200 with status ok", async () => {
    const res = await api("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});

// ---------------------------------------------------------------------------
// Videos - Local Storage
// ---------------------------------------------------------------------------
describe("Videos - Local Storage", () => {
  let uploadedId: string;

  test("Upload file", async () => {
    const buf = testVideoBuffer;
    const res = await uploadVideo(buf, "local-test.mp4");
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toHaveProperty("id");
    expect(typeof body.id).toBe("string");
    uploadedId = body.id;
  });

  test("List videos", async () => {
    const res = await api("/videos");
    expect(res.status).toBe(200);
    const videos = await res.json();
    expect(Array.isArray(videos)).toBe(true);
    const ids = videos.map((v: { id: string }) => v.id);
    expect(ids).toContain(uploadedId);
  });

  test("Get video by id", async () => {
    const res = await api(`/videos/${uploadedId}`);
    expect(res.status).toBe(200);
    const video = await res.json();
    expect(video.filename).toBe("local-test.mp4");
    expect(video.size).toBe(testVideoBuffer.length);
    expect(video.storageType).toBe("local");
  });

  test("Rename video", async () => {
    const res = await api(`/videos/${uploadedId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: "renamed-test.mp4" }),
    });
    expect(res.status).toBe(200);
    const video = await res.json();
    expect(video.filename).toBe("renamed-test.mp4");
  });

  test("Get reflects rename", async () => {
    const res = await api(`/videos/${uploadedId}`);
    expect(res.status).toBe(200);
    const video = await res.json();
    expect(video.filename).toBe("renamed-test.mp4");
  });

  test("Delete video", async () => {
    const res = await api(`/videos/${uploadedId}`, { method: "DELETE" });
    expect(res.status).toBe(204);
  });

  test("Get after delete returns 404", async () => {
    const res = await api(`/videos/${uploadedId}`);
    expect(res.status).toBe(404);
  });

  test("Upload with no file returns 400", async () => {
    const form = new FormData();
    const res = await api("/videos", { method: "POST", body: form });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("No file uploaded");
  });

  test("Upload with bad storageType returns 422", async () => {
    const res = await uploadVideo(testVideoBuffer, "test.mp4", "nonexistent-backend");
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toContain("Unknown storage type");
  });

  test("Rename with empty body returns 400", async () => {
    const res = await api(`/videos/${sharedVideoId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("filename is required and must be a non-empty string");
  });

  test("Rename non-existent video returns 404", async () => {
    const res = await api("/videos/00000000-0000-0000-0000-000000000000", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: "nope.mp4" }),
    });
    expect(res.status).toBe(404);
  });

  test("Delete non-existent video returns 404", async () => {
    const res = await api("/videos/00000000-0000-0000-0000-000000000000", {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Videos - Gemini File Storage
// ---------------------------------------------------------------------------
describe.skipIf(!HAS_GEMINI_KEY || !HAS_TEST_VIDEO)("Videos - Gemini File Storage", () => {
  let geminiVideoId: string;

  test("Upload with storageType gemini-file", async () => {
    const buf = testVideoBuffer;
    const res = await uploadVideo(buf, "gemini-test.mp4", "gemini-file");
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toHaveProperty("id");
    geminiVideoId = body.id;
  });

  test("Get shows storageType gemini-file", async () => {
    const res = await api(`/videos/${geminiVideoId}`);
    expect(res.status).toBe(200);
    const video = await res.json();
    expect(video.storageType).toBe("gemini-file");
  });

  test("Delete", async () => {
    const res = await api(`/videos/${geminiVideoId}`, { method: "DELETE" });
    expect(res.status).toBe(204);
  });
});

// ---------------------------------------------------------------------------
// Videos - S3 Storage
// ---------------------------------------------------------------------------
describe.skipIf(!HAS_S3_BUCKET)("Videos - S3 Storage", () => {
  let s3VideoId: string;

  test("Upload with storageType s3", async () => {
    const res = await api("/videos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storageType: "s3", filename: "s3-test.mp4", size: 4096 }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toHaveProperty("id");
    expect(body).toHaveProperty("uploadUrl");
    s3VideoId = body.id;
  });

  test("Get shows storageType s3", async () => {
    const res = await api(`/videos/${s3VideoId}`);
    expect(res.status).toBe(200);
    const video = await res.json();
    expect(video.storageType).toBe("s3");
  });

  test("S3 upload missing filename returns 400", async () => {
    const res = await api("/videos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storageType: "s3", size: 4096 }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("S3 storage requires filename and size in the request body");
  });

  test("S3 upload missing size returns 400", async () => {
    const res = await api("/videos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storageType: "s3", filename: "missing-size.mp4" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("S3 storage requires filename and size in the request body");
  });

  test("Delete", async () => {
    const res = await api(`/videos/${s3VideoId}`, { method: "DELETE" });
    expect(res.status).toBe(204);
  });
});

// ---------------------------------------------------------------------------
// Jobs - CRUD & Lifecycle
// ---------------------------------------------------------------------------
describe.skipIf(!HAS_ANY_VLM)("Jobs - CRUD & Lifecycle", () => {
  let jobId: string;
  const TEST_QUERY = "What is in this video?";

  test("Create job", async () => {
    const res = await createJob({
      videoId: sharedVideoId,
      query: TEST_QUERY,
      model: TEST_MODEL,
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toHaveProperty("jobId");
    jobId = body.jobId;
  });

  test("List jobs", async () => {
    const res = await api("/jobs");
    expect(res.status).toBe(200);
    const jobs = await res.json();
    expect(Array.isArray(jobs)).toBe(true);
    const found = jobs.find((j: { id: string }) => j.id === jobId);
    expect(found).toBeDefined();
    expect(found.status).toBe("pending");
  });

  test("Get job", async () => {
    const res = await api(`/jobs/${jobId}`);
    expect(res.status).toBe(200);
    const job = await res.json();
    expect(job.status).toBe("pending");
    expect(job.result).toBeNull();
  });

  test("Claim job", async () => {
    const res = await api("/jobs/claim", { method: "POST" });
    expect(res.status).toBe(200);
    const job = await res.json();
    expect(job.status).toBe("processing");
    expect(job.id).toBe(jobId);
  });

  test("Get after claim", async () => {
    const res = await api(`/jobs/${jobId}`);
    expect(res.status).toBe(200);
    const job = await res.json();
    expect(job.status).toBe("processing");
  });

  test("Complete job", async () => {
    const res = await api(`/jobs/${jobId}/complete`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ result: "Test answer" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  test("Get after complete", async () => {
    const res = await api(`/jobs/${jobId}`);
    expect(res.status).toBe(200);
    const job = await res.json();
    expect(job.status).toBe("completed");
    expect(job.result).toBe("Test answer");
  });

  test("Claim with empty queue", async () => {
    const res = await api("/jobs/claim", { method: "POST" });
    // Should be 200 with null body or 204 with no content
    expect([200, 204]).toContain(res.status);
  });

  test("Full fail lifecycle", async () => {
    // Create
    const createRes = await createJob({
      videoId: sharedVideoId,
      query: "fail test",
      model: TEST_MODEL,
    });
    expect(createRes.status).toBe(201);
    const { jobId: failJobId } = await createRes.json();

    // Claim
    const claimRes = await api("/jobs/claim", { method: "POST" });
    expect(claimRes.status).toBe(200);
    const claimed = await claimRes.json();
    expect(claimed.id).toBe(failJobId);

    // Fail
    const failRes = await api(`/jobs/${failJobId}/fail`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Something went wrong" }),
    });
    expect(failRes.status).toBe(200);
    expect(await failRes.json()).toEqual({ ok: true });

    // Verify
    const getRes = await api(`/jobs/${failJobId}`);
    expect(getRes.status).toBe(200);
    const job = await getRes.json();
    expect(job.status).toBe("failed");
  });
});

// ---------------------------------------------------------------------------
// Jobs - Validation Errors
// ---------------------------------------------------------------------------
describe.skipIf(!HAS_ANY_VLM)("Jobs - Validation Errors", () => {
  test("Missing videoId and query returns 400", async () => {
    const res = await createJob({});
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("videoId and query are required");
  });

  test("Missing query returns 400", async () => {
    const res = await createJob({ videoId: sharedVideoId });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("videoId and query are required");
  });

  test("Unknown model returns 422", async () => {
    const res = await createJob({
      videoId: sharedVideoId,
      query: "test",
      model: "nonexistent-model-xyz",
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toContain("not available");
  });

  test("Non-existent video returns 404", async () => {
    const res = await createJob({
      videoId: "00000000-0000-0000-0000-000000000000",
      query: "test",
      model: TEST_MODEL,
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Video not found");
  });

  test("Complete with missing result returns 400", async () => {
    const res = await api("/jobs/00000000-0000-0000-0000-000000000000/complete", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("result is required");
  });

  test("Fail with missing error returns 400", async () => {
    const res = await api("/jobs/00000000-0000-0000-0000-000000000000/fail", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("error is required");
  });

  test("Get non-existent job returns 404", async () => {
    const res = await api("/jobs/00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Job not found");
  });
});

// ---------------------------------------------------------------------------
// Jobs - Gemini VLM Validation
// ---------------------------------------------------------------------------
describe.skipIf(!HAS_GEMINI_KEY)("Jobs - Gemini VLM Validation", () => {
  let largeVideoId: string;

  test("Reject >20MB local video for gemini model", async () => {
    const OVER_20MB = 20 * 1024 * 1024 + 1;
    const buf = Buffer.alloc(OVER_20MB, 0x00);
    const res = await uploadVideo(buf, "large-test.mp4");
    expect(res.status).toBe(201);
    const body = await res.json();
    largeVideoId = body.id;

    // Now try to create a job with a gemini model
    const jobRes = await createJob({
      videoId: largeVideoId,
      query: "describe this",
      model: "gemini-3-flash-preview",
    });
    expect(jobRes.status).toBe(422);
    const jobBody = await jobRes.json();
    expect(jobBody.error).toContain("inline limit");
  });

  test.skipIf(!HAS_S3_BUCKET)("Reject >20MB S3 video for gemini model", async () => {
    // Register an S3 video with size > 20MB (no actual upload needed — validation is size-based)
    const res = await api("/videos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storageType: "s3", filename: "large-s3.mp4", size: 20 * 1024 * 1024 + 1 }),
    });
    expect(res.status).toBe(201);
    const { id } = await res.json();

    const jobRes = await createJob({ videoId: id, query: "describe this", model: "gemini-3-flash-preview" });
    expect(jobRes.status).toBe(422);
    const jobBody = await jobRes.json();
    expect(jobBody.error).toContain("inline limit");
  });
});

// ---------------------------------------------------------------------------
// Jobs - OpenRouter VLM Validation
// ---------------------------------------------------------------------------
describe.skipIf(!HAS_OPENROUTER)("Jobs - OpenRouter VLM Validation", () => {
  test.skipIf(!HAS_GEMINI_KEY || !HAS_TEST_VIDEO)(
    "Reject gemini-file video for openrouter model",
    async () => {
      // Upload via gemini-file storage
      const buf = testVideoBuffer;
      const uploadRes = await uploadVideo(buf, "or-gemini-file.mp4", "gemini-file");
      expect(uploadRes.status).toBe(201);
      const uploadBody = await uploadRes.json();
      const videoId = uploadBody.id;

      const jobRes = await createJob({
        videoId,
        query: "describe this",
        model: "openrouter/free",
      });
      expect(jobRes.status).toBe(422);
      const jobBody = await jobRes.json();
      expect(jobBody.error).toContain(
        "OpenRouter cannot consume Gemini file URIs",
      );
    },
  );

  test.skipIf(!HAS_S3_BUCKET)("Accept S3 video for openrouter model (validation only)", async () => {
    const res = await api("/videos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storageType: "s3", filename: "s3-or-test.mp4", size: 4096 }),
    });
    expect(res.status).toBe(201);
    const { id } = await res.json();

    const jobRes = await createJob({ videoId: id, query: "describe this", model: "openrouter/free" });
    expect(jobRes.status).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// Worker Jobs (shared worker instance for all end-to-end job tests)
// ---------------------------------------------------------------------------
describe.skipIf(!HAS_ANY_VLM)("Worker Jobs", () => {
  const workerAbort = new AbortController();

  beforeAll(async () => {
    const { startWorker } = await import("../src/worker.ts");
    startWorker(workerAbort.signal);
  });

  afterAll(() => {
    workerAbort.abort();
  });

  test.skipIf(!HAS_GEMINI_KEY || !HAS_TEST_VIDEO)("Gemini: accept gemini-file video", async () => {
    // Upload via gemini-file storage
    const buf = testVideoBuffer;
    const uploadRes = await uploadVideo(buf, "gemini-ok.mp4", "gemini-file");
    expect(uploadRes.status).toBe(201);
    const uploadBody = await uploadRes.json();
    const geminiFileVideoId = uploadBody.id;

    const jobRes = await createJob({
      videoId: geminiFileVideoId,
      query: "describe this",
      model: "gemini-3-flash-preview",
    });
    expect(jobRes.status).toBe(201);
    const jobBody = await jobRes.json();
    expect(jobBody).toHaveProperty("jobId");
    await waitForJob(jobBody.jobId);
  }, 60_000);

  test.skipIf(!HAS_OPENROUTER)("OpenRouter: accept local video", async () => {
    const res = await createJob({
      videoId: sharedVideoId,
      query: "describe this",
      model: "openrouter/free",
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toHaveProperty("jobId");
    await waitForJob(body.jobId);
  }, 60_000);

  test.skipIf(!HAS_S3_BUCKET || !HAS_OPENROUTER)("S3 + OpenRouter: end-to-end job", async () => {
    // 1. Register S3 video and get pre-signed upload URL
    const registerRes = await api("/videos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storageType: "s3", filename: "s3-e2e.mp4", size: testVideoBuffer.length }),
    });
    expect(registerRes.status).toBe(201);
    const { id, uploadUrl } = await registerRes.json();
    expect(uploadUrl).toBeDefined();

    // 2. Upload video data to S3 via pre-signed PUT URL
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      body: testVideoBuffer,
    });
    expect(uploadRes.ok).toBe(true);

    // 3. Create job and wait for worker to process it
    const jobRes = await createJob({ videoId: id, query: "describe this", model: "openrouter/free" });
    expect(jobRes.status).toBe(201);
    const { jobId } = await jobRes.json();
    const finished = await waitForJob(jobId);

    // The S3 data path is verified as long as the worker didn't fail fetching from S3.
    // A provider-level error (e.g. 402 balance, 404 no endpoints) still means S3 worked.
    if (finished.status === "completed") {
      expect(finished.result).toBeDefined();
    } else {
      // S3 fetch errors surface as "The specified key does not exist" or similar —
      // any other error means S3 fetch succeeded and the provider rejected it.
      const error = finished.error ?? "";
      expect(error).not.toContain("key does not exist");
      expect(error).not.toContain("NoSuchKey");
    }
  }, 60_000);
});
