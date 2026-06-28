import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoggerService } from '../../src/services/logger.service.js';

const loggerService = new LoggerService();

const mockLauncher = {
	mode: 'docker' as const,
	createParticipant: vi.fn().mockResolvedValue({
		participantId: 'emulated-test-participant',
		handleId: 'container-id-123',
		sessionName: 'test-session',
		userName: 'test-user',
		videoSocket: '/tmp/openvidu-loadtest/test/video.sock',
		audioSocket: undefined,
		createdAt: new Date(),
	}),
	isRunning: vi.fn().mockResolvedValue(true),
	getLogs: vi
		.fn()
		.mockResolvedValue(
			'connected to room\npublished track\nCAMERA\nMICROPHONE',
		),
	stop: vi.fn().mockResolvedValue(undefined),
};

const mockConfigService = {
	getBrowserEmulatorHostForBrowsers: vi.fn().mockReturnValue('localhost'),
	getDockerizedBrowsersConfig: vi.fn().mockReturnValue({
		networkName: 'browseremulator',
	}),
	getMediaFilesHostDir: vi.fn().mockReturnValue('/app/mediafiles'),
	getScriptsLogsHostDir: vi.fn().mockReturnValue('/app/logs'),
	isHttpsDisabled: vi.fn().mockReturnValue(true),
	getServerPort: vi.fn().mockReturnValue(5000),
};

const mockWsService = {
	send: vi.fn(),
};

const mockLocalFilesRepository = {
	existMediaFiles: vi.fn().mockResolvedValue(true),
	existStreamingMediaFiles: vi.fn().mockResolvedValue(true),
	downloadStreamingFiles: vi.fn().mockResolvedValue({
		videoPath: '/path/to/video.h264',
		audioPath: '/path/to/audio.ogg',
	}),
	fakevideo: '/path/to/video.mp4',
	fakeaudio: '/path/to/audio.wav',
	fakevideoStreaming: '/path/to/video.h264',
	fakeaudioStreaming: '/path/to/audio.ogg',
};

const mockSocketWriterService = {
	startWriter: vi
		.fn()
		.mockResolvedValueOnce('/tmp/openvidu-loadtest/test/video.sock')
		.mockResolvedValueOnce('/tmp/openvidu-loadtest/test/audio.sock'),
	stopWriter: vi.fn().mockResolvedValue(undefined),
	stopAllWriters: vi.fn().mockResolvedValue(undefined),
	hasWriter: vi.fn().mockReturnValue(true),
	getSocketPath: vi
		.fn()
		.mockReturnValue('/tmp/openvidu-loadtest/test/video.sock'),
};

const mockSocketWriterHealthService = {
	startCheck: vi.fn(),
	stopCheck: vi.fn(),
	stopAllChecks: vi.fn(),
	hasCheck: vi.fn().mockReturnValue(false),
};

vi.mock('../../src/services/streaming/socket-writer.service.js', () => ({
	SocketWriterService: vi
		.fn()
		.mockImplementation(() => mockSocketWriterService),
}));

vi.mock('../../src/services/streaming/socket-writer-health.service.js', () => ({
	SocketWriterHealthService: vi
		.fn()
		.mockImplementation(() => mockSocketWriterHealthService),
}));

const mockRoomServiceClient = vi.hoisted(() => ({
	listRooms: vi.fn().mockResolvedValue([]),
	createRoom: vi.fn().mockResolvedValue({}),
}));

vi.mock('livekit-server-sdk', () => ({
	RoomServiceClient: class {
		constructor() {
			return mockRoomServiceClient;
		}
	},
}));

vi.mock('../../src/utils/stats-files.js', () => ({
	ERRORS_FILE: 'errors.json',
	addSaveStatsToFileToQueue: vi.fn(),
}));

import { EmulatedBrowserService } from '../../src/services/browser/emulated/emulated-browser.service.js';
import { EmulatedFilePublishStreamService } from '../../src/services/browser/emulated/emulated-file-publish-stream.service.js';
import { Role } from '../../src/types/create-user.type.js';
import { addSaveStatsToFileToQueue } from '../../src/utils/stats-files.js';

describe('EmulatedBrowserService', () => {
	let service: EmulatedBrowserService;
	let emulatedFilePublishStreamService: EmulatedFilePublishStreamService;

	beforeEach(() => {
		vi.clearAllMocks();
		mockSocketWriterService.startWriter
			.mockResolvedValueOnce('/tmp/openvidu-loadtest/test/video.sock')
			.mockResolvedValueOnce('/tmp/openvidu-loadtest/test/audio.sock');
		mockRoomServiceClient.listRooms.mockResolvedValue([]);
		mockRoomServiceClient.createRoom.mockResolvedValue({});
		emulatedFilePublishStreamService = new EmulatedFilePublishStreamService(
			mockSocketWriterService as never,
			mockSocketWriterHealthService as never,
			mockLocalFilesRepository as never,
			loggerService,
		);

		service = new EmulatedBrowserService(
			mockLauncher as never,
			mockConfigService as never,
			mockWsService as never,
			mockLocalFilesRepository as never,
			emulatedFilePublishStreamService,
			loggerService,
		);
	});

	describe('createEmulatedParticipant', () => {
		const baseRequest = {
			openviduUrl: 'ws://localhost:7880',
			livekitApiKey: 'test-api-key',
			livekitApiSecret: 'test-api-secret',
			properties: {
				userId: 'test-user',
				sessionName: 'test-session',
				role: Role.PUBLISHER,
				audio: true,
				video: true,
				resolution: '640x480',
				frameRate: 30,
				browser: 'emulated' as const,
			},
		};

		it('should throw error if streaming media files do not exist', async () => {
			const failingLocalFilesRepository = {
				existMediaFiles: vi.fn().mockResolvedValue(true),
				existStreamingMediaFiles: vi.fn().mockResolvedValue(false),
				fakevideo: '/path/to/video.mp4',
				fakeaudio: '/path/to/audio.wav',
				fakevideoStreaming: undefined,
				fakeaudioStreaming: undefined,
			} as never;

			const emulatedFailStreamService =
				new EmulatedFilePublishStreamService(
					mockSocketWriterService as never,
					mockSocketWriterHealthService as never,
					failingLocalFilesRepository,
					loggerService,
				);

			service = new EmulatedBrowserService(
				mockLauncher as never,
				mockConfigService as never,
				mockWsService as never,
				failingLocalFilesRepository,
				emulatedFailStreamService,
				loggerService,
			);

			await expect(
				service.createEmulatedParticipant(baseRequest as never),
			).rejects.toThrow('Streaming media files');

			expect(addSaveStatsToFileToQueue).toHaveBeenCalledWith(
				'test-user',
				'test-session',
				'errors.json',
				expect.objectContaining({
					event: 'EMULATED_PARTICIPANT_CREATION_ERROR',
					reason: 'streaming-media-files-missing',
				}),
			);
		});

		it('should retry participant creation after transient startup error', async () => {
			mockLauncher.createParticipant
				.mockRejectedValueOnce(new Error('transient startup error'))
				.mockResolvedValueOnce({
					participantId: 'emulated-test-participant',
					handleId: 'container-id-456',
					sessionName: 'test-session',
					userName: 'test-user',
					videoSocket: '/tmp/openvidu-loadtest/test/video.sock',
					audioSocket: undefined,
					createdAt: new Date(),
				});

			const result = await service.createEmulatedParticipant(
				baseRequest as never,
			);

			expect(result).toContain('s-76832d_u-42b27e_');
			expect(mockLauncher.createParticipant).toHaveBeenCalledTimes(2);
		});

		it('should create room via SDK if it does not exist', async () => {
			mockRoomServiceClient.listRooms.mockResolvedValueOnce([]);

			await service.createEmulatedParticipant(baseRequest as never);

			expect(mockRoomServiceClient.listRooms).toHaveBeenCalledWith([
				'test-session',
			]);
			expect(mockRoomServiceClient.createRoom).toHaveBeenCalledWith({
				name: 'test-session',
				emptyTimeout: 600,
			});
		});

		it('should not create room if it already exists', async () => {
			mockRoomServiceClient.listRooms.mockResolvedValueOnce([
				{ name: 'test-session' },
			] as never);

			await service.createEmulatedParticipant(baseRequest as never);

			expect(mockRoomServiceClient.listRooms).toHaveBeenCalledWith([
				'test-session',
			]);
			expect(mockRoomServiceClient.createRoom).not.toHaveBeenCalled();
		});

		it('should accept ICE and peer connected logs as successful join', async () => {
			mockLauncher.getLogs.mockResolvedValueOnce(
				'\u0002\u0000\u0000\u0000\u0000\u0000\u0000k2026-04-03T23:10:14.691Z\tINFO\tlk.pion.pc\tICE connection state changed: connected\n\u0002\u0000\u0000\u0000\u0000\u0000\u0000r2026-04-03T23:10:14.694Z\tINFO\tlk.pion.pc\tpeer connection state changed: connected',
			);

			const result = await service.createEmulatedParticipant(
				baseRequest as never,
			);

			expect(result).toContain('s-76832d_u-42b27e_');
		});

		it('should call launcher createParticipant with correct command', async () => {
			await service.createEmulatedParticipant(baseRequest as never);

			const callArgs = mockLauncher.createParticipant.mock.calls[0];
			const commandArgs = callArgs[0] as string[];

			expect(commandArgs).toEqual(
				expect.arrayContaining([
					'room',
					'join',
					'--url',
					expect.any(String),
					'--api-key',
					expect.any(String),
					'--api-secret',
					expect.any(String),
					'--identity',
					expect.any(String),
					'--auto-subscribe',
					'--fps',
					expect.any(String),
				]),
			);
			expect(typeof callArgs[1]).toBe('string');
			expect(callArgs[2]).toBe('test-session');
			expect(callArgs[3]).toBe('test-user');
			expect(typeof callArgs[4]).toBe('string');
			expect(typeof callArgs[5]).toBe('string');
		});

		it('should start socket writers for publishers', async () => {
			await service.createEmulatedParticipant(baseRequest as never);

			expect(mockSocketWriterService.startWriter).toHaveBeenCalled();
		});

		it('should return connection id on success', async () => {
			const result = await service.createEmulatedParticipant(
				baseRequest as never,
			);

			expect(result).toContain('s-76832d_u-42b27e_');
			expect(result).toContain('containe');
		});

		it('should report healthcheck errors through websocket when participant stops', async () => {
			vi.useFakeTimers();
			try {
				const connectionId = await service.createEmulatedParticipant(
					baseRequest as never,
				);
				mockLauncher.isRunning.mockResolvedValueOnce(false);

				await vi.advanceTimersByTimeAsync(6000);

				expect(mockWsService.send).toHaveBeenCalled();
				const firstSendArg = mockWsService.send.mock.calls[0]?.[0] as
					| string
					| undefined;

				const payload = JSON.parse(
					String(firstSendArg ?? '{}'),
				) as Record<string, string>;
				expect(payload.event).toBe('EMULATED_PARTICIPANT_HEALTH_ERROR');
				expect(payload.reason).toBe('participant-not-running');
				expect(payload.connectionId).toBe(connectionId);

				expect(addSaveStatsToFileToQueue).toHaveBeenCalledWith(
					'test-user',
					'test-session',
					'errors.json',
					expect.objectContaining({
						event: 'EMULATED_PARTICIPANT_HEALTH_ERROR',
						reason: 'participant-not-running',
					}),
				);
			} finally {
				vi.useRealTimers();
			}
		});
	});

	describe('deleteStreamManagerWithConnectionId', () => {
		it('should do nothing if participant not found', async () => {
			await service.deleteStreamManagerWithConnectionId('non-existent');

			expect(mockLauncher.stop).not.toHaveBeenCalled();
		});

		it('should stop participant before stopping socket writers', async () => {
			const connectionId = await service.createEmulatedParticipant({
				openviduUrl: 'ws://localhost:7880',
				livekitApiKey: 'test-api-key',
				livekitApiSecret: 'test-api-secret',
				properties: {
					userId: 'test-user',
					sessionName: 'test-session',
					role: Role.PUBLISHER,
					audio: true,
					video: true,
					resolution: '640x480',
					frameRate: 30,
					browser: 'emulated',
				},
			} as never);

			await service.deleteStreamManagerWithConnectionId(connectionId);

			const launcherCalledBeforeWriter =
				mockLauncher.stop.mock.calls.length > 0 &&
				(mockSocketWriterService.stopWriter.mock.calls.length === 0 ||
					mockLauncher.stop.mock.invocationCallOrder[0] <
						mockSocketWriterService.stopWriter.mock
							.invocationCallOrder[0]);

			expect(launcherCalledBeforeWriter).toBe(true);
		});

		it('should stop socket writers and launcher on delete', async () => {
			const connectionId = await service.createEmulatedParticipant({
				openviduUrl: 'ws://localhost:7880',
				livekitApiKey: 'test-api-key',
				livekitApiSecret: 'test-api-secret',
				properties: {
					userId: 'test-user',
					sessionName: 'test-session',
					role: Role.PUBLISHER,
					audio: true,
					video: true,
					resolution: '640x480',
					frameRate: 30,
					browser: 'emulated',
				},
			} as never);

			await service.deleteStreamManagerWithConnectionId(connectionId);

			expect(mockLauncher.stop).toHaveBeenCalledWith('container-id-123');
		});
	});

	describe('deleteStreamManagerWithSessionAndUser', () => {
		it('should find and delete participants by session and user', async () => {
			const connectionId = await service.createEmulatedParticipant({
				openviduUrl: 'ws://localhost:7880',
				livekitApiKey: 'test-api-key',
				livekitApiSecret: 'test-api-secret',
				properties: {
					userId: 'test-user',
					sessionName: 'test-session',
					role: Role.PUBLISHER,
					audio: true,
					video: true,
					resolution: '640x480',
					frameRate: 30,
					browser: 'emulated',
				},
			} as never);

			await service.deleteStreamManagerWithSessionAndUser(
				'test-session',
				'test-user',
			);

			expect(mockLauncher.stop).toHaveBeenCalled();
			expect(
				service.getParticipantContainerId(connectionId),
			).toBeUndefined();
		});

		it('should handle non-existent session gracefully', async () => {
			await service.deleteStreamManagerWithSessionAndUser(
				'non-existent',
				'user',
			);

			expect(mockLauncher.stop).not.toHaveBeenCalled();
		});
	});

	describe('clean', () => {
		it('should clean all participants', async () => {
			const connectionId = await service.createEmulatedParticipant({
				openviduUrl: 'ws://localhost:7880',
				livekitApiKey: 'test-api-key',
				livekitApiSecret: 'test-api-secret',
				properties: {
					userId: 'test-user',
					sessionName: 'test-session',
					role: Role.PUBLISHER,
					audio: true,
					video: true,
					resolution: '640x480',
					frameRate: 30,
					browser: 'emulated',
				},
			} as never);

			await service.clean();

			expect(mockLauncher.stop).toHaveBeenCalled();
			expect(
				service.getParticipantContainerId(connectionId),
			).toBeUndefined();
		});
	});

	describe('getParticipantContainerId', () => {
		it('should return undefined for non-existent connection', () => {
			expect(
				service.getParticipantContainerId('non-existent'),
			).toBeUndefined();
		});

		it('should return handle id for existing connection', async () => {
			const connectionId = await service.createEmulatedParticipant({
				openviduUrl: 'ws://localhost:7880',
				livekitApiKey: 'test-api-key',
				livekitApiSecret: 'test-api-secret',
				properties: {
					userId: 'test-user',
					sessionName: 'test-session',
					role: Role.PUBLISHER,
					audio: true,
					video: true,
					resolution: '640x480',
					frameRate: 30,
					browser: 'emulated',
				},
			} as never);

			const handleId = service.getParticipantContainerId(connectionId);

			expect(handleId).toBe('container-id-123');
		});
	});
});
