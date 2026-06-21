import type { Dirent } from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import logger from '../logger.service.ts';
import { LocalFilesRepository } from '../../repositories/files/local-files.repository.ts';
import type { RemotePersistenceRepository } from '../../repositories/files/remote-persistence.repository.ts';

interface UploadTask {
	filePath: string;
	key: string;
}

export class RemotePersistenceService {
	private static readonly UPLOAD_CONCURRENCY = 5;
	private static readonly UPLOAD_MAX_RETRIES = 3;

	private readonly remotePersistenceRepository: RemotePersistenceRepository;
	private readonly fileDirs: string[];

	constructor(remotePersistenceRepository: RemotePersistenceRepository) {
		this.remotePersistenceRepository = remotePersistenceRepository;
		this.fileDirs = [
			LocalFilesRepository.FULLSCREEN_RECORDING_DIR,
			LocalFilesRepository.QOE_RECORDING_DIR,
			LocalFilesRepository.STATS_DIR,
		];
	}

	/**
	 * Initializes the remote persistence service credentials and target.
	 * Must be called before using uploadFiles().
	 */
	public initialize(
		accessKey: string,
		secretAccessKey: string,
		targetName: string,
		region?: string,
		host?: string,
	): void {
		this.remotePersistenceRepository.initialize(
			accessKey,
			secretAccessKey,
			targetName,
			region,
			host,
		);
		logger.info(
			'RemotePersistenceService initialized with provided credentials',
		);
	}

	public isInitialized(): boolean {
		return this.remotePersistenceRepository.isInitialized();
	}

	/**
	 * Uploads all files from fileDirs to the configured remote persistence target.
	 *
	 * - Recording files (chrome / qoe) are placed at the root.
	 * - Stats files are placed under a `stats/` prefix that mirrors the local
	 *   `stats/<session>/<user>/<file>` hierarchy.
	 */
	public async uploadFiles(): Promise<void> {
		if (!this.isInitialized()) {
			throw new Error(
				'RemotePersistenceService not initialized. Call initialize() with credentials first.',
			);
		}
		await this.remotePersistenceRepository.createBucketIfNeeded();
		const targetName = this.remotePersistenceRepository.getBucketName();

		const tasks = await this.collectUploadTasks();

		if (tasks.length === 0) {
			logger.info('No files found to upload.');
			return;
		}

		logger.info(
			'Starting upload of %d file(s) to target "%s"...',
			tasks.length,
			targetName,
		);

		const failed: { filePath: string; key: string; error: unknown }[] = [];
		// Process tasks in batches to keep concurrent remote connections bounded.
		for (
			let i = 0;
			i < tasks.length;
			i += RemotePersistenceService.UPLOAD_CONCURRENCY
		) {
			const batch = tasks.slice(
				i,
				i + RemotePersistenceService.UPLOAD_CONCURRENCY,
			);
			const results = await Promise.allSettled(
				batch.map(({ filePath, key }) =>
					this.uploadWithRetry(
						filePath,
						key,
						RemotePersistenceService.UPLOAD_MAX_RETRIES,
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
		logger.info(
			'Upload complete: %d/%d file(s) succeeded.',
			succeeded,
			tasks.length,
		);

		if (failed.length > 0) {
			const fileList = failed
				.map(f => `  - ${f.filePath} -> ${targetName}/${f.key}`)
				.join('\n');
			throw new Error(
				`${failed.length} file(s) could not be uploaded after ${RemotePersistenceService.UPLOAD_MAX_RETRIES} retries:\n${fileList}`,
			);
		}
	}

	private async collectUploadTasks(): Promise<UploadTask[]> {
		const tasks: UploadTask[] = [];

		for (const dir of this.fileDirs) {
			const dirName = path.basename(dir);

			if (dirName === 'stats') {
				tasks.push(...(await this.collectStatsTasks(dir)));
			} else {
				// recordings/chrome and recordings/qoe - all files go to root.
				tasks.push(...(await this.collectRecordingTasks(dir)));
			}
		}

		return tasks;
	}

	private async collectRecordingTasks(dir: string): Promise<UploadTask[]> {
		const tasks: UploadTask[] = [];

		try {
			const entries = await fsPromises.readdir(dir, {
				withFileTypes: true,
			});

			if (!entries || entries.length === 0) {
				logger.warn('Recordings directory "%s" is empty.', dir);
				return tasks;
			}

			for (const entry of entries) {
				if (!entry.isFile()) continue;
				if (entry.name === '.gitkeep') continue;
				tasks.push({
					filePath: path.join(dir, entry.name),
					key: entry.name,
				});
			}
		} catch (err) {
			logger.error(
				{ err },
				'Could not read recordings directory "%s"',
				dir,
			);
		}

		return tasks;
	}

	private async collectStatsTasks(statsDir: string): Promise<UploadTask[]> {
		const tasks: UploadTask[] = [];

		let sessionEntries: Dirent[];
		try {
			sessionEntries = await fsPromises.readdir(statsDir, {
				withFileTypes: true,
			});
			if (!sessionEntries || sessionEntries.length === 0) {
				logger.warn('Stats directory "%s" is empty.', statsDir);
				return tasks;
			}
		} catch (err) {
			logger.error(
				{ err },
				'Could not read stats directory "%s"',
				statsDir,
			);
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

	private async collectSessionTasks(
		sessionName: string,
		sessionPath: string,
	): Promise<UploadTask[]> {
		const tasks: UploadTask[] = [];

		let userEntries: Dirent[];
		try {
			userEntries = await fsPromises.readdir(sessionPath, {
				withFileTypes: true,
			});
		} catch (err) {
			logger.error(
				{ err },
				'Could not read session directory "%s"',
				sessionPath,
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

	private async collectUserTasks(
		sessionName: string,
		userName: string,
		userPath: string,
	): Promise<UploadTask[]> {
		const tasks: UploadTask[] = [];

		let fileEntries: Dirent[];
		try {
			fileEntries = await fsPromises.readdir(userPath, {
				withFileTypes: true,
			});
		} catch (err) {
			logger.error(
				{ err },
				'Could not read user directory "%s"',
				userPath,
			);
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

	private async uploadWithRetry(
		filePath: string,
		key: string,
		maxRetries: number,
	): Promise<void> {
		let lastError: unknown;

		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			try {
				await this.remotePersistenceRepository.uploadFile(
					filePath,
					key,
				);
				logger.info(
					'Uploaded [attempt %d/%d]: %s -> %s/%s',
					attempt,
					maxRetries,
					filePath,
					this.remotePersistenceRepository.getBucketName(),
					key,
				);
				return;
			} catch (err) {
				lastError = err;
				logger.warn(
					'Attempt %d/%d failed for "%s": %s',
					attempt,
					maxRetries,
					filePath,
					err instanceof Error ? err.message : err,
				);

				if (attempt < maxRetries) {
					const delayMs = Math.pow(2, attempt) * 1000; // 2 s, 4 s, 8 s, ...
					await new Promise(resolve => setTimeout(resolve, delayMs));
				}
			}
		}

		throw lastError;
	}

	public clean(): void {
		this.remotePersistenceRepository.clean();
		logger.info('RemotePersistenceService cleaned up');
	}
}
