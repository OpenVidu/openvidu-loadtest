import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoggerService } from '../../src/services/logger.service.js';

const loggerService = new LoggerService();

const mockSeleniumService = {
	getDriver: vi.fn(),
	quitDriver: vi.fn().mockResolvedValue(undefined),
	setHeadless: vi.fn(),
	stopFullScreenRecording: vi.fn().mockResolvedValue(undefined),
};

const mockLocalFilesRepository = {
	existMediaFiles: vi.fn().mockResolvedValue(true),
	fakevideo: '/path/to/video.mp4',
	fakeaudio: '/path/to/audio.wav',
};

const mockComModule = {
	generateWebappUrl: vi
		.fn()
		.mockReturnValue('http://localhost:3000/?session=test&user=test'),
};

const mockWsService = {
	send: vi.fn(),
};

const mockWebhookRoutingService = {
	setCredentials: vi.fn(),
	registerIdentity: vi.fn(),
	unregisterIdentity: vi.fn(),
	registerPrefix: vi.fn(),
	unregisterPrefix: vi.fn(),
	dispatch: vi.fn(),
};

vi.mock('../../src/services/selenium.service.js', () => ({
	SeleniumService: vi.fn().mockImplementation(() => mockSeleniumService),
}));

vi.mock('../../src/repositories/files/local-files.repository.js', () => ({
	LocalFilesRepository: vi
		.fn()
		.mockImplementation(() => mockLocalFilesRepository),
}));

vi.mock('../../src/com-modules/base.js', () => ({
	default: vi.fn().mockImplementation(() => mockComModule),
}));

vi.mock('node:fs/promises', () => ({
	default: {
		open: vi.fn().mockResolvedValue({
			close: vi.fn().mockResolvedValue(undefined),
		}),
	},
}));

import { RealBrowserService } from '../../src/services/browser/real/real-browser.service.js';
import { Role } from '../../src/types/create-user.type.js';

describe('RealBrowserService', () => {
	let service: RealBrowserService;

	beforeEach(() => {
		vi.clearAllMocks();
		service = new RealBrowserService(
			mockSeleniumService as never,
			mockComModule as never,
			mockLocalFilesRepository as never,
			mockWsService as never,
			mockWebhookRoutingService as never,
			loggerService,
		);
	});

	describe('launchBrowser', () => {
		const baseRequest = {
			openviduUrl: 'http://localhost:4443',
			properties: {
				userId: 'test-user',
				sessionName: 'test-session',
				role: Role.PUBLISHER,
				audio: true,
				video: true,
				resolution: '640x480',
				frameRate: 30,
				browser: 'chrome' as const,
				headless: false,
			},
		};

		it('should throw error if media files do not exist', async () => {
			mockLocalFilesRepository.existMediaFiles.mockResolvedValueOnce(
				false,
			);

			await expect(
				service.launchBrowser(baseRequest as never),
			).rejects.toThrow('Media files not found');
		});

		it('should call setHeadless when headless is true', async () => {
			const request = {
				...baseRequest,
				properties: { ...baseRequest.properties, headless: true },
			};

			const mockDriver = {
				getSession: vi
					.fn()
					.mockResolvedValue({ getId: () => 'driver-id-123' }),
				manage: vi.fn().mockReturnValue({
					setTimeouts: vi.fn().mockResolvedValue(undefined),
				}),
				get: vi.fn().mockResolvedValue(undefined),
				wait: vi.fn().mockResolvedValue(undefined),
				sleep: vi.fn().mockResolvedValue(undefined),
				findElements: vi.fn().mockResolvedValue([]),
				executeScript: vi.fn().mockResolvedValue(undefined),
			};
			mockSeleniumService.getDriver.mockResolvedValue(mockDriver);

			await service.launchBrowser(request as never);

			expect(mockSeleniumService.setHeadless).toHaveBeenCalled();
		});

		it('should return connection id on successful launch', async () => {
			const mockDriver = {
				getSession: vi
					.fn()
					.mockResolvedValue({ getId: () => 'driver-id-123' }),
				manage: vi.fn().mockReturnValue({
					setTimeouts: vi.fn().mockResolvedValue(undefined),
					window: {
						maximize: vi.fn().mockResolvedValue(undefined),
					},
				}),
				get: vi.fn().mockResolvedValue(undefined),
				wait: vi.fn().mockResolvedValue(undefined),
				sleep: vi.fn().mockResolvedValue(undefined),
				findElements: vi.fn().mockResolvedValue([]),
				executeScript: vi.fn().mockResolvedValue(undefined),
			};
			mockSeleniumService.getDriver.mockResolvedValue(mockDriver);

			const result = await service.launchBrowser(baseRequest as never);

			expect(result).toBe('driver-id-123');
			expect(mockSeleniumService.getDriver).toHaveBeenCalledWith(
				'chrome',
				's-76832d_u-42b27e',
			);
		});

		it('registers the participant identity for webhook routing and caches credentials', async () => {
			const mockDriver = {
				getSession: vi
					.fn()
					.mockResolvedValue({ getId: () => 'driver-id-123' }),
				manage: vi.fn().mockReturnValue({
					setTimeouts: vi.fn().mockResolvedValue(undefined),
					window: { maximize: vi.fn().mockResolvedValue(undefined) },
				}),
				get: vi.fn().mockResolvedValue(undefined),
				wait: vi.fn().mockResolvedValue(undefined),
				sleep: vi.fn().mockResolvedValue(undefined),
				findElements: vi.fn().mockResolvedValue([]),
				executeScript: vi.fn().mockResolvedValue(undefined),
			};
			mockSeleniumService.getDriver.mockResolvedValue(mockDriver);

			await service.launchBrowser({
				...baseRequest,
				livekitApiKey: 'test-api-key',
				livekitApiSecret: 'test-api-secret',
			} as never);

			expect(
				mockWebhookRoutingService.setCredentials,
			).toHaveBeenCalledWith('test-api-key', 'test-api-secret');
			expect(
				mockWebhookRoutingService.registerIdentity,
			).toHaveBeenCalledWith('test-user', expect.any(Function));
		});

		it('reports a webhook-triggered error once without stopping the driver', async () => {
			const mockDriver = {
				getSession: vi
					.fn()
					.mockResolvedValue({ getId: () => 'driver-id-123' }),
				manage: vi.fn().mockReturnValue({
					setTimeouts: vi.fn().mockResolvedValue(undefined),
					window: { maximize: vi.fn().mockResolvedValue(undefined) },
				}),
				get: vi.fn().mockResolvedValue(undefined),
				wait: vi.fn().mockResolvedValue(undefined),
				sleep: vi.fn().mockResolvedValue(undefined),
				findElements: vi.fn().mockResolvedValue([]),
				executeScript: vi.fn().mockResolvedValue(undefined),
			};
			mockSeleniumService.getDriver.mockResolvedValue(mockDriver);

			await service.launchBrowser(baseRequest as never);
			const webhookHandler = mockWebhookRoutingService.registerIdentity
				.mock.calls[0][1] as (eventType: string) => void;

			webhookHandler('participant_left');
			webhookHandler('participant_left');

			expect(mockWsService.send).toHaveBeenCalledTimes(1);
			const payload = JSON.parse(
				mockWsService.send.mock.calls[0][0] as string,
			) as Record<string, string>;
			expect(payload.event).toBe('REAL_PARTICIPANT_WEBHOOK_ERROR');
			expect(payload.reason).toBe('webhook-participant_left');
			expect(mockSeleniumService.quitDriver).not.toHaveBeenCalled();
		});
	});

	describe('deleteStreamManagerWithConnectionId', () => {
		it('should do nothing if driver not found', async () => {
			await service.deleteStreamManagerWithConnectionId(
				'non-existent-id',
			);

			expect(mockSeleniumService.quitDriver).not.toHaveBeenCalled();
		});

		it('should quit driver and remove from map', async () => {
			const mockDriver = {
				getSession: vi
					.fn()
					.mockResolvedValue({ getId: () => 'driver-id-123' }),
				manage: vi.fn().mockReturnValue({
					setTimeouts: vi.fn().mockResolvedValue(undefined),
					window: { maximize: vi.fn().mockResolvedValue(undefined) },
				}),
				get: vi.fn().mockResolvedValue(undefined),
				wait: vi.fn().mockResolvedValue(undefined),
				sleep: vi.fn().mockResolvedValue(undefined),
				findElements: vi.fn().mockResolvedValue([]),
				executeScript: vi.fn().mockResolvedValue(undefined),
			};
			mockSeleniumService.getDriver.mockResolvedValue(mockDriver);

			await service.launchBrowser({
				openviduUrl: 'http://localhost:4443',
				properties: {
					userId: 'test-user',
					sessionName: 'test-session',
					role: Role.PUBLISHER,
					audio: true,
					video: true,
					resolution: '640x480',
					frameRate: 30,
					browser: 'chrome' as const,
					headless: false,
				},
			} as never);

			await service.deleteStreamManagerWithConnectionId('driver-id-123');

			expect(mockSeleniumService.quitDriver).toHaveBeenCalledWith(
				mockDriver,
			);
			expect(
				mockWebhookRoutingService.unregisterIdentity,
			).toHaveBeenCalledWith('test-user');
		});
	});

	describe('deleteStreamManagerWithSessionAndUser', () => {
		it('should find and delete drivers by session and user', async () => {
			const mockDriver = {
				getSession: vi
					.fn()
					.mockResolvedValue({ getId: () => 'driver-id-123' }),
				manage: vi.fn().mockReturnValue({
					setTimeouts: vi.fn().mockResolvedValue(undefined),
					window: { maximize: vi.fn().mockResolvedValue(undefined) },
				}),
				get: vi.fn().mockResolvedValue(undefined),
				wait: vi.fn().mockResolvedValue(undefined),
				sleep: vi.fn().mockResolvedValue(undefined),
				findElements: vi.fn().mockResolvedValue([]),
				executeScript: vi.fn().mockResolvedValue(undefined),
			};
			mockSeleniumService.getDriver.mockResolvedValue(mockDriver);

			await service.launchBrowser({
				openviduUrl: 'http://localhost:4443',
				properties: {
					userId: 'test-user',
					sessionName: 'test-session',
					role: Role.PUBLISHER,
					audio: true,
					video: true,
					resolution: '640x480',
					frameRate: 30,
					browser: 'chrome' as const,
					headless: false,
				},
			} as never);

			await service.deleteStreamManagerWithSessionAndUser(
				'test-session',
				'test-user',
			);

			expect(mockSeleniumService.quitDriver).toHaveBeenCalled();
		});
	});

	describe('clean', () => {
		it('should clean all browsers without recording script', async () => {
			await service.clean();

			expect(
				mockSeleniumService.stopFullScreenRecording,
			).toHaveBeenCalled();
		});
	});
});
