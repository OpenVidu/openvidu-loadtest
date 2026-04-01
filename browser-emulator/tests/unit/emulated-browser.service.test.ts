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
	fakevideo: '/path/to/video.mp4',
	fakeaudio: '/path/to/audio.wav',
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

import { EmulatedBrowserService } from '../../src/services/browser/emulated/emulated-browser.service.js';
import { EmulatedFilePublishStreamService } from '../../src/services/browser/emulated/emulated-file-publish-stream.service.js';
import { Role } from '../../src/types/create-user.type.js';

describe('EmulatedBrowserService', () => {
	let service: EmulatedBrowserService;
	let emulatedFilePublishStreamService: EmulatedFilePublishStreamService;

	beforeEach(() => {
		vi.clearAllMocks();
		emulatedFilePublishStreamService = new EmulatedFilePublishStreamService(
			mockDockerService as never,
			mockConfigService as never,
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

		it('should throw error if media files do not exist', async () => {
			const failingLocalFilesRepository = {
				existMediaFiles: vi.fn().mockResolvedValue(false),
				fakevideo: '/path/to/video.mp4',
				fakeaudio: '/path/to/audio.wav',
			} as never;

			const emulatedFailStreamService =
				new EmulatedFilePublishStreamService(
					mockDockerService as never,
					mockConfigService as never,
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
			).rejects.toThrow('Media files not found');
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

		it('should return connection id on success', async () => {
			const result = await service.createEmulatedParticipant(
				baseRequest as never,
			);

			expect(result).toContain('test-session_test-user_');
			expect(result).toContain('containe'); // container-id-123 sliced to 8 chars
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

		it('should stop and remove container on delete', async () => {
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

			expect(mockDockerService.stopContainer).toHaveBeenCalled();
			// Ensure ffmpeg container was also stopped
			expect(mockDockerService.stopContainer).toHaveBeenCalledWith(
				expect.stringContaining('ffmpeg-emulated-'),
			);
			// Ensure join container (startContainer return value) was stopped
			expect(mockDockerService.stopContainer).toHaveBeenCalledWith(
				'container-id-123',
			);
			expect(mockDockerService.removeContainer).toHaveBeenCalled();
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
			expect(mockDockerService.stopContainer).toHaveBeenCalledWith(
				expect.stringContaining('ffmpeg-emulated-'),
			);
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
			expect(mockDockerService.stopContainer).toHaveBeenCalledWith(
				expect.stringContaining('ffmpeg-emulated-'),
			);
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
