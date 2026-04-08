import type { DockerService } from '../../docker.service.ts';
import type { ConfigService } from '../../config.service.ts';
import type { WsService } from '../../ws.service.ts';
import type { LocalFilesRepository } from '../../../repositories/files/local-files.repository.ts';
import {
	Role,
	type CreateUserBrowser,
	type UserJoinProperties,
} from '../../../types/create-user.type.ts';
import type { LKCreateUserBrowser } from '../../../types/com-modules/livekit.ts';
import { EmulatedFilePublishStreamService } from './emulated-file-publish-stream.service.ts';
import type { JsonValue } from '../../../types/json.type.ts';
import {
	ERRORS_FILE,
	addSaveStatsToFileToQueue,
} from '../../../utils/stats-files.ts';
import * as fs from 'node:fs/promises';

interface EmulatedContainerInfo {
	containerId: string;
	sessionName: string;
	userName: string;
	participantId: string;
	videoSocket?: string; // Unix socket path for video
	audioSocket?: string; // Unix socket path for audio
	createdAt: Date;
}

interface FailedParticipantCreationContext extends Partial<EmulatedContainerInfo> {
	connectionId?: string;
}

export class EmulatedBrowserService {
	// Track container IDs for cleanup (browser-specific info)
	private readonly containerMap = new Map<string, EmulatedContainerInfo>();
	private readonly healthCheckIntervals = new Map<string, NodeJS.Timeout>();
	private readonly reportedHealthErrors = new Set<string>();

	private readonly dockerService: DockerService;
	private readonly configService: ConfigService;
	private readonly wsService: WsService;
	private readonly localFilesRepository: LocalFilesRepository;
	private readonly emulatedFilePublishStreamService: EmulatedFilePublishStreamService;

	private readonly LIVEKIT_CLI_IMAGE = 'livekit/livekit-cli';
	private readonly ROOM_EMPTY_TIMEOUT = 600; // 10 minutes
	private readonly CREATE_PARTICIPANT_MAX_ATTEMPTS = 3;
	private readonly CREATE_PARTICIPANT_RETRY_DELAY_MS = 1000;
	private readonly LIVEKIT_HEALTHCHECK_INTERVAL_MS = 5000;
	private readonly MAX_ERROR_LOG_CHARS = 3000;

	constructor(
		dockerService: DockerService,
		configService: ConfigService,
		wsService: WsService,
		localFilesRepository: LocalFilesRepository,
		emulatedFilePublishStreamService: EmulatedFilePublishStreamService,
	) {
		this.dockerService = dockerService;
		this.configService = configService;
		this.wsService = wsService;
		this.localFilesRepository = localFilesRepository;
		this.emulatedFilePublishStreamService =
			emulatedFilePublishStreamService;
	}

	async createEmulatedParticipant(
		request: CreateUserBrowser,
	): Promise<string> {
		const lkRequest = request as LKCreateUserBrowser;
		const properties = request.properties;
		const sessionName = properties.sessionName;
		const userId = properties.userId;

		console.log(
			`Creating emulated participant: userId=${userId}, session=${sessionName}`,
		);

		// Check streaming media files exist (H.264 and Ogg)
		const streamingFilesExist =
			await this.localFilesRepository.existStreamingMediaFiles();
		if (!streamingFilesExist) {
			this.saveErrorToStats(userId, sessionName, {
				event: 'EMULATED_PARTICIPANT_CREATION_ERROR',
				source: 'emulated-browser-service',
				participant: userId,
				session: sessionName,
				timestamp: new Date().toISOString(),
				reason: 'streaming-media-files-missing',
				error: 'Streaming media files (.h264, .ogg) not found.',
			});
			throw new Error(
				'Streaming media files (.h264, .ogg) not found. Run prepare_scripts/generate-streaming-media.sh first.',
			);
		}

		try {
			// Ensure LiveKit CLI image is available
			await this.ensureLivekitCliImage();

			// Create room if it doesn't exist
			await this.createRoomIfNeeded(lkRequest, sessionName);
		} catch (error) {
			this.saveErrorToStats(userId, sessionName, {
				event: 'EMULATED_PARTICIPANT_CREATION_ERROR',
				source: 'emulated-browser-service',
				participant: userId,
				session: sessionName,
				timestamp: new Date().toISOString(),
				reason: 'creation-preparation-failed',
				error: String(error),
			});
			throw error;
		}

		let lastError: unknown;

		for (
			let attempt = 1;
			attempt <= this.CREATE_PARTICIPANT_MAX_ATTEMPTS;
			attempt++
		) {
			try {
				return await this.createEmulatedParticipantAttempt(
					lkRequest,
					properties,
					sessionName,
					userId,
				);
			} catch (error) {
				lastError = error;
				this.saveErrorToStats(userId, sessionName, {
					event: 'EMULATED_PARTICIPANT_CREATION_ERROR',
					source: 'emulated-browser-service',
					participant: userId,
					session: sessionName,
					timestamp: new Date().toISOString(),
					reason: 'creation-attempt-failed',
					attempt,
					maxAttempts: this.CREATE_PARTICIPANT_MAX_ATTEMPTS,
					error: String(error),
				});
				console.warn(
					`Emulated participant join attempt ${attempt}/${this.CREATE_PARTICIPANT_MAX_ATTEMPTS} failed for ${sessionName}/${userId}: ${String(error)}`,
				);
				if (attempt < this.CREATE_PARTICIPANT_MAX_ATTEMPTS) {
					await new Promise(resolve =>
						setTimeout(
							resolve,
							this.CREATE_PARTICIPANT_RETRY_DELAY_MS,
						),
					);
				}
			}
		}

		throw lastError instanceof Error
			? lastError
			: new Error(
					`Failed to create emulated participant: ${String(lastError)}`,
				);
	}

	private async createEmulatedParticipantAttempt(
		lkRequest: LKCreateUserBrowser,
		properties: UserJoinProperties,
		sessionName: string,
		userId: string,
	): Promise<string> {
		let connectionId: string | undefined;
		let containerId: string | undefined;

		// Generate unique identifier for this participant
		const basesuffix = `${sessionName}-${userId}-${Date.now()}`;
		const participantId = `emulated-${basesuffix}`;

		// Start socket streaming for publishers
		let videoSocket: string | undefined;
		let audioSocket: string | undefined;

		if (
			properties.role === Role.PUBLISHER &&
			(properties.video || properties.audio)
		) {
			const streamResult =
				await this.emulatedFilePublishStreamService.startEmulatedStreams(
					participantId,
					properties.video,
					properties.audio,
				);
			videoSocket = streamResult.videoSocket;
			audioSocket = streamResult.audioSocket;
		}

		// Build the join command with socket paths
		const joinCommand = this.buildJoinCommand(
			lkRequest,
			videoSocket,
			audioSocket,
		);

		const joinContainerName = `lk-emulated-${basesuffix}`;
		try {
			// Start the LiveKit CLI container
			// Note: AutoRemove is false so we can check logs after container exits
			containerId = await this.dockerService.startContainer({
				Image: this.LIVEKIT_CLI_IMAGE,
				name: joinContainerName,
				Cmd: joinCommand,
				HostConfig: {
					AutoRemove: false,
					NetworkMode:
						this.configService.getDockerizedBrowsersConfig()
							.networkName,
					// Mount socket directory so LiveKit CLI can access Unix sockets
					Binds: ['/tmp/openvidu-loadtest:/tmp/openvidu-loadtest:ro'],
				},
			});

			// Store container info (tracking for cleanup)
			connectionId = `${sessionName}_${userId}_${containerId.slice(0, 8)}`;
			this.containerMap.set(connectionId, {
				containerId,
				sessionName,
				userName: userId,
				participantId,
				videoSocket,
				audioSocket,
				createdAt: new Date(),
			});

			await this.checkConnectionIsAliveAndCorrect(
				properties,
				joinContainerName,
				participantId,
			);

			this.startParticipantHealthCheck(connectionId);

			console.log(
				`Emulated participant created: connectionId=${connectionId}, containerId=${containerId}`,
			);

			return connectionId;
		} catch (error) {
			await this.cleanupFailedParticipantCreation({
				containerId,
				connectionId,
				participantId,
				videoSocket,
				audioSocket,
				sessionName,
				userName: userId,
			});
			throw error;
		}
	}

	private async cleanupFailedParticipantCreation(
		containerInfo: FailedParticipantCreationContext,
	): Promise<void> {
		if (containerInfo.connectionId) {
			this.stopParticipantHealthCheck(containerInfo.connectionId);
			this.containerMap.delete(containerInfo.connectionId);
		}

		if (containerInfo.containerId) {
			await Promise.allSettled([
				this.dockerService.stopContainer(containerInfo.containerId),
				this.dockerService.removeContainer(containerInfo.containerId),
			]);
		}

		if (
			containerInfo.participantId &&
			(containerInfo.videoSocket || containerInfo.audioSocket)
		) {
			await this.emulatedFilePublishStreamService.stopPublishing(
				containerInfo.participantId,
			);

			await this.cleanupSockets({
				containerId: containerInfo.containerId ?? '',
				sessionName: containerInfo.sessionName ?? '',
				userName: containerInfo.userName ?? '',
				participantId: containerInfo.participantId,
				videoSocket: containerInfo.videoSocket,
				audioSocket: containerInfo.audioSocket,
				createdAt: containerInfo.createdAt ?? new Date(),
			});
		}
	}

	private async ensureLivekitCliImage(): Promise<void> {
		const imageExists = await this.dockerService.imageExists(
			this.LIVEKIT_CLI_IMAGE,
		);
		if (!imageExists) {
			console.log(`Pulling ${this.LIVEKIT_CLI_IMAGE} image...`);
			await this.dockerService.pullImage(this.LIVEKIT_CLI_IMAGE);
		}
	}

	private async createRoomIfNeeded(
		request: LKCreateUserBrowser,
		roomName: string,
	): Promise<void> {
		console.log(`Checking if room ${roomName} exists...`);

		const checkContainerName = `lk-check-room-${roomName}-${Date.now()}`;
		let createRoomContainerName: string | undefined;

		const checkCommand = [
			'room',
			'list',
			'--url',
			request.openviduUrl,
			'--api-key',
			request.livekitApiKey ?? '',
			'--api-secret',
			request.livekitApiSecret ?? '',
		];

		try {
			const items = await this.dockerService.runAndWaitContainer({
				Image: this.LIVEKIT_CLI_IMAGE,
				name: checkContainerName,
				Cmd: checkCommand,
				HostConfig: {
					// Keep container until we read logs to avoid Docker 409 races.
					AutoRemove: false,
					NetworkMode:
						this.configService.getDockerizedBrowsersConfig()
							.networkName,
				},
			});
			const logs = this.normalizeContainerLogs(items[1]);
			if (logs.includes(request.properties.sessionName.toLowerCase())) {
				console.log(`Room ${roomName} already exists`);
			} else {
				const createRoomCommand = [
					'room',
					'create',
					'--url',
					request.openviduUrl,
					'--api-key',
					request.livekitApiKey ?? '',
					'--api-secret',
					request.livekitApiSecret ?? '',
					'--empty-timeout',
					String(this.ROOM_EMPTY_TIMEOUT),
					roomName,
				];

				createRoomContainerName = `lk-create-room-${roomName}-${Date.now()}`;
				await this.dockerService.runAndWaitContainer({
					Image: this.LIVEKIT_CLI_IMAGE,
					name: createRoomContainerName,
					Cmd: createRoomCommand,
					HostConfig: {
						AutoRemove: false,
						NetworkMode:
							this.configService.getDockerizedBrowsersConfig()
								.networkName,
					},
				});

				console.log(`Room ${roomName} created`);
			}
		} catch (error) {
			console.log(`Room creation check failed: ${String(error)}`);
		} finally {
			await Promise.allSettled([
				this.dockerService.removeContainer(checkContainerName),
				createRoomContainerName
					? this.dockerService.removeContainer(
							createRoomContainerName,
						)
					: Promise.resolve(),
			]);
		}
	}

	private buildJoinCommand(
		request: LKCreateUserBrowser,
		videoSocket?: string,
		audioSocket?: string,
	): string[] {
		const properties = request.properties;
		const baseUrl = request.openviduUrl
			.replace('ws://', 'http://')
			.replace('wss://', 'https://');

		// Build the command parts
		const parts: string[] = [
			'room',
			'join',
			'--url',
			baseUrl,
			'--api-key',
			request.livekitApiKey ?? '',
			'--api-secret',
			request.livekitApiSecret ?? '',
			'--identity',
			properties.userId,
			'--auto-subscribe',
			'--fps',
			String(properties.frameRate),
		];

		if (properties.role === Role.PUBLISHER) {
			// Use Unix socket format: h264:///tmp/openvidu-loadtest/{id}/video.sock
			if (properties.video && videoSocket) {
				parts.push('--publish', `h264://${videoSocket}`);
			}

			if (properties.audio && audioSocket) {
				parts.push('--publish', `opus://${audioSocket}`);
			}
		}
		// Add room name at the end
		parts.push(properties.sessionName);

		return parts;
	}

	async deleteStreamManagerWithConnectionId(
		connectionId: string,
	): Promise<void> {
		console.log(`Deleting emulated participant: ${connectionId}`);

		const containerInfo = this.containerMap.get(connectionId);
		if (!containerInfo) {
			console.log(`Container ${connectionId} not found`);
			return;
		}

		this.stopParticipantHealthCheck(connectionId);

		// Stop and remove join container
		try {
			await this.dockerService.stopContainer(containerInfo.containerId);
			await this.dockerService.removeContainer(containerInfo.containerId);
		} catch (error) {
			console.error(
				`Error stopping/removing container for ${connectionId}:`,
				error,
			);
		}

		// Stop streaming sockets after LiveKit CLI has released them
		if (containerInfo.videoSocket || containerInfo.audioSocket) {
			try {
				await this.emulatedFilePublishStreamService.stopPublishing(
					containerInfo.participantId,
				);

				// Clean up socket files
				await this.cleanupSockets(containerInfo);
			} catch (error) {
				console.error(
					`Error stopping socket streaming for ${connectionId}:`,
					error,
				);
			}
		}

		// Remove container tracking
		this.containerMap.delete(connectionId);

		console.log(`Emulated participant deleted: ${connectionId}`);
	}

	private async cleanupSockets(
		containerInfo: EmulatedContainerInfo,
	): Promise<void> {
		const socketsToClean = [
			containerInfo.videoSocket,
			containerInfo.audioSocket,
		].filter(Boolean) as string[];

		for (const socketPath of socketsToClean) {
			try {
				await fs.unlink(socketPath);
			} catch {
				// Socket may already be removed
			}
		}
	}

	async deleteStreamManagerWithSessionAndUser(
		sessionId: string,
		userId: string,
	): Promise<void> {
		console.log(
			`Deleting emulated participants for session=${sessionId}, user=${userId}`,
		);

		const toDelete: string[] = [];
		for (const [connectionId, containerInfo] of this.containerMap) {
			if (
				containerInfo.sessionName === sessionId &&
				containerInfo.userName === userId
			) {
				toDelete.push(connectionId);
			}
		}

		for (const connectionId of toDelete) {
			await this.deleteStreamManagerWithConnectionId(connectionId);
		}
	}

	async clean(): Promise<void> {
		console.log('Cleaning emulated participants...');

		const connectionIds = Array.from(this.containerMap.keys());
		for (const connectionId of connectionIds) {
			try {
				await this.deleteStreamManagerWithConnectionId(connectionId);
			} catch (error) {
				console.error(`Error cleaning ${connectionId}:`, error);
			}
		}

		this.containerMap.clear();

		// Also clean up all socket streaming
		await this.emulatedFilePublishStreamService.stopPublishing();

		console.log('Emulated participants cleaned');
	}

	getParticipantContainerId(connectionId: string): string | undefined {
		return this.containerMap.get(connectionId)?.containerId;
	}

	private startParticipantHealthCheck(connectionId: string): void {
		this.stopParticipantHealthCheck(connectionId);
		this.reportedHealthErrors.delete(connectionId);

		const interval = setInterval(() => {
			void this.runParticipantHealthCheck(connectionId);
		}, this.LIVEKIT_HEALTHCHECK_INTERVAL_MS);

		this.healthCheckIntervals.set(connectionId, interval);
	}

	private stopParticipantHealthCheck(connectionId: string): void {
		const interval = this.healthCheckIntervals.get(connectionId);
		if (interval) {
			clearInterval(interval);
			this.healthCheckIntervals.delete(connectionId);
		}
	}

	private async runParticipantHealthCheck(
		connectionId: string,
	): Promise<void> {
		if (this.reportedHealthErrors.has(connectionId)) {
			return;
		}

		const containerInfo = this.containerMap.get(connectionId);
		if (!containerInfo) {
			this.stopParticipantHealthCheck(connectionId);
			return;
		}

		try {
			const [isRunning, streamFailed] = await Promise.all([
				this.dockerService.isContainerRunning(
					containerInfo.containerId,
				),
				Promise.resolve(
					this.emulatedFilePublishStreamService.isParticipantFailed(
						containerInfo.participantId,
					),
				),
			]);

			if (!isRunning) {
				const logs = await this.getContainerLogsSafely(
					containerInfo.containerId,
				);
				await this.handleUnhealthyParticipant(
					connectionId,
					'container-not-running',
					logs,
				);
				return;
			}

			if (streamFailed) {
				await this.handleUnhealthyParticipant(
					connectionId,
					'socket-stream-failed',
				);
				return;
			}

			const logs = await this.getContainerLogsSafely(
				containerInfo.containerId,
			);
			if (logs && this.hasFatalJoinIndicators(logs)) {
				await this.handleUnhealthyParticipant(
					connectionId,
					'fatal-log-indicator',
					logs,
				);
			}
		} catch (error) {
			await this.handleUnhealthyParticipant(
				connectionId,
				'healthcheck-execution-failed',
				String(error),
			);
		}
	}

	private async handleUnhealthyParticipant(
		connectionId: string,
		reason: string,
		logs?: string,
	): Promise<void> {
		if (this.reportedHealthErrors.has(connectionId)) {
			return;
		}

		this.reportedHealthErrors.add(connectionId);
		this.stopParticipantHealthCheck(connectionId);

		const containerInfo = this.containerMap.get(connectionId);
		if (containerInfo) {
			this.reportHealthError(containerInfo, connectionId, reason, logs);
		}

		await this.deleteStreamManagerWithConnectionId(connectionId).catch(
			error => {
				console.error(
					`Error cleaning unhealthy participant ${connectionId}:`,
					error,
				);
			},
		);
	}

	private reportHealthError(
		containerInfo: EmulatedContainerInfo,
		connectionId: string,
		reason: string,
		logs?: string,
	): void {
		const payload: Record<string, string> = {
			event: 'EMULATED_PARTICIPANT_HEALTH_ERROR',
			source: 'livekit-cli-healthcheck',
			participant: containerInfo.userName,
			session: containerInfo.sessionName,
			timestamp: new Date().toISOString(),
			connectionId,
			participantId: containerInfo.participantId,
			containerId: containerInfo.containerId,
			reason,
		};

		if (logs) {
			payload.logs = this.truncateLogs(logs);
		}

		this.wsService.send(JSON.stringify(payload));
		this.saveErrorToStats(
			containerInfo.userName,
			containerInfo.sessionName,
			payload,
		);
		console.error(
			`Healthcheck error reported for ${connectionId}: ${reason}`,
		);
	}

	private saveErrorToStats(
		participant: string,
		session: string,
		errorData: Record<string, JsonValue>,
	): void {
		addSaveStatsToFileToQueue(participant, session, ERRORS_FILE, errorData);
	}

	private async getContainerLogsSafely(
		containerId: string,
	): Promise<string | undefined> {
		try {
			return await this.dockerService.getLogsFromContainer(containerId);
		} catch (error) {
			console.warn(
				`Failed to read logs from container ${containerId}: ${String(error)}`,
			);
			return undefined;
		}
	}

	private truncateLogs(logs: string): string {
		if (logs.length <= this.MAX_ERROR_LOG_CHARS) {
			return logs;
		}

		return logs.slice(-this.MAX_ERROR_LOG_CHARS);
	}

	private async checkConnectionIsAliveAndCorrect(
		properties: UserJoinProperties,
		joinContainerName: string,
		participantId: string,
	): Promise<void> {
		const errorMsg = `User ${properties.userId} failed to join LiveKit room ${properties.sessionName}`;

		const retry = async (
			fn: () => Promise<boolean>,
			attempts = 10,
			delayMs = 1000,
		) => {
			for (let i = 0; i < attempts; i++) {
				if (await fn()) return true;
				if (i < attempts - 1) {
					console.log(`Retrying... (${i + 1}/${attempts})`);
					await new Promise(res => setTimeout(res, delayMs));
				}
			}
			return false;
		};

		console.log(
			`Checking if join container ${joinContainerName} is running...`,
		);
		const joinRunning = await retry(() =>
			this.dockerService.isContainerRunning(joinContainerName),
		);
		if (!joinRunning) {
			console.error(`Join container ${joinContainerName} is not running`);
			throw new Error(errorMsg);
		}
		console.log(
			`Join container ${joinContainerName} running: ${joinRunning}`,
		);
		console.log(
			`Checking join container ${joinContainerName} logs for successful connection...`,
		);
		const joinLogsOk = await retry(async () => {
			const joinLogs =
				await this.dockerService.getLogsFromContainer(
					joinContainerName,
				);
			return this.hasSuccessfulJoinIndicators(joinLogs);
		}, 5);
		if (!joinLogsOk) {
			const joinLogs =
				await this.dockerService.getLogsFromContainer(
					joinContainerName,
				);
			console.error(
				`Missing connection indicators in ${joinContainerName} logs:\n${joinLogs}`,
			);
			throw new Error(errorMsg);
		}
		console.log(
			`Join container ${joinContainerName} logs indicate successful connection`,
		);

		if (properties.role === Role.PUBLISHER) {
			const streamActive =
				this.emulatedFilePublishStreamService.getParticipantSockets(
					participantId,
				);
			console.log(
				`Socket streaming active for ${participantId}: video=${!!streamActive?.videoSocket}, audio=${!!streamActive?.audioSocket}`,
			);
		}
	}

	private normalizeContainerLogs(logs: string): string {
		// Docker logs may include binary multiplexing markers. Keep only
		// printable characters plus new lines/carriage returns/tabs.
		const sanitizedChars = Array.from(logs).filter(char => {
			const code = char.charCodeAt(0);
			return code === 9 || code === 10 || code === 13 || code >= 32;
		});

		return sanitizedChars.join('').toLowerCase();
	}

	private hasSuccessfulJoinIndicators(joinLogs: string): boolean {
		const normalizedLogs = this.normalizeContainerLogs(joinLogs);
		const hasConnectedToRoom = normalizedLogs.includes('connected to room');
		const hasIceConnected = normalizedLogs.includes(
			'ice connection state changed: connected',
		);
		const hasPeerConnected = normalizedLogs.includes(
			'peer connection state changed: connected',
		);

		return hasConnectedToRoom || (hasIceConnected && hasPeerConnected);
	}

	private hasFatalJoinIndicators(joinLogs: string): boolean {
		const normalizedLogs = this.normalizeContainerLogs(joinLogs);
		const fatalPatterns = [
			'peer connection state changed: failed',
			'ice connection state changed: failed',
			'failed to join',
			'panic:',
			'fatal',
			'disconnected from room',
			'unpublished track',
			'could not get sample from provider',
		];

		return fatalPatterns.some(pattern => normalizedLogs.includes(pattern));
	}
}
