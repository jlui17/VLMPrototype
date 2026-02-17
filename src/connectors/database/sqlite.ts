import { Database as BunSQLite } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { Database, Job } from "./database.ts";

export class SQLiteDatabase implements Database {
  private db: BunSQLite;

  constructor(path = "./data/vlm.db") {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new BunSQLite(path, { create: true });
    this.db.run("PRAGMA journal_mode = WAL;");
  }

  async init(): Promise<void> {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        videoId TEXT NOT NULL,
        query TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        result TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
    `);
  }

  async createJob(videoId: string, query: string): Promise<Job> {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .query(
        `INSERT INTO jobs (id, videoId, query, status, result, createdAt, updatedAt)
         VALUES (?, ?, ?, 'pending', NULL, ?, ?)`
      )
      .run(id, videoId, query, now, now);
    return { id, videoId, query, status: "pending", result: null, createdAt: now, updatedAt: now };
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
