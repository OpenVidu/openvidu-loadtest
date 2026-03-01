import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import {
	S3Client,
	type S3ClientConfig,
	CreateBucketCommand,
	BucketAlreadyExists,
	BucketAlreadyOwnedByYou,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

interface UploadTask {
	filePath: string;
	key: string;
}

export class S3FilesService {
	private static instance: S3FilesService | undefined;
	static readonly fileDirs = [
		`${process.cwd()}/recordings/chrome`,
		`${process.cwd()}/recordings/qoe`,
		`${process.cwd()}/stats`,
	];

	private readonly bucket: string;
	private readonly host: string | undefined;
	private readonly accessKey: string;
	private readonly secretAccessKey: string;
	private readonly region: string = 'us-east-1';

	private constructor(
		accessKey: string,
		secretAccessKey: string,
		bucketName: string,
		region?: string,
		host?: string,
	) {
		this.accessKey = accessKey;
		this.secretAccessKey = secretAccessKey;
		this.bucket = bucketName;
		this.region = region ?? this.region;
		this.host = host;
		console.log('FilesService initialized with provided credentials');
	}

	static getInstance(
		accessKey?: string,
		secretAccessKey?: string,
		bucketName?: string,
		region?: string,
		host?: string,
	): S3FilesService {
		if (!S3FilesService.instance) {
			if (!accessKey || !secretAccessKey || !bucketName) {
				throw new Error(
					'S3FilesService not initialized. Please provide accessKey, secretAccessKey and bucketName to initialize.',
				);
			} else {
				S3FilesService.instance ??= new S3FilesService(
					accessKey,
					secretAccessKey,
					bucketName,
					region,
					host,
				);
			}
		}
		return S3FilesService.instance;
	}

	private static readonly UPLOAD_CONCURRENCY = 5;
	private static readonly UPLOAD_MAX_RETRIES = 3;
	private static readonly UPLOAD_PART_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

	private getS3Client(): S3Client {
		const config: S3ClientConfig = {
			region: this.region,
			credentials: {
				accessKeyId: this.accessKey,
				secretAccessKey: this.secretAccessKey,
			},
			// SDK-level retries (separate from our own application-level retries below)
			maxAttempts: 5,
		};

		if (this.host) {
			config.endpoint = this.host;
			config.forcePathStyle = true; // Required for MinIO and other S3-compatible services
		}

		return new S3Client(config);
	}

	private async createBucket(): Promise<void> {
		try {
			const s3 = this.getS3Client();
			const bucketParams = {
				Bucket: this.bucket,
			};
			const data = await s3.send(new CreateBucketCommand(bucketParams));
			console.log('Success', data.Location);
		} catch (err: unknown) {
			if (
				err instanceof BucketAlreadyExists ||
				err instanceof BucketAlreadyOwnedByYou
			) {
				console.log('Bucket already exists');
			} else {
				console.error('Error', err);
				throw err;
			}
		}
	}

	/**
	 * Uploads all files from {@link S3FilesService.fileDirs} to the configured S3 bucket.
	 *
	 * - Recording files (chrome / qoe) are placed at the root of the bucket.
	 * - Stats files are placed under a `stats/` prefix that mirrors the local
	 *   `stats/<session>/<user>/<file>` hierarchy.
	 *
	 * Uploads run with bounded concurrency. Every failed upload is retried up to
	 * {@link S3FilesService.UPLOAD_MAX_RETRIES} times with exponential back-off before
	 * being collected into a final error report. The method throws only after all
	 * possible uploads have been attempted, so a single flaky file does not abort the
	 * rest of the transfer.
	 */
	async uploadFiles(): Promise<void> {
		await this.createBucket();

		const s3 = this.getS3Client();
		const tasks = await this.collectUploadTasks();

		if (tasks.length === 0) {
			console.log('No files found to upload.');
			return;
		}

		console.log(
			`Starting upload of ${tasks.length} file(s) to bucket "${this.bucket}"…`,
		);

		const failed: { filePath: string; key: string; error: unknown }[] = [];

		// Process tasks in batches to keep concurrent S3 connections bounded.
		for (
			let i = 0;
			i < tasks.length;
			i += S3FilesService.UPLOAD_CONCURRENCY
		) {
			const batch = tasks.slice(i, i + S3FilesService.UPLOAD_CONCURRENCY);
			const results = await Promise.allSettled(
				batch.map(({ filePath, key }) =>
					this.uploadWithRetry(
						s3,
						filePath,
						key,
						S3FilesService.UPLOAD_MAX_RETRIES,
					),
				),
			);

			for (let j = 0; j < results.length; j++) {
				const result = results[j];
				if (result.status === 'rejected') {
					failed.push({
						filePath: batch[j].filePath,
						key: batch[j].key,
						error: result.reason,
					});
				}
			}
		}

		const succeeded = tasks.length - failed.length;
		console.log(
			`Upload complete: ${succeeded}/${tasks.length} file(s) succeeded.`,
		);

		if (failed.length > 0) {
			const fileList = failed
				.map(f => `  • ${f.filePath} → s3://${this.bucket}/${f.key}`)
				.join('\n');
			throw new Error(
				`${failed.length} file(s) could not be uploaded after ${S3FilesService.UPLOAD_MAX_RETRIES} retries:\n${fileList}`,
			);
		}
	}

	/**
	 * Scans every directory in {@link S3FilesService.fileDirs} and returns a flat list
	 * of `{ filePath, key }` pairs describing every file that must be uploaded.
	 */
	private async collectUploadTasks(): Promise<UploadTask[]> {
		const tasks: UploadTask[] = [];

		for (const dir of S3FilesService.fileDirs) {
			const dirName = path.basename(dir);

			if (dirName === 'stats') {
				tasks.push(...(await this.collectStatsTasks(dir)));
			} else {
				// recordings/chrome and recordings/qoe – all files go to the bucket root.
				tasks.push(...(await this.collectRecordingTasks(dir)));
			}
		}

		return tasks;
	}

	/**
	 * Returns upload tasks for a recordings directory (chrome / qoe).
	 * Only direct file children are collected; subdirectories are ignored.
	 * The S3 key is just the file name (bucket root).
	 */
	private async collectRecordingTasks(dir: string): Promise<UploadTask[]> {
		const tasks: UploadTask[] = [];

		try {
			const entries = await fsPromises.readdir(dir, {
				withFileTypes: true,
			});

			for (const entry of entries) {
				if (!entry.isFile()) continue;

				tasks.push({
					filePath: path.join(dir, entry.name),
					key: entry.name,
				});
			}
		} catch (err) {
			console.error(`Could not read recordings directory "${dir}":`, err);
		}

		return tasks;
	}

	/**
	 * Returns upload tasks for the stats directory.
	 * Expected layout: `stats/<session>/<user>/<file.json>`
	 * The `.gitkeep` placeholder is skipped.
	 * The S3 key preserves the full relative path under a `stats/` prefix:
	 * `stats/<session>/<user>/<file.json>`
	 */
	private async collectStatsTasks(statsDir: string): Promise<UploadTask[]> {
		const tasks: UploadTask[] = [];

		let sessionEntries: fs.Dirent[];
		try {
			sessionEntries = await fsPromises.readdir(statsDir, {
				withFileTypes: true,
			});
		} catch (err) {
			console.error(`Could not read stats directory "${statsDir}":`, err);
			return tasks;
		}

		for (const sessionEntry of sessionEntries) {
			if (!sessionEntry.isDirectory()) continue; // skips .gitkeep

			const sessionPath = path.join(statsDir, sessionEntry.name);
			const sessionTasks = await this.collectSessionTasks(
				sessionEntry.name,
				sessionPath,
			);
			tasks.push(...sessionTasks);
		}

		return tasks;
	}

	/** Returns upload tasks for a single session directory inside stats/. */
	private async collectSessionTasks(
		sessionName: string,
		sessionPath: string,
	): Promise<UploadTask[]> {
		const tasks: UploadTask[] = [];

		let userEntries: fs.Dirent[];
		try {
			userEntries = await fsPromises.readdir(sessionPath, {
				withFileTypes: true,
			});
		} catch (err) {
			console.error(
				`Could not read session directory "${sessionPath}":`,
				err,
			);
			return tasks;
		}

		for (const userEntry of userEntries) {
			if (!userEntry.isDirectory()) continue;

			const userPath = path.join(sessionPath, userEntry.name);
			const userTasks = await this.collectUserTasks(
				sessionName,
				userEntry.name,
				userPath,
			);
			tasks.push(...userTasks);
		}

		return tasks;
	}

	/**
	 * Returns upload tasks for a single user directory inside a session
	 * directory.
	 */
	private async collectUserTasks(
		sessionName: string,
		userName: string,
		userPath: string,
	): Promise<UploadTask[]> {
		const tasks: UploadTask[] = [];

		let fileEntries: fs.Dirent[];
		try {
			fileEntries = await fsPromises.readdir(userPath, {
				withFileTypes: true,
			});
		} catch (err) {
			console.error(`Could not read user directory "${userPath}":`, err);
			return tasks;
		}

		for (const fileEntry of fileEntries) {
			if (!fileEntry.isFile()) continue;

			tasks.push({
				filePath: path.join(userPath, fileEntry.name),
				key: `stats/${sessionName}/${userName}/${fileEntry.name}`,
			});
		}

		return tasks;
	}

	/**
	 * Uploads a single file to S3, retrying on failure with exponential back-off.
	 * Throws if all attempts are exhausted.
	 */
	private async uploadWithRetry(
		s3: S3Client,
		filePath: string,
		key: string,
		maxRetries: number,
	): Promise<void> {
		let lastError: unknown;

		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			try {
				await this.uploadSingleFile(s3, filePath, key);
				console.log(
					`Uploaded [${attempt}/${maxRetries}]: ${filePath} → s3://${this.bucket}/${key}`,
				);
				return;
			} catch (err) {
				lastError = err;
				console.warn(
					`Attempt ${attempt}/${maxRetries} failed for "${filePath}":`,
					err instanceof Error ? err.message : err,
				);

				if (attempt < maxRetries) {
					const delayMs = Math.pow(2, attempt) * 1000; // 2 s, 4 s, 8 s, …
					await new Promise(resolve => setTimeout(resolve, delayMs));
				}
			}
		}

		throw lastError;
	}

	/**
	 * Performs a single multipart-capable upload via {@link Upload}.
	 * `@aws-sdk/lib-storage` automatically switches to multipart upload for files
	 * exceeding {@link S3FilesService.UPLOAD_PART_SIZE_BYTES}, making it safe for
	 * very large recording files.
	 */
	private async uploadSingleFile(
		s3: S3Client,
		filePath: string,
		key: string,
	): Promise<void> {
		const body = fs.createReadStream(filePath);

		const upload = new Upload({
			client: s3,
			params: {
				Bucket: this.bucket,
				Key: key,
				Body: body,
			},
			// Number of concurrent part uploads per file
			queueSize: 4,
			// Part size for multipart uploads (min 5 MB required by S3)
			partSize: S3FilesService.UPLOAD_PART_SIZE_BYTES,
			// Clean up incomplete multipart uploads on error
			leavePartsOnError: false,
		});

		await upload.done();
	}
}
