import { Readable } from 'node:stream';
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutBucketVersioningCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { AppConfig } from '../config/app-config';
import { HealthIndicator, HealthService } from '../health/health.service';

class StorageHealth extends HealthIndicator {
  readonly name = 'storage';
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
  ) {
    super();
  }
  async check(): Promise<boolean> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    return true;
  }
}

/** S3-compatible object storage — standard S3 API only (ADR-0007). */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly client: S3Client;
  /** Client whose endpoint browsers can reach (presigned URLs) */
  private readonly publicClient: S3Client;
  readonly bucket: string;

  constructor(
    private readonly config: AppConfig,
    private readonly health: HealthService,
  ) {
    const env = config.env;
    const base = {
      region: env.S3_REGION,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials:
        env.S3_ACCESS_KEY && env.S3_SECRET_KEY
          ? { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY }
          : undefined,
      requestChecksumCalculation: 'WHEN_REQUIRED' as const,
      responseChecksumValidation: 'WHEN_REQUIRED' as const,
    };
    this.client = new S3Client({ ...base, endpoint: env.S3_ENDPOINT });
    this.publicClient = new S3Client({
      ...base,
      endpoint: env.S3_PUBLIC_ENDPOINT ?? env.S3_ENDPOINT,
    });
    this.bucket = env.S3_BUCKET;
  }

  onModuleInit(): void {
    this.health.register(new StorageHealth(this.client, this.bucket));
  }

  /** Dev/test convenience — production buckets are provisioned by infra (versioning on). */
  async ensureBucket(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      await this.client.send(
        new PutBucketVersioningCommand({
          Bucket: this.bucket,
          VersioningConfiguration: { Status: 'Enabled' },
        }),
      );
    }
  }

  presignPut(key: string, contentType: string, expiresInSec = 900): Promise<string> {
    return getSignedUrl(
      this.publicClient,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }),
      {
        expiresIn: expiresInSec,
      },
    );
  }

  presignGet(
    key: string,
    disposition: string,
    contentType?: string,
    expiresInSec = 300,
  ): Promise<string> {
    return getSignedUrl(
      this.publicClient,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition: disposition,
        ...(contentType ? { ResponseContentType: contentType } : {}),
      }),
      { expiresIn: expiresInSec },
    );
  }

  async head(key: string): Promise<{ size: number; contentType?: string } | null> {
    try {
      const res = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { size: Number(res.ContentLength ?? 0), contentType: res.ContentType };
    } catch {
      return null;
    }
  }

  async getStream(key: string): Promise<Readable> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return res.Body as Readable;
  }

  async getBuffer(key: string): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of await this.getStream(key))
      chunks.push(Buffer.from(chunk as Uint8Array));
    return Buffer.concat(chunks);
  }

  async put(
    key: string,
    body: Buffer | Readable,
    contentType: string,
    contentLength?: number,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ContentLength: contentLength,
      }),
    );
  }
}
