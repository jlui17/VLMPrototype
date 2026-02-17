export interface Job {
  id: string;
  videoId: string;
  query: string;
  status: "pending" | "processing" | "completed" | "failed";
  result: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Video {
  id: string;
  filename: string;
  size: number;
  createdAt: string;
}

export interface Database {
  init(): Promise<void>;
  createVideo(id: string, filename: string, size: number): Promise<Video>;
  getVideo(id: string): Promise<Video | null>;
  listVideos(): Promise<Video[]>;
  renameVideo(id: string, filename: string): Promise<Video | null>;
  deleteVideo(id: string): Promise<boolean>;
  createJob(videoId: string, query: string): Promise<Job>;
  getJob(id: string): Promise<Job | null>;
  listJobs(): Promise<Job[]>;
  claimNextPendingJob(): Promise<Job | null>;
  completeJob(id: string, result: string): Promise<void>;
  failJob(id: string, error: string): Promise<void>;
}
