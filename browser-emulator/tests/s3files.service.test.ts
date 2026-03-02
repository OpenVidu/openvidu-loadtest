import { describe, it, expect, vi, beforeEach } from 'vitest';
import { S3Client, type S3ClientConfig } from '@aws-sdk/client-s3';
import { S3FilesService } from '../src/services/files/s3files.service.ts';
import { MOCK_CWD } from './globalFsSetup.ts';
import { vol, fs } from 'memfs';
import type { Options } from '@aws-sdk/lib-storage';

const s3CtorMock = vi.fn();
const s3SendMock = vi.fn(() =>
	Promise.resolve({
		Location: 'https://test-bucket.s3.amazonaws.com/',
	}),
);
const uploadCtorMock = vi.fn();
const uploadDoneMock = vi.fn(() => Promise.resolve());

vi.mock('@aws-sdk/lib-storage', async () => {
	const originalModule = await import('@aws-sdk/lib-storage');
	return {
		...originalModule,
		Upload: class {
			constructor(params: Options) {
				uploadCtorMock(params);
			}
			on = vi.fn();
			done = uploadDoneMock;
		},
	};
});
vi.mock('@aws-sdk/client-s3', async () => {
	const originalModule = await import('@aws-sdk/client-s3');
	return {
		...originalModule,
		S3Client: class {
			constructor(config: S3ClientConfig) {
				s3CtorMock(config);
			}
			send = s3SendMock;
			destroy = vi.fn();
		},
	};
});

let s3FilesService: S3FilesService;

beforeEach(() => {
	s3FilesService = new S3FilesService();
	s3CtorMock.mockClear();
	s3SendMock.mockClear();
	S3FilesService.resetFilesDirsCache();
	uploadCtorMock.mockClear();
	uploadDoneMock.mockClear();
});

describe('S3FilesService', () => {
	it('should initialize with valid credentials', () => {
		s3FilesService.initialize(
			'fakeAccessKey',
			'fakeSecretKey',
			'test-bucket',
		);
		expect(s3FilesService.isInitialized()).toBe(true);
		expect(s3CtorMock).toHaveBeenCalledWith({
			credentials: {
				accessKeyId: 'fakeAccessKey',
				secretAccessKey: 'fakeSecretKey',
			},
			maxAttempts: 5,
			region: 'us-east-1',
		} as S3ClientConfig);
	});

	it('should initialize with valid credentials, region and host', () => {
		s3FilesService.initialize(
			'fakeAccessKey',
			'fakeSecretKey',
			'test-bucket',
			'us-west-2',
			'https://localhost:4566',
		);
		expect(s3FilesService.isInitialized()).toBe(true);
		expect(s3CtorMock).toHaveBeenCalledWith({
			credentials: {
				accessKeyId: 'fakeAccessKey',
				secretAccessKey: 'fakeSecretKey',
			},
			maxAttempts: 5,
			region: 'us-west-2',
			endpoint: 'https://localhost:4566',
			forcePathStyle: true,
		} as S3ClientConfig);
	});

	it('should throw error when uploading files without initialization', async () => {
		await expect(() => s3FilesService.uploadFiles()).rejects.toThrowError(
			new Error(
				'S3FilesService not initialized. Call initialize() with credentials first.',
			),
		);
	});

	it('should upload files successfully with valid credentials', async () => {
		const recordingsFullScreenPath = `${MOCK_CWD}/recordings/chrome`;
		const recordingsQoePath = `${MOCK_CWD}/recordings/qoe`;
		const statsPath = `${MOCK_CWD}/stats`;

		const mockFiles: Record<string, string> = {
			[`${recordingsFullScreenPath}/full.mp4`]: '',
			[`${recordingsQoePath}/QOE_LoadTestSession1_User1_User2.webm`]: '',
			[`${recordingsQoePath}/QOE_LoadTestSession1_User2_User1.webm`]: '',
			[`${recordingsQoePath}/QOE_LoadTestSession2_User1_User2.webm`]: '',
			[`${recordingsQoePath}/QOE_LoadTestSession2_User2_User1.webm`]: '',
			[`${statsPath}/LoadTestSession1/User1/connections.json`]:
				'{"key": "value"}',
			[`${statsPath}/LoadTestSession1/User2/connections.json`]:
				'{"key": "value"}',
			[`${statsPath}/LoadTestSession2/User1/connections.json`]:
				'{"key": "value"}',
			[`${statsPath}/LoadTestSession2/User2/connections.json`]:
				'{"key": "value"}',
			[`${statsPath}/LoadTestSession1/User1/stats.json`]:
				'{"key": "value"}',
			[`${statsPath}/LoadTestSession1/User2/stats.json`]:
				'{"key": "value"}',
			[`${statsPath}/LoadTestSession2/User1/stats.json`]:
				'{"key": "value"}',
			[`${statsPath}/LoadTestSession2/User2/stats.json`]:
				'{"key": "value"}',
		};

		vol.fromJSON(mockFiles);
		const bucket = 'test-bucket';
		s3FilesService.initialize('fakeAccessKey', 'fakeSecretKey', bucket);
		await expect(s3FilesService.uploadFiles()).resolves.not.toThrow();

		expect(s3SendMock).toHaveBeenCalledWith(
			expect.objectContaining({
				input: { Bucket: bucket },
			}),
		);
		expect(uploadDoneMock).toHaveBeenCalledTimes(
			Object.keys(mockFiles).length,
		);

		// Verify Upload constructor was called with correct parameters for each file
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

		expect(uploadCtorMock).toHaveBeenCalledTimes(expectedKeys.length);

		for (const key of expectedKeys) {
			expect(uploadCtorMock).toHaveBeenCalledWith(
				expect.objectContaining({
					// there are other tests to check S3Client initialization
					client: expect.any(S3Client),
					params: expect.objectContaining({
						Bucket: bucket,
						Key: key,
						Body: expect.any(fs.ReadStream),
					}),
					queueSize: 4,
					partSize: 50 * 1024 * 1024,
					leavePartsOnError: false,
				}),
			);
		}
	});
});
