import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDockerService = {
	imageExists: vi.fn().mockResolvedValue(true),
	pullImage: vi.fn().mockResolvedValue(undefined),
	startContainer: vi.fn().mockResolvedValue('container-id-123'),
	runAndWaitContainer: vi.fn().mockResolvedValue(['container-id-123', '']),
	stopContainer: vi.fn().mockResolvedValue(undefined),
	removeContainer: vi.fn().mockResolvedValue(undefined),
	streamContainerLogs: vi.fn().mockResolvedValue(undefined),
	isContainerRunning: vi.fn().mockResolvedValue(true),
	getLogsFromContainer: vi
		.fn()
		.mockResolvedValue(
			'connected to room\npublished track\nCAMERA\nMICROPHONE',
		),
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
		.mockResolvedValue('/tmp/openvidu-loadtest/test/video.sock'),
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

vi.mock('../../src/services/docker.service.js', () => ({
	DockerService: vi.fn().mockImplementation(() => mockDockerService),
}));

vi.mock('../../src/services/config.service.js', () => ({
	ConfigService: vi.fn().mockImplementation(() => mockConfigService),
}));

vi.mock('../../src/repositories/files/local-files.repository.js', () => ({
	LocalFilesRepository: vi
		.fn()
		.mockImplementation(() => mockLocalFilesRepository),
}));

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

import { EmulatedBrowserService } from '../../src/services/browser/emulated/emulated-browser.service.js';
import { EmulatedFilePublishStreamService } from '../../src/services/browser/emulated/emulated-file-publish-stream.service.js';
import { Role } from '../../src/types/create-user.type.js';

describe('EmulatedBrowserService', () => {
	let service: EmulatedBrowserService;
	let emulatedFilePublishStreamService: EmulatedFilePublishStreamService;

	beforeEach(() => {
		vi.clearAllMocks();
		emulatedFilePublishStreamService = new EmulatedFilePublishStreamService(
			mockSocketWriterService as never,
			mockSocketWriterHealthService as never,
			mockLocalFilesRepository as never,
		);

		service = new EmulatedBrowserService(
			mockDockerService as never,
			mockConfigService as never,
			mockLocalFilesRepository as never,
			emulatedFilePublishStreamService as never,
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
				);

			service = new EmulatedBrowserService(
				mockDockerService as never,
				mockConfigService as never,
				failingLocalFilesRepository,
				emulatedFailStreamService as never,
			);

			await expect(
				service.createEmulatedParticipant(baseRequest as never),
			).rejects.toThrow('Streaming media files');
		});

		it('should retry participant creation after transient startup error', async () => {
			mockDockerService.startContainer
				.mockRejectedValueOnce(new Error('transient startup error'))
				.mockResolvedValueOnce('container-id-456');

			const result = await service.createEmulatedParticipant(
				baseRequest as never,
			);

			expect(result).toContain('test-session_test-user_');
			expect(mockDockerService.startContainer).toHaveBeenCalledTimes(2);
		});

		it('should keep room-check containers until logs are read', async () => {
			await service.createEmulatedParticipant(baseRequest as never);

			const runAndWaitCalls = mockDockerService.runAndWaitContainer.mock
				.calls as [{ HostConfig?: { AutoRemove?: boolean } }][];

			for (const [containerConfig] of runAndWaitCalls) {
				expect(containerConfig.HostConfig?.AutoRemove).toBe(false);
			}
		});

		it('should accept ICE and peer connected logs as successful join', async () => {
			mockDockerService.getLogsFromContainer.mockResolvedValueOnce(
				'\u0002\u0000\u0000\u0000\u0000\u0000\u0000k2026-04-03T23:10:14.691Z\tINFO\tlk.pion.pc\tICE connection state changed: connected\n\u0002\u0000\u0000\u0000\u0000\u0000\u0000r2026-04-03T23:10:14.694Z\tINFO\tlk.pion.pc\tpeer connection state changed: connected',
			);

			const result = await service.createEmulatedParticipant(
				baseRequest as never,
			);

			expect(result).toContain('test-session_test-user_');
		});

		it('should check if LiveKit CLI image exists', async () => {
			await service.createEmulatedParticipant(baseRequest as never);

			expect(mockDockerService.imageExists).toHaveBeenCalledWith(
				'livekit/livekit-cli',
			);
		});

		it('should pull image if it does not exist', async () => {
			mockDockerService.imageExists.mockResolvedValueOnce(false);

			await service.createEmulatedParticipant(baseRequest as never);

			expect(mockDockerService.pullImage).toHaveBeenCalledWith(
				'livekit/livekit-cli',
			);
		});

		it('should create container with correct configuration', async () => {
			await service.createEmulatedParticipant(baseRequest as never);

			expect(mockDockerService.startContainer).toHaveBeenCalledWith(
				expect.objectContaining({
					Image: 'livekit/livekit-cli',
					Cmd: expect.arrayContaining([
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
				}),
			);
		});

		it('should start socket writers for publishers', async () => {
			await service.createEmulatedParticipant(baseRequest as never);

			expect(mockSocketWriterService.startWriter).toHaveBeenCalled();
		});

		it('should return connection id on success', async () => {
			const result = await service.createEmulatedParticipant(
				baseRequest as never,
			);

			expect(result).toContain('test-session_test-user_');
			expect(result).toContain('containe'); // container-id-123 sliced to 8 chars
		});
	});

	describe('deleteStreamManagerWithConnectionId', () => {
		it('should do nothing if participant not found', async () => {
			await service.deleteStreamManagerWithConnectionId('non-existent');

			expect(mockDockerService.stopContainer).not.toHaveBeenCalled();
		});

		it('should stop join container before stopping socket writers', async () => {
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

			const stopContainerOrder =
				mockDockerService.stopContainer.mock.invocationCallOrder[0];
			const stopWriterOrder =
				mockSocketWriterService.stopWriter.mock.invocationCallOrder[0];

			expect(stopContainerOrder).toBeLessThan(stopWriterOrder);
		});

		it('should stop socket writers and container on delete', async () => {
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

			// Ensure join container (startContainer return value) was stopped
			expect(mockDockerService.stopContainer).toHaveBeenCalledWith(
				'container-id-123',
			);
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

			expect(mockDockerService.stopContainer).toHaveBeenCalled();
			// Verify container is no longer tracked
			expect(
				service.getParticipantContainerId(connectionId),
			).toBeUndefined();
		});

		it('should handle non-existent session gracefully', async () => {
			await service.deleteStreamManagerWithSessionAndUser(
				'non-existent',
				'user',
			);

			expect(mockDockerService.stopContainer).not.toHaveBeenCalled();
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

			expect(mockDockerService.stopContainer).toHaveBeenCalled();
			// Verify container is no longer tracked
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

		it('should return container id for existing connection', async () => {
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

			const containerId = service.getParticipantContainerId(connectionId);

			expect(containerId).toBe('container-id-123');
		});
	});
});
