import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
const mockConfigService = {
	getBrowserEmulatorHostForBrowsers: vi.fn().mockReturnValue('localhost'),
	isHttpsDisabled: vi.fn().mockReturnValue(true),
	getServerPort: vi.fn().mockReturnValue(5000),
};

const mockRealBrowserService = {
	launchBrowser: vi.fn().mockResolvedValue('real-connection-id'),
	deleteStreamManagerWithConnectionId: vi.fn().mockResolvedValue(undefined),
	deleteStreamManagerWithSessionAndUser: vi.fn().mockResolvedValue(undefined),
	clean: vi.fn().mockResolvedValue(undefined),
};

const mockEmulatedBrowserService = {
	createEmulatedParticipant: vi
		.fn()
		.mockResolvedValue('emulated-connection-id'),
	deleteStreamManagerWithConnectionId: vi.fn().mockResolvedValue(undefined),
	deleteStreamManagerWithSessionAndUser: vi.fn().mockResolvedValue(undefined),
	clean: vi.fn().mockResolvedValue(undefined),
};

const mockInstanceService = {
	getCpuUsage: vi.fn().mockReturnValue(50),
	WORKER_UUID: 'test-worker-uuid',
};

const mockElasticSearchService = {
	isElasticSearchRunning: vi.fn().mockReturnValue(false),
	sendJson: vi.fn().mockResolvedValue(undefined),
};

const mockRemotePersistenceService = {
	isInitialized: vi.fn().mockReturnValue(false),
};

vi.mock('../../src/services/config.service.js', () => ({
	ConfigService: vi.fn().mockImplementation(() => mockConfigService),
}));

vi.mock('../../src/services/real-browser.service.js', () => ({
	RealBrowserService: vi
		.fn()
		.mockImplementation(() => mockRealBrowserService),
}));

vi.mock('../../src/services/emulated-browser.service.js', () => ({
	EmulatedBrowserService: vi
		.fn()
		.mockImplementation(() => mockEmulatedBrowserService),
}));

vi.mock('../../src/services/instance.service.js', () => ({
	InstanceService: vi.fn().mockImplementation(() => mockInstanceService),
}));

vi.mock('../../src/services/elasticsearch.service.js', () => ({
	ElasticSearchService: vi
		.fn()
		.mockImplementation(() => mockElasticSearchService),
}));

vi.mock('../../src/services/files/remote-persistence.service.js', () => ({
	RemotePersistenceService: vi
		.fn()
		.mockImplementation(() => mockRemotePersistenceService),
}));

vi.mock('../../src/utils/stats-files.js', () => ({
	createAllStatFilesForSession: vi.fn().mockResolvedValue(undefined),
	addSaveStatsToFileToQueue: vi.fn(),
	waitForAllFilesToBeProcessed: vi.fn().mockResolvedValue(undefined),
	CON_FILE: 'connections.json',
}));

vi.mock(
	'../../src/data/browser-localstorage-configs/webrtc-stats-localstorage.js',
	() => ({
		WebrtcStatsLocalStorage: class {
			getItemName = vi.fn().mockReturnValue('webrtc-stats');
			getConfig = vi.fn().mockReturnValue('{}');
		},
	}),
);

vi.mock(
	'../../src/data/browser-localstorage-configs/openvidu-events-localstorage.js',
	() => ({
		OpenViduEventsLocalStorage: class {
			getItemName = vi.fn().mockReturnValue('ov-events');
			getConfig = vi.fn().mockReturnValue('{}');
		},
	}),
);

vi.mock(
	'../../src/data/browser-localstorage-configs/qoe-recordings-localstorage.js',
	() => ({
		QoERecordingsLocalStorage: class {
			getItemName = vi.fn().mockReturnValue('qoe-recordings');
			getConfig = vi.fn().mockReturnValue('{}');
		},
	}),
);

vi.mock(
	'../../src/data/browser-localstorage-configs/openvidu-error-event-localstorage.js',
	() => ({
		ErrorEventLocalStorage: class {
			getItemName = vi.fn().mockReturnValue('error-events');
			getConfig = vi.fn().mockReturnValue('{}');
		},
	}),
);

import { BrowserManagerService } from '../../src/services/browser/browser-manager.service.js';

describe('BrowserManagerService', () => {
	let service: BrowserManagerService;

	beforeEach(() => {
		vi.clearAllMocks();

		// Reset mock return values
		mockRealBrowserService.launchBrowser.mockResolvedValue(
			'real-connection-id',
		);
		mockEmulatedBrowserService.createEmulatedParticipant.mockResolvedValue(
			'emulated-connection-id',
		);

		service = new BrowserManagerService(
			mockConfigService as never,
			mockRealBrowserService as never,
			mockEmulatedBrowserService as never,
			mockInstanceService as never,
			mockElasticSearchService as never,
			mockRemotePersistenceService as never,
		);
	});

	describe('createStreamManager', () => {
		const baseRequest = {
			openviduUrl: 'http://localhost:4443',
			properties: {
				userId: 'test-user',
				sessionName: 'test-session',
				role: 'PUBLISHER' as const,
				audio: true,
				video: true,
				resolution: '640x480' as const,
				frameRate: 30,
				browser: 'chrome' as const,
			},
		};

		it('should use RealBrowserService when browser is chrome', async () => {
			const request = {
				...baseRequest,
				properties: {
					...baseRequest.properties,
					browser: 'chrome' as const,
				},
			};

			const result = await service.createStreamManager(request);

			expect(mockRealBrowserService.launchBrowser).toHaveBeenCalledTimes(
				1,
			);
			expect(
				mockEmulatedBrowserService.createEmulatedParticipant,
			).not.toHaveBeenCalled();
			expect(result.connectionId).toBe('real-connection-id');
		});

		it('should use EmulatedBrowserService when browser is emulated', async () => {
			const request = {
				...baseRequest,
				properties: {
					...baseRequest.properties,
					browser: 'emulated' as const,
				},
			};

			const result = await service.createStreamManager(request);

			expect(
				mockEmulatedBrowserService.createEmulatedParticipant,
			).toHaveBeenCalledTimes(1);
			expect(mockRealBrowserService.launchBrowser).not.toHaveBeenCalled();
			expect(result.connectionId).toBe('emulated-connection-id');
		});

		it('should throw error for invalid browser', async () => {
			const request = {
				...baseRequest,
				properties: {
					...baseRequest.properties,
					browser: 'INVALID' as never,
				},
			};

			await expect(service.createStreamManager(request)).rejects.toThrow(
				'Invalid browser',
			);
		});

		it('should track stream counts correctly', async () => {
			// Create a publisher
			const result = await service.createStreamManager(baseRequest);

			// 1 publisher = 1 stream sent, 0 received (no other publishers)
			expect(result.streams).toBe(1);
			expect(result.participants).toBe(1);
		});

		it('should track participant counts correctly', async () => {
			const result = await service.createStreamManager(baseRequest);

			expect(result.participants).toBe(1);
		});
	});

	describe('deleteStreamManagerWithConnectionId', () => {
		it('should try real browser service first', async () => {
			await service.deleteStreamManagerWithConnectionId('test-id');

			expect(
				mockRealBrowserService.deleteStreamManagerWithConnectionId,
			).toHaveBeenCalledWith('test-id');
		});

		it('should try emulated browser service if real fails', async () => {
			mockRealBrowserService.deleteStreamManagerWithConnectionId.mockRejectedValueOnce(
				new Error('Not found'),
			);

			await service.deleteStreamManagerWithConnectionId('test-id');

			expect(
				mockEmulatedBrowserService.deleteStreamManagerWithConnectionId,
			).toHaveBeenCalledWith('test-id');
		});
	});

	describe('deleteStreamManagerWithSessionAndUser', () => {
		it('should call both services', async () => {
			await service.deleteStreamManagerWithSessionAndUser(
				'session-1',
				'user-1',
			);

			expect(
				mockRealBrowserService.deleteStreamManagerWithSessionAndUser,
			).toHaveBeenCalledWith('session-1', 'user-1');
			expect(
				mockEmulatedBrowserService.deleteStreamManagerWithSessionAndUser,
			).toHaveBeenCalledWith('session-1', 'user-1');
		});
	});

	describe('clean', () => {
		it('should clean both services', async () => {
			await service.clean();

			expect(mockRealBrowserService.clean).toHaveBeenCalledTimes(1);
			expect(mockEmulatedBrowserService.clean).toHaveBeenCalledTimes(1);
		});
	});
});
