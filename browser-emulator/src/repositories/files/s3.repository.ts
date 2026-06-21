import fs from 'node:fs';
import {
	S3Client,
	type S3ClientConfig,
	CreateBucketCommand,
	BucketAlreadyExists,
	BucketAlreadyOwnedByYou,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import type { RemotePersistenceRepository } from './remote-persistence.repository.js';
import type { LoggerService } from '../../services/logger.service.ts';

export class S3Repository implements RemotePersistenceRepository {
	private readonly logger: ReturnType<LoggerService['getLogger']>;
	private bucket = '';
	private s3Client: S3Client | undefined;

	private static readonly UPLOAD_PART_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

	constructor(loggerService: LoggerService) {
		this.logger = loggerService.getLogger('S3Repository');
	}

	public initialize(
		accessKey: string,
		secretAccessKey: string,
		bucketName: string,
		region?: string,
		host?: string,
	): void {
		this.bucket = bucketName;

		const config: S3ClientConfig = {
			region: region ?? 'us-east-1',
			credentials: {
				accessKeyId: accessKey,
				secretAccessKey: secretAccessKey,
			},
			maxAttempts: 5,
		};

		if (host) {
			config.endpoint = host;
			config.forcePathStyle = true;
		}

		this.s3Client = new S3Client(config);
		this.logger.info('S3Repository initialized with provided credentials');
	}

	public isInitialized(): boolean {
		return !!this.s3Client && !!this.bucket;
	}

	public getBucketName(): string {
		return this.bucket;
	}

	public async createBucketIfNeeded(): Promise<void> {
		if (!this.isInitialized()) {
			throw new Error(
				'S3Repository not initialized. Call initialize() with credentials first.',
			);
		}

		const client = this.s3Client;
		if (!client) {
			throw new Error('S3 client is not available.');
		}

		try {
			const data = await client.send(
				new CreateBucketCommand({ Bucket: this.bucket }),
			);
			this.logger.info({ location: data.Location }, 'Bucket created');
		} catch (err: unknown) {
			if (
				err instanceof BucketAlreadyExists ||
				err instanceof BucketAlreadyOwnedByYou
			) {
				this.logger.info('Bucket already exists');
				return;
			}
			this.logger.error({ err }, 'Error creating bucket');
			throw err;
		}
	}

	public async uploadFile(filePath: string, key: string): Promise<void> {
		if (!this.isInitialized()) {
			throw new Error(
				'S3Repository not initialized. Call initialize() with credentials first.',
			);
		}

		const body = fs.createReadStream(filePath);
		const client = this.s3Client;
		if (!client) {
			throw new Error('S3 client is not available.');
		}
		const upload = new Upload({
			client,
			params: {
				Bucket: this.bucket,
				Key: key,
				Body: body,
			},
			queueSize: 4,
			partSize: S3Repository.UPLOAD_PART_SIZE_BYTES,
			leavePartsOnError: false,
		});

		await upload.done();
	}

	public clean(): void {
		this.s3Client?.destroy();
		this.s3Client = undefined;
		this.bucket = '';
		this.logger.info('S3Repository cleaned up');
	}
}
