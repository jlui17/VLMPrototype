import {
  S3Client,
  HeadBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { BlobStorage, StoreResult } from "./storage.ts";
import type { VideoData } from "./video-data.ts";

export interface S3FileStorageOptions {
  bucket: string;
  region?: string;
}

const PRESIGN_EXPIRES_SECONDS = 3600; // 1 hour

export class S3FileStorage implements BlobStorage {
  readonly storageType = "s3";
  private client: S3Client;
  private bucket: string;

  constructor(opts: S3FileStorageOptions) {
    this.bucket = opts.bucket;
    this.client = new S3Client({
      region: opts.region ?? "us-east-1",
    });
  }

  async init(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }

  async store(id: string, _data: Buffer): Promise<StoreResult> {
    const key = `videos/${id}`;
    const url = await getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: PRESIGN_EXPIRES_SECONDS },
    );
    return { ref: key, uploadUrl: url };
  }

  async fetch(ref: string): Promise<VideoData> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: ref }),
    );
    const bytes = await response.Body!.transformToByteArray();
    return { kind: "buffer", data: Buffer.from(bytes) };
  }

  async delete(ref: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: ref }),
    );
  }
}
