import type { ConfigService } from '../../config.service.ts';
import type { WsService } from '../../ws.service.ts';
import type { LocalFilesRepository } from '../../../repositories/files/local-files.repository.ts';
import { RoomServiceClient } from 'livekit-server-sdk';
import {
	Role,
	type CreateUserBrowser,
	type UserJoinProperties,
} from '../../../types/create-user.type.ts';
import type { LKCreateUserBrowser } from '../../../types/com-modules/livekit.ts';
import { EmulatedFilePublishStreamService } from './emulated-file-publish-stream.service.ts';
import type {
	EmulatedParticipantLauncher,
	ParticipantHandle,
} from './emulated-participant-launcher.ts';
import type { JsonValue } from '../../../types/json.type.ts';
import {
	ERRORS_FILE,
	addSaveStatsToFileToQueue,
} from '../../../utils/stats-files.ts';
import * as fs from 'node:fs/promises';
import type { LoggerService } from '../../logger.service.ts';
import { createBoundedId, shortenIdentifier } from '../../../utils/id-utils.ts';

interface FailedParticipantCreationContext extends Partial<ParticipantHandle> {
	connectionId?: string;
}

export class EmulatedBrowserService {
	private readonly handleMap = new Map<string, ParticipantHandle>();
	private readonly healthCheckIntervals = new Map<string, NodeJS.Timeout>();
	private readonly reportedHealthErrors = new Set<string>();

	private readonly emulatedParticipantLauncher: EmulatedParticipantLauncher;
	private readonly configService: ConfigService;
	private readonly wsService: WsService;
	private readonly localFilesRepository: LocalFilesRepository;
	private readonly emulatedFilePublishStreamService: EmulatedFilePublishStreamService;
	private readonly logger: ReturnType<LoggerService['getLogger']>;

	private readonly ROOM_EMPTY_TIMEOUT = 600;
	private readonly CREATE_PARTICIPANT_MAX_ATTEMPTS = 3;
	private readonly CREATE_PARTICIPANT_RETRY_DELAY_MS = 1000;
	private readonly LIVEKIT_HEALTHCHECK_INTERVAL_MS = 5000;
	private readonly MAX_ERROR_LOG_CHARS = 3000;

	constructor(
		emulatedParticipantLauncher: EmulatedParticipantLauncher,
		configService: ConfigService,
		wsService: WsService,
		localFilesRepository: LocalFilesRepository,
		emulatedFilePublishStreamService: EmulatedFilePublishStreamService,
		loggerService: LoggerService,
	) {
		this.emulatedParticipantLauncher = emulatedParticipantLauncher;
		this.configService = configService;
		this.wsService = wsService;
		this.localFilesRepository = localFilesRepository;
		this.emulatedFilePublishStreamService =
			emulatedFilePublishStreamService;
		this.logger = loggerService.getLogger('EmulatedBrowserService');
	}

	async createEmulatedParticipant(
		request: CreateUserBrowser,
	): Promise<string> {
		const lkRequest = request as LKCreateUserBrowser;
		const properties = request.properties;
		const sessionName = properties.sessionName;
		const userId = properties.userId;

		this.logger.info(
			{ userId, sessionName },
			'Creating emulated participant',
		);

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
				this.logger.warn(
					{
						attempt,
						maxAttempts: this.CREATE_PARTICIPANT_MAX_ATTEMPTS,
						sessionName,
						userId,
						error: String(error),
					},
					'Emulated participant join attempt failed',
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
		let handle: ParticipantHandle | undefined;

		const shortSession = shortenIdentifier(sessionName, 'session');
		const shortUser = shortenIdentifier(userId, 'user');
		const now = Date.now();
		const participantId = createBoundedId(
			`emulated-${shortSession}-${shortUser}-${now}`,
			60,
		);

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

		const joinCommand = this.buildJoinCommand(
			lkRequest,
			videoSocket,
			audioSocket,
		);

		try {
			handle = await this.emulatedParticipantLauncher.createParticipant(
				joinCommand,
				participantId,
				sessionName,
				userId,
				videoSocket,
				audioSocket,
			);

			connectionId = createBoundedId(
				`${shortSession}_${shortUser}_${handle.handleId.slice(0, 8)}`,
				60,
			);
			this.handleMap.set(connectionId, handle);

			await this.checkConnectionIsAliveAndCorrect(
				properties,
				handle,
				participantId,
			);

			this.startParticipantHealthCheck(connectionId);

			this.logger.info(
				{ connectionId, handleId: handle.handleId },
				'Emulated participant created',
			);

			return connectionId;
		} catch (error) {
			await this.cleanupFailedParticipantCreation({
				handleId: handle?.handleId,
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
		context: FailedParticipantCreationContext,
	): Promise<void> {
		if (context.connectionId) {
			this.stopParticipantHealthCheck(context.connectionId);
			this.handleMap.delete(context.connectionId);
		}

		if (context.handleId) {
			await this.emulatedParticipantLauncher.stop(context.handleId);
		}

		if (
			context.participantId &&
			(context.videoSocket || context.audioSocket)
		) {
			await this.emulatedFilePublishStreamService.stopPublishing(
				context.participantId,
			);

			await this.cleanupSockets({
				participantId: context.participantId,
				handleId: context.handleId ?? '',
				sessionName: context.sessionName ?? '',
				userName: context.userName ?? '',
				videoSocket: context.videoSocket,
				audioSocket: context.audioSocket,
				createdAt: new Date(),
			});
		}
	}

	private async createRoomIfNeeded(
		request: LKCreateUserBrowser,
		roomName: string,
	): Promise<void> {
		this.logger.info({ roomName }, 'Checking if room exists...');

		const baseUrl = request.openviduUrl
			.replace('ws://', 'http://')
			.replace('wss://', 'https://');

		const roomService = new RoomServiceClient(
			baseUrl,
			request.livekitApiKey,
			request.livekitApiSecret,
		);

		try {
			const rooms = await roomService.listRooms([roomName]);
			if (rooms.length > 0) {
				this.logger.info({ roomName }, 'Room already exists');
			} else {
				await roomService.createRoom({
					name: roomName,
					emptyTimeout: this.ROOM_EMPTY_TIMEOUT,
				});
				this.logger.info({ roomName }, 'Room created');
			}
		} catch (error) {
			this.logger.warn(
				{ roomName, error: String(error) },
				'Room creation check failed',
			);
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
			if (properties.video && videoSocket) {
				parts.push('--publish', `h264://${videoSocket}`);
			}

			if (properties.audio && audioSocket) {
				parts.push('--publish', `opus://${audioSocket}`);
			}
		}

		parts.push(properties.sessionName);

		return parts;
	}

	async deleteStreamManagerWithConnectionId(
		connectionId: string,
	): Promise<void> {
		this.logger.info({ connectionId }, 'Deleting emulated participant');

		const handle = this.handleMap.get(connectionId);
		if (!handle) {
			this.logger.warn({ connectionId }, 'Handle not found');
			return;
		}

		this.stopParticipantHealthCheck(connectionId);

		try {
			await this.emulatedParticipantLauncher.stop(handle.handleId);
		} catch (error) {
			this.logger.error(
				{ connectionId, error },
				'Error stopping participant',
			);
		}

		if (handle.videoSocket || handle.audioSocket) {
			try {
				await this.emulatedFilePublishStreamService.stopPublishing(
					handle.participantId,
				);

				await this.cleanupSockets(handle);
			} catch (error) {
				this.logger.error(
					{ connectionId, error },
					'Error stopping socket streaming',
				);
			}
		}

		this.handleMap.delete(connectionId);

		this.logger.info({ connectionId }, 'Emulated participant deleted');
	}

	private async cleanupSockets(handle: ParticipantHandle): Promise<void> {
		const socketsToClean = [handle.videoSocket, handle.audioSocket].filter(
			Boolean,
		) as string[];

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
		this.logger.info(
			{ sessionId, userId },
			'Deleting emulated participants',
		);

		const toDelete: string[] = [];
		for (const [connectionId, handle] of this.handleMap) {
			if (
				handle.sessionName === sessionId &&
				handle.userName === userId
			) {
				toDelete.push(connectionId);
			}
		}

		await Promise.allSettled(
			toDelete.map(connectionId =>
				this.deleteStreamManagerWithConnectionId(connectionId),
			),
		);
	}

	async clean(): Promise<void> {
		this.logger.info('Cleaning emulated participants...');

		const connectionIds = Array.from(this.handleMap.keys());
		await Promise.allSettled(
			connectionIds.map(connectionId =>
				this.deleteStreamManagerWithConnectionId(connectionId),
			),
		);

		this.handleMap.clear();

		await this.emulatedFilePublishStreamService.stopPublishing();

		this.logger.info('Emulated participants cleaned');
	}

	getParticipantContainerId(connectionId: string): string | undefined {
		return this.handleMap.get(connectionId)?.handleId;
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

		const handle = this.handleMap.get(connectionId);
		if (!handle) {
			this.stopParticipantHealthCheck(connectionId);
			return;
		}

		try {
			const [isRunning, streamFailed] = await Promise.all([
				this.emulatedParticipantLauncher.isRunning(handle.handleId),
				Promise.resolve(
					this.emulatedFilePublishStreamService.isParticipantFailed(
						handle.participantId,
					),
				),
			]);

			if (!isRunning) {
				const logs = await this.getLogsSafely(handle.handleId);
				await this.handleUnhealthyParticipant(
					connectionId,
					'participant-not-running',
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

			const logs = await this.getLogsSafely(handle.handleId);
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

		const handle = this.handleMap.get(connectionId);
		if (handle) {
			this.reportHealthError(handle, connectionId, reason, logs);
		}

		await this.deleteStreamManagerWithConnectionId(connectionId).catch(
			error => {
				this.logger.error(
					{ connectionId, error },
					'Error cleaning unhealthy participant',
				);
			},
		);
	}

	private reportHealthError(
		handle: ParticipantHandle,
		connectionId: string,
		reason: string,
		logs?: string,
	): void {
		const payload: Record<string, string> = {
			event: 'EMULATED_PARTICIPANT_HEALTH_ERROR',
			source: 'lk-healthcheck',
			participant: handle.userName,
			session: handle.sessionName,
			timestamp: new Date().toISOString(),
			connectionId,
			participantId: handle.participantId,
			handleId: handle.handleId,
			reason,
		};

		if (logs) {
			payload.logs = this.truncateLogs(logs);
		}

		this.wsService.send(JSON.stringify(payload));
		this.saveErrorToStats(handle.userName, handle.sessionName, payload);
		this.logger.error(
			{ connectionId, reason },
			'Healthcheck error reported',
		);
	}

	private saveErrorToStats(
		participant: string,
		session: string,
		errorData: Record<string, JsonValue>,
	): void {
		addSaveStatsToFileToQueue(participant, session, ERRORS_FILE, errorData);
	}

	private async getLogsSafely(handleId: string): Promise<string | undefined> {
		try {
			return await this.emulatedParticipantLauncher.getLogs(handleId);
		} catch (error) {
			this.logger.warn(
				{ handleId, error: String(error) },
				'Failed to read logs',
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
		handle: ParticipantHandle,
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
					this.logger.info(
						{ attempt: i + 1, attempts },
						'Retrying...',
					);
					await new Promise(res => setTimeout(res, delayMs));
				}
			}
			return false;
		};

		this.logger.info(
			{ handleId: handle.handleId },
			'Checking if participant is running...',
		);
		const isRunning = await retry(() =>
			this.emulatedParticipantLauncher.isRunning(handle.handleId),
		);
		if (!isRunning) {
			this.logger.error(
				{ handleId: handle.handleId },
				'Participant is not running',
			);
			throw new Error(errorMsg);
		}
		this.logger.info(
			{ handleId: handle.handleId, isRunning },
			'Participant running check',
		);
		this.logger.info(
			{ handleId: handle.handleId },
			'Checking participant logs for successful connection...',
		);
		const joinLogsOk = await retry(async () => {
			const logs = await this.emulatedParticipantLauncher.getLogs(
				handle.handleId,
			);
			return this.hasSuccessfulJoinIndicators(logs);
		}, 5);
		if (!joinLogsOk) {
			const logs = await this.emulatedParticipantLauncher.getLogs(
				handle.handleId,
			);
			this.logger.error(
				{ handleId: handle.handleId, logs },
				'Missing connection indicators in logs',
			);
			throw new Error(errorMsg);
		}
		this.logger.info(
			{ handleId: handle.handleId },
			'Logs indicate successful connection',
		);

		if (properties.role === Role.PUBLISHER) {
			const streamActive =
				this.emulatedFilePublishStreamService.getParticipantSockets(
					participantId,
				);
			this.logger.info(
				{
					participantId,
					video: !!streamActive?.videoSocket,
					audio: !!streamActive?.audioSocket,
				},
				'Socket streaming active',
			);
		}
	}

	private normalizeContainerLogs(logs: string): string {
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
