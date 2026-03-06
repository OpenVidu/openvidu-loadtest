import {
	describe,
	it,
	expect,
	beforeAll,
	afterAll,
	beforeEach,
	afterEach,
} from 'vitest';
import {
	S3Client,
	ListObjectsV2Command,
	GetObjectCommand,
	DeleteBucketCommand,
	DeleteObjectCommand,
	NoSuchBucket,
} from '@aws-sdk/client-s3';
import { RemotePersistenceService } from '../../src/services/files/remote-persistence.service.ts';
import { LocalFilesRepository } from '../../src/repositories/files/local-files.repository.ts';
import {
	S3MockContainer,
	StartedS3MockContainer,
} from '@testcontainers/s3mock';
import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import { S3Repository } from '../../src/repositories/files/s3.repository.ts';

/**
 * Helper function to convert a stream to string
 */
async function streamToString(stream: Readable): Promise<string> {
	const chunks: Buffer[] = [];
	return new Promise((resolve, reject) => {
		stream.on('data', (chunk: Buffer) => chunks.push(chunk));
		stream.on('error', reject);
		stream.on('end', () =>
			resolve(Buffer.concat(chunks).toString('utf-8')),
		);
	});
}

/**
 * Helper function to download file from S3 and get its contents
 */
async function getFileFromS3(
	s3Client: S3Client,
	bucket: string,
	key: string,
): Promise<string> {
	const response = await s3Client.send(
		new GetObjectCommand({
			Bucket: bucket,
			Key: key,
		}),
	);

	if (!response.Body) {
		throw new Error(`No body found for key: ${key}`);
	}

	// Body is a stream-like object, convert it to string
	return streamToString(response.Body as Readable);
}

/**
 * Helper function to list all objects in a bucket
 */
async function listBucketObjects(
	s3Client: S3Client,
	bucket: string,
): Promise<string[]> {
	const keys: string[] = [];
	let continuationToken: string | undefined;

	try {
		do {
			const response = await s3Client.send(
				new ListObjectsV2Command({
					Bucket: bucket,
					ContinuationToken: continuationToken,
				}),
			);

			if (response.Contents) {
				keys.push(...response.Contents.map(obj => obj.Key ?? ''));
			}

			continuationToken = response.NextContinuationToken;
		} while (continuationToken);
	} catch (error: unknown) {
		// If bucket doesn't exist, return empty array
		if (error instanceof NoSuchBucket) {
			return [];
		}
		throw error;
	}

	return keys;
}

async function removeDir(dirPath: string) {
	try {
		const files = await fsPromises.readdir(dirPath, {
			withFileTypes: true,
		});
		for (const file of files) {
			if (file.name !== '.gitkeep') {
				const fullPath = path.join(dirPath, file.name);
				await fsPromises.rm(fullPath, {
					recursive: true,
					force: true,
				});
			}
		}
	} catch (error) {
		// Directory doesn't exist, ignore
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
			throw error;
		}
	}
}

describe('RemotePersistenceService Integration Tests', () => {
	let s3MockContainer: StartedS3MockContainer;
	let remotePersistenceService: RemotePersistenceService;
	let s3Client: S3Client;
	let testBucketName: string;

	beforeAll(async () => {
		// Start S3Mock container
		try {
			s3MockContainer = await new S3MockContainer(
				'adobe/s3mock:4.11.0',
			).start();

			console.log(`S3Mock container started`);

			s3Client = new S3Client({
				region: 'us-east-1',
				endpoint: s3MockContainer.getHttpConnectionUrl(),
				forcePathStyle: true,
				credentials: {
					accessKeyId: s3MockContainer.getAccessKeyId(),
					secretAccessKey: s3MockContainer.getSecretAccessKey(),
				},
			});
		} catch (error) {
			console.error('Failed to start S3Mock container:', error);
			throw error;
		}
	}, 60000); // Allow up to 60 seconds for container pulling and startup

	afterAll(async () => {
		if (s3MockContainer) {
			await s3MockContainer.stop();
			console.log(`S3Mock container stopped`);
		}
	});

	afterEach(async () => {
		remotePersistenceService.clean();

		// Delete all objects in the test bucket
		if (testBucketName) {
			try {
				const uploadedKeys = await listBucketObjects(
					s3Client,
					testBucketName,
				);
				for (const key of uploadedKeys) {
					await s3Client.send(
						new DeleteObjectCommand({
							Bucket: testBucketName,
							Key: key,
						}),
					);
				}

				// Delete the bucket only if it exists
				await s3Client.send(
					new DeleteBucketCommand({
						Bucket: testBucketName,
					}),
				);
				console.log(`Deleted test bucket: ${testBucketName}`);
			} catch (error: unknown) {
				// Bucket doesn't exist, skip cleanup
				if (error instanceof NoSuchBucket) {
					console.log(
						`Bucket ${testBucketName} does not exist, skipping S3 bucket cleanup`,
					);
				} else {
					throw error;
				}
			}
		}

		await Promise.all([
			removeDir(LocalFilesRepository.FULLSCREEN_RECORDING_DIR),
			removeDir(LocalFilesRepository.QOE_RECORDING_DIR),
			removeDir(LocalFilesRepository.STATS_DIR),
			removeDir(LocalFilesRepository.MEDIAFILES_DIR),
		]);
	});

	beforeEach(() => {
		// Generate unique bucket name for this test
		testBucketName = `test-bucket-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

		// Create fresh repository and service for each test
		remotePersistenceService = new RemotePersistenceService(
			new S3Repository(),
		);
	});

	it('should initialize with valid credentials, region and host', () => {
		remotePersistenceService.initialize(
			s3MockContainer.getAccessKeyId(),
			s3MockContainer.getSecretAccessKey(),
			testBucketName,
			'us-east-1',
			s3MockContainer.getHttpConnectionUrl(),
		);
		expect(remotePersistenceService.isInitialized()).toBe(true);
	});

	it('should throw error when uploading files without initialization', async () => {
		await expect(
			remotePersistenceService.uploadFiles(),
		).rejects.toThrowError(
			'RemotePersistenceService not initialized. Call initialize() with credentials first.',
		);
	});

	it('should upload files successfully with valid credentials', async () => {
		const recordingsFullScreenPath =
			LocalFilesRepository.FULLSCREEN_RECORDING_DIR;
		const recordingsQoePath = LocalFilesRepository.QOE_RECORDING_DIR;
		const statsPath = LocalFilesRepository.STATS_DIR;

		// Create test files on the real filesystem
		const testFilesContent: Record<string, string> = {
			[`${recordingsFullScreenPath}/full.mp4`]: 'fake mp4 content',
			[`${recordingsQoePath}/QOE_LoadTestSession1_User1_User2.webm`]:
				'fake webm content 1',
			[`${recordingsQoePath}/QOE_LoadTestSession1_User2_User1.webm`]:
				'fake webm content 2',
			[`${recordingsQoePath}/QOE_LoadTestSession2_User1_User2.webm`]:
				'fake webm content 3',
			[`${recordingsQoePath}/QOE_LoadTestSession2_User2_User1.webm`]:
				'fake webm content 4',
			[`${statsPath}/LoadTestSession1/User1/connections.json`]:
				JSON.stringify({ key: 'value' }),
			[`${statsPath}/LoadTestSession1/User2/connections.json`]:
				JSON.stringify({ key: 'value' }),
			[`${statsPath}/LoadTestSession2/User1/connections.json`]:
				JSON.stringify({ key: 'value' }),
			[`${statsPath}/LoadTestSession2/User2/connections.json`]:
				JSON.stringify({ key: 'value' }),
			[`${statsPath}/LoadTestSession1/User1/stats.json`]: JSON.stringify({
				key: 'value',
			}),
			[`${statsPath}/LoadTestSession1/User2/stats.json`]: JSON.stringify({
				key: 'value',
			}),
			[`${statsPath}/LoadTestSession2/User1/stats.json`]: JSON.stringify({
				key: 'value',
			}),
			[`${statsPath}/LoadTestSession2/User2/stats.json`]: JSON.stringify({
				key: 'value',
			}),
		};

		// Create all necessary directories and files
		for (const [filePath, content] of Object.entries(testFilesContent)) {
			const dirPath = path.dirname(filePath);
			if (!fs.existsSync(dirPath)) {
				fs.mkdirSync(dirPath, { recursive: true });
			}
			fs.writeFileSync(filePath, content);
		}

		// Initialize service with S3Mock endpoint
		remotePersistenceService.initialize(
			s3MockContainer.getAccessKeyId(),
			s3MockContainer.getSecretAccessKey(),
			testBucketName,
			'us-east-1',
			s3MockContainer.getHttpConnectionUrl(),
		);

		// Upload files
		await expect(
			remotePersistenceService.uploadFiles(),
		).resolves.not.toThrow();

		// Verify files were uploaded to S3
		const uploadedKeys = await listBucketObjects(s3Client, testBucketName);

		const expectedKeys = [
			'full.mp4',
			'QOE_LoadTestSession1_User1_User2.webm',
			'QOE_LoadTestSession1_User2_User1.webm',
			'QOE_LoadTestSession2_User1_User2.webm',
			'QOE_LoadTestSession2_User2_User1.webm',
			'stats/LoadTestSession1/User1/connections.json',
			'stats/LoadTestSession1/User2/connections.json',
			'stats/LoadTestSession2/User1/connections.json',
			'stats/LoadTestSession2/User2/connections.json',
			'stats/LoadTestSession1/User1/stats.json',
			'stats/LoadTestSession1/User2/stats.json',
			'stats/LoadTestSession2/User1/stats.json',
			'stats/LoadTestSession2/User2/stats.json',
		];

		for (const key of expectedKeys) {
			expect(uploadedKeys).toContain(key);
		}

		// Verify file contents for a few files
		const fullMp4Content = await getFileFromS3(
			s3Client,
			testBucketName,
			'full.mp4',
		);
		expect(fullMp4Content).toBe('fake mp4 content');

		const statsContent = await getFileFromS3(
			s3Client,
			testBucketName,
			'stats/LoadTestSession1/User1/stats.json',
		);
		expect(statsContent).toBe(JSON.stringify({ key: 'value' }));

		// Verify counts match
		expect(uploadedKeys).toHaveLength(expectedKeys.length);
	});

	it('should handle missing recording directories gracefully', async () => {
		// Only create stats files, leave recording dirs empty
		const statsPath = LocalFilesRepository.STATS_DIR;

		const testFilesContent: Record<string, string> = {
			[`${statsPath}/LoadTestSession1/User1/stats.json`]: JSON.stringify({
				data: 'test',
			}),
		};

		for (const [filePath, content] of Object.entries(testFilesContent)) {
			const dirPath = path.dirname(filePath);
			if (!fs.existsSync(dirPath)) {
				fs.mkdirSync(dirPath, { recursive: true });
			}
			fs.writeFileSync(filePath, content);
		}

		remotePersistenceService.initialize(
			s3MockContainer.getAccessKeyId(),
			s3MockContainer.getSecretAccessKey(),
			testBucketName,
			'us-east-1',
			s3MockContainer.getHttpConnectionUrl(),
		);

		// Should not throw even though recording directories are empty
		await expect(
			remotePersistenceService.uploadFiles(),
		).resolves.not.toThrow();

		const uploadedKeys = await listBucketObjects(s3Client, testBucketName);

		// Only the stats file should be uploaded
		expect(uploadedKeys).toContain(
			'stats/LoadTestSession1/User1/stats.json',
		);
		expect(uploadedKeys.length).toBe(1);
	});
});
