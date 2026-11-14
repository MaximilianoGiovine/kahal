import { DeleteObjectCommand, DeleteObjectsCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, promises as fs } from 'fs';
import { dirname, join, resolve, sep } from 'path';
import { Readable } from 'stream';

/**
 * Almacenamiento de archivos. Driver "local" (volumen Docker) por defecto;
 * "s3" para cualquier proveedor compatible (AWS, Cloudflare R2, Backblaze, etc.).
 */
/** Carpeta de los archivos de Kahal (noticias y avisos), legibles desde cualquier iglesia. */
export const PLATFORM_FOLDER = 'platform';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly driver: 'local' | 's3';
  private readonly root: string;
  private s3?: S3Client;
  private bucket?: string;

  constructor(private readonly config: ConfigService) {
    this.driver = config.get('STORAGE_DRIVER') === 's3' ? 's3' : 'local';
    this.root = resolve(config.get('UPLOAD_DIR') ?? './uploads');
  }

  async onModuleInit() {
    if (this.driver === 's3') {
      this.bucket = this.config.getOrThrow('S3_BUCKET');
      this.s3 = new S3Client({
        region: this.config.get('S3_REGION') ?? 'auto',
        endpoint: this.config.get('S3_ENDPOINT'),
        forcePathStyle: true,
        credentials: {
          accessKeyId: this.config.getOrThrow('S3_ACCESS_KEY'),
          secretAccessKey: this.config.getOrThrow('S3_SECRET_KEY'),
        },
      });
    } else {
      await fs.mkdir(this.root, { recursive: true });
    }
    this.logger.log(`Almacenamiento: ${this.driver}`);
  }

  async put(key: string, body: Buffer, contentType: string) {
    if (this.s3) {
      await this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
      return;
    }
    const path = this.localPath(key);
    await fs.mkdir(dirname(path), { recursive: true });
    await fs.writeFile(path, body);
  }

  async get(key: string): Promise<Readable> {
    if (this.s3) {
      try {
        const res = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
        return res.Body as Readable;
      } catch {
        throw new NotFoundException('Archivo no encontrado');
      }
    }
    const path = this.localPath(key);
    try {
      await fs.access(path);
    } catch {
      throw new NotFoundException('Archivo no encontrado');
    }
    return createReadStream(path);
  }

  async delete(key: string) {
    if (this.s3) {
      await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
      return;
    }
    await fs.rm(this.localPath(key), { force: true });
  }

  /** Borra todos los archivos bajo un prefijo, como la carpeta de una iglesia. */
  async deletePrefix(prefix: string) {
    if (this.s3) {
      let token: string | undefined;
      do {
        const page = await this.s3.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token }));
        const objects = (page.Contents ?? []).map((o) => ({ Key: o.Key! }));
        if (objects.length) await this.s3.send(new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: objects } }));
        token = page.NextContinuationToken;
      } while (token);
      return;
    }
    await fs.rm(this.localPath(prefix.replace(/\/+$/, '')), { recursive: true, force: true });
  }

  private localPath(key: string) {
    const path = resolve(join(this.root, key));
    if (!path.startsWith(this.root + sep)) throw new NotFoundException('Archivo no encontrado');
    return path;
  }
}
