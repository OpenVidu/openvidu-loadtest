import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RemotePersistenceService } from '../../src/services/files/remote-persistence.service.ts';
import { MOCK_CWD } from '../setup/unit/global-fs-setup.ts';
import { vol } from 'memfs';
import type { RemotePersistenceRepository } from '../../src/repositories/files/remote-persistence.repository.ts';

interface RepositoryMockBundle {
	repository: RemotePersistenceRepository;
	initialize: ReturnType<typeof vi.fn>;
	isInitialized: ReturnType<typeof vi.fn>;
	getTargetName: ReturnType<typeof vi.fn>;
	createTargetIfNeeded: ReturnType<typeof vi.fn>;
	uploadFile: ReturnType<typeof vi.fn>;
	clean: ReturnType<typeof vi.fn>;
}

function createRepositoryMock(): RepositoryMockBundle {
	let initialized = false;
	let targetName = '';

	const initialize = vi.fn(
		(_accessKey: string, _secretAccessKey: string, target: string) => {
			initialized = true;
			targetName = target;
		},
	);
	const isInitialized = vi.fn(() => initialized);
	const getTargetName = vi.fn(() => targetName);
	const createTargetIfNeeded = vi.fn(() => Promise.resolve());
	const uploadFile = vi.fn<RemotePersistenceRepository['uploadFile']>(() =>
		Promise.resolve(),
	);
	const clean = vi.fn(() => {
		initialized = false;
		targetName = '';
	});

	const repository: RemotePersistenceRepository = {
		initialize,
		isInitialized,
		getBucketName: getTargetName,
		createBucketIfNeeded: createTargetIfNeeded,
		uploadFile,
		clean,
	};

	return {
		repository,
		initialize,
		isInitialized,
		getTargetName,
		createTargetIfNeeded,
		uploadFile,
		clean,
	};
}

let remotePersistenceService: RemotePersistenceService;
let repositoryMock: RepositoryMockBundle;

beforeEach(() => {
	repositoryMock = createRepositoryMock();
	remotePersistenceService = new RemotePersistenceService(
		repositoryMock.repository,
	);
	vol.reset();
});

describe('RemotePersistenceService', () => {
	it('should delegate initialize with expected args', () => {
		remotePersistenceService.initialize(
			'fakeAccessKey',
			'fakeSecretKey',
			'test-target',
		);

		expect(repositoryMock.initialize).toHaveBeenCalledWith(
			'fakeAccessKey',
			'fakeSecretKey',
			'test-target',
			undefined,
			undefined,
		);
		expect(remotePersistenceService.isInitialized()).toBe(true);
	});

	it('should throw error when uploading files without initialization', async () => {
		await expect(
			remotePersistenceService.uploadFiles(),
		).rejects.toThrowError(
			new Error(
				'RemotePersistenceService not initialized. Call initialize() with credentials first.',
			),
		);

		expect(repositoryMock.createTargetIfNeeded).not.toHaveBeenCalled();
		expect(repositoryMock.uploadFile).not.toHaveBeenCalled();
	});

	it('should upload discovered files using repository abstraction', async () => {
		const recordingsFullScreenPath = `${MOCK_CWD}/recordings/chrome`;
		const recordingsQoePath = `${MOCK_CWD}/recordings/qoe`;
		const statsPath = `${MOCK_CWD}/stats`;

		const mockFiles: Record<string, string> = {
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

		vol.fromJSON(mockFiles);

		remotePersistenceService.initialize(
			'fakeAccessKey',
			'fakeSecretKey',
			'remote://test-target',
		);

		await expect(
			remotePersistenceService.uploadFiles(),
		).resolves.not.toThrow();

		expect(repositoryMock.createTargetIfNeeded).toHaveBeenCalledTimes(1);
		expect(repositoryMock.uploadFile).toHaveBeenCalledTimes(
			Object.keys(mockFiles).length,
		);

		const expectedPairs: [string, string][] = [
			[`${recordingsFullScreenPath}/full.mp4`, 'full.mp4'],
			[
				`${recordingsQoePath}/QOE_LoadTestSession1_User1_User2.webm`,
				'QOE_LoadTestSession1_User1_User2.webm',
			],
			[
				`${recordingsQoePath}/QOE_LoadTestSession1_User2_User1.webm`,
				'QOE_LoadTestSession1_User2_User1.webm',
			],
			[
				`${recordingsQoePath}/QOE_LoadTestSession2_User1_User2.webm`,
				'QOE_LoadTestSession2_User1_User2.webm',
			],
			[
				`${recordingsQoePath}/QOE_LoadTestSession2_User2_User1.webm`,
				'QOE_LoadTestSession2_User2_User1.webm',
			],
			[
				`${statsPath}/LoadTestSession1/User1/connections.json`,
				'stats/LoadTestSession1/User1/connections.json',
			],
			[
				`${statsPath}/LoadTestSession1/User2/connections.json`,
				'stats/LoadTestSession1/User2/connections.json',
			],
			[
				`${statsPath}/LoadTestSession2/User1/connections.json`,
				'stats/LoadTestSession2/User1/connections.json',
			],
			[
				`${statsPath}/LoadTestSession2/User2/connections.json`,
				'stats/LoadTestSession2/User2/connections.json',
			],
			[
				`${statsPath}/LoadTestSession1/User1/stats.json`,
				'stats/LoadTestSession1/User1/stats.json',
			],
			[
				`${statsPath}/LoadTestSession1/User2/stats.json`,
				'stats/LoadTestSession1/User2/stats.json',
			],
			[
				`${statsPath}/LoadTestSession2/User1/stats.json`,
				'stats/LoadTestSession2/User1/stats.json',
			],
			[
				`${statsPath}/LoadTestSession2/User2/stats.json`,
				'stats/LoadTestSession2/User2/stats.json',
			],
		];

		const normalizeSeparators = (value: string) =>
			value.replaceAll('\\', '/');

		const actualUploads = repositoryMock.uploadFile.mock.calls.map(
			([filePath, key]) =>
				[normalizeSeparators(String(filePath)), String(key)] as [
					string,
					string,
				],
		);

		const expectedUploads = expectedPairs.map(([filePath, key]) => [
			normalizeSeparators(filePath),
			key,
		]);

		expect(actualUploads).toEqual(expect.arrayContaining(expectedUploads));
	});

	it('should delegate cleanup to repository', () => {
		remotePersistenceService.clean();
		expect(repositoryMock.clean).toHaveBeenCalledTimes(1);
	});
});
