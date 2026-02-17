import { Database as BunSQLite } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { Database, Job, Video } from "./database.ts";

export class SQLiteDatabase implements Database {
  private db: BunSQLite;

  constructor(path = "./data/vlm.db") {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new BunSQLite(path, { create: true });
    this.db.run("PRAGMA journal_mode = WAL;");
  }

  async init(): Promise<void> {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS videos (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        size INTEGER NOT NULL,
        storageType TEXT NOT NULL DEFAULT 'local',
        storageRef TEXT NOT NULL DEFAULT '',
        createdAt TEXT NOT NULL
      );
    `);
    this.db.run(`
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        videoId TEXT NOT NULL,
        model TEXT NOT NULL DEFAULT '',
        query TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        result TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
    `);

    const jobCols = this.db.query("PRAGMA table_info(jobs)").all() as { name: string }[];
    if (!jobCols.some((c) => c.name === "model")) {
      this.db.run("ALTER TABLE jobs ADD COLUMN model TEXT NOT NULL DEFAULT ''");
    }

    const videoCols = this.db.query("PRAGMA table_info(videos)").all() as { name: string }[];
    if (!videoCols.some((c) => c.name === "storageType")) {
      this.db.run("ALTER TABLE videos ADD COLUMN storageType TEXT NOT NULL DEFAULT 'local'");
    }
    if (!videoCols.some((c) => c.name === "storageRef")) {
      this.db.run("ALTER TABLE videos ADD COLUMN storageRef TEXT NOT NULL DEFAULT ''");
    }

    this.db.run("UPDATE videos SET storageRef = id WHERE storageRef = ''");
  }

  async createVideo(id: string, filename: string, size: number, storageType: string, storageRef: string): Promise<Video> {
    const now = new Date().toISOString();
    this.db
      .query(
        `INSERT INTO videos (id, filename, size, storageType, storageRef, createdAt)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(id, filename, size, storageType, storageRef, now);
    return { id, filename, size, storageType, storageRef, createdAt: now };
  }

  async getVideo(id: string): Promise<Video | null> {
    return this.db.query("SELECT * FROM videos WHERE id = ?").get(id) as Video | null;
  }

  async listVideos(): Promise<Video[]> {
    return this.db.query("SELECT * FROM videos ORDER BY createdAt DESC").all() as Video[];
  }

  async renameVideo(id: string, filename: string): Promise<Video | null> {
    return this.db
      .query("UPDATE videos SET filename = ? WHERE id = ? RETURNING *")
      .get(filename, id) as Video | null;
  }

  async deleteVideo(id: string): Promise<boolean> {
    this.db.query("DELETE FROM videos WHERE id = ?").run(id);
    const row = this.db.query("SELECT changes() as changes").get() as { changes: number };
    return row.changes > 0;
  }

  async createJob(videoId: string, model: string, query: string): Promise<Job> {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .query(
        `INSERT INTO jobs (id, videoId, model, query, status, result, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, 'pending', NULL, ?, ?)`
      )
      .run(id, videoId, model, query, now, now);
    return { id, videoId, model, query, status: "pending", result: null, createdAt: now, updatedAt: now };
  }

  async getJob(id: string): Promise<Job | null> {
    const row = this.db.query("SELECT * FROM jobs WHERE id = ?").get(id) as Job | null;
    return row;
  }

  async listJobs(): Promise<Job[]> {
    return this.db.query("SELECT * FROM jobs ORDER BY createdAt DESC").all() as Job[];
  }

  async claimNextPendingJob(): Promise<Job | null> {
    const now = new Date().toISOString();
    const row = this.db
      .query(
        `UPDATE jobs SET status = 'processing', updatedAt = ?
         WHERE id = (SELECT id FROM jobs WHERE status = 'pending' ORDER BY createdAt LIMIT 1)
         RETURNING *`
      )
      .get(now) as Job | null;
    return row;
  }

  async completeJob(id: string, result: string): Promise<void> {
    const now = new Date().toISOString();
    this.db.query("UPDATE jobs SET status = 'completed', result = ?, updatedAt = ? WHERE id = ?").run(result, now, id);
  }

  async failJob(id: string, error: string): Promise<void> {
    const now = new Date().toISOString();
    this.db.query("UPDATE jobs SET status = 'failed', result = ?, updatedAt = ? WHERE id = ?").run(error, now, id);
  }
}
