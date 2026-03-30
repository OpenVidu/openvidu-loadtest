import type { DockerService } from '../../docker.service.ts';
import type { ConfigService } from '../../config.service.ts';
import type { LocalFilesRepository } from '../../../repositories/files/local-files.repository.ts';
import {
	Role,
	type CreateUserBrowser,
	type UserJoinProperties,
} from '../../../types/create-user.type.ts';
import type { LKCreateUserBrowser } from '../../../types/com-modules/livekit.ts';
import { EmulatedFilePublishStreamService } from './emulated-file-publish-stream.service.ts';

interface EmulatedContainerInfo {
	containerId: string;
	sessionName: string;
	userName: string;
	createdAt: Date;
}

export class EmulatedBrowserService {
	// Track container IDs for cleanup (browser-specific info)
	private readonly containerMap = new Map<string, EmulatedContainerInfo>();

	private readonly dockerService: DockerService;
	private readonly configService: ConfigService;
	private readonly localFilesRepository: LocalFilesRepository;
	private readonly emulatedFilePublishStreamService: EmulatedFilePublishStreamService;

	private readonly LIVEKIT_CLI_IMAGE = 'livekit/livekit-cli';
	private readonly ROOM_EMPTY_TIMEOUT = 600; // 10 minutes

	constructor(
		dockerService: DockerService,
		configService: ConfigService,
		localFilesRepository: LocalFilesRepository,
		emulatedFilePublishStreamService: EmulatedFilePublishStreamService,
	) {
		this.dockerService = dockerService;
		this.configService = configService;
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

		// Check media files exist
		const filesExist = await this.localFilesRepository.existMediaFiles();
		if (!filesExist) {
			throw new Error(
				'WARNING! Media files not found. Have you downloaded the media files?',
			);
		}

		// Ensure LiveKit CLI image is available
		await this.ensureLivekitCliImage();

		// Create room if it doesn't exist
		await this.createRoomIfNeeded(lkRequest, sessionName);

		// Generate unique container name
		const basesuffix = `${sessionName}-${userId}-${Date.now()}`;

		const ffmpegContainerName = `ffmpeg-emulated-${basesuffix}`;

		if (
			properties.role === Role.PUBLISHER &&
			(properties.video || properties.audio)
		) {
			await this.emulatedFilePublishStreamService.startEmulatedStreams(
				ffmpegContainerName,
				properties.video,
				properties.audio,
			);
		}
		// Build the join command
		const joinCommand = this.buildJoinCommand(
			lkRequest,
			ffmpegContainerName,
		);

		const joinContainerName = `lk-emulated-${basesuffix}`;
		// Start the container
		const containerId = await this.dockerService.startContainer({
			Image: this.LIVEKIT_CLI_IMAGE,
			name: joinContainerName,
			Cmd: joinCommand,
			HostConfig: {
				Binds: [
					`${this.configService.getMediaFilesHostDir()}:/app/mediafiles/:ro`,
				],
				AutoRemove: true,
				NetworkMode:
					this.configService.getDockerizedBrowsersConfig()
						.networkName,
			},
		});

		// Store container info (tracking for cleanup)
		const connectionId = `${sessionName}_${userId}_${containerId.slice(0, 8)}`;
		this.containerMap.set(connectionId, {
			containerId,
			sessionName,
			userName: userId,
			createdAt: new Date(),
		});

		await this.checkConnectionIsAliveAndCorrect(
			properties,
			joinContainerName,
			ffmpegContainerName,
		);

		console.log(
			`Emulated participant created: connectionId=${connectionId}, containerId=${containerId}`,
		);

		return connectionId;
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
			const checkContainerName = `lk-check-room-${roomName}-${Date.now()}`;
			const items = await this.dockerService.runAndWaitContainer({
				Image: this.LIVEKIT_CLI_IMAGE,
				name: checkContainerName,
				Cmd: checkCommand,
				HostConfig: {
					AutoRemove: true,
					NetworkMode:
						this.configService.getDockerizedBrowsersConfig()
							.networkName,
				},
			});
			const logs = items[1];
			if (logs.includes(request.properties.sessionName)) {
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

				const createRoomContainerName = `lk-create-room-${roomName}-${Date.now()}`;
				await this.dockerService.runAndWaitContainer({
					Image: this.LIVEKIT_CLI_IMAGE,
					name: createRoomContainerName,
					Cmd: createRoomCommand,
					HostConfig: {
						AutoRemove: true,
						NetworkMode:
							this.configService.getDockerizedBrowsersConfig()
								.networkName,
					},
				});

				console.log(`Room ${roomName} created`);
			}
			void this.dockerService.removeContainer(checkContainerName);
		} catch (error) {
			console.log(`Room creation check failed: ${String(error)}`);
		}
	}

	private buildJoinCommand(
		request: LKCreateUserBrowser,
		ffmpegContainerName: string,
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
			if (properties.video) {
				parts.push('--publish', `h264://${ffmpegContainerName}:5004`);
			}

			if (properties.audio) {
				parts.push('--publish', `opus://${ffmpegContainerName}:5005`);
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

		try {
			await this.dockerService.stopContainer(containerInfo.containerId);
		} catch (error) {
			console.error(
				`Error stopping container for ${connectionId}:`,
				error,
			);
		}

		// Remove container tracking
		this.containerMap.delete(connectionId);

		console.log(`Emulated participant deleted: ${connectionId}`);
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

		console.log('Emulated participants cleaned');
	}

	getParticipantContainerId(connectionId: string): string | undefined {
		return this.containerMap.get(connectionId)?.containerId;
	}

	private async checkConnectionIsAliveAndCorrect(
		properties: UserJoinProperties,
		joinContainerName: string,
		ffmpegContainerName: string,
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
			return joinLogs.includes('connected to room');
		});
		if (!joinLogsOk) {
			const joinLogs =
				await this.dockerService.getLogsFromContainer(
					joinContainerName,
				);
			console.error(
				`Missing 'connected to room' in ${joinContainerName}:\n${joinLogs}`,
			);
			throw new Error(errorMsg);
		}
		console.log(
			`Join container ${joinContainerName} logs indicate successful connection`,
		);
		if (properties.role === Role.PUBLISHER) {
			console.log(
				`Role is PUBLISHER. Checking if FFmpeg container ${ffmpegContainerName} is running...`,
			);
			const ffmpegRunning = await retry(() =>
				this.dockerService.isContainerRunning(ffmpegContainerName),
			);
			if (!ffmpegRunning) {
				console.error(
					`FFmpeg container ${ffmpegContainerName} is not running`,
				);
				throw new Error(errorMsg);
			}
			console.log(
				`FFmpeg container ${ffmpegContainerName} running: ${ffmpegRunning}`,
			);
			if (properties.video || properties.audio) {
				console.log(
					`Checking join container ${joinContainerName} logs for published track...`,
				);
				const publishedTrack = await retry(async () => {
					const joinLogs =
						await this.dockerService.getLogsFromContainer(
							joinContainerName,
						);
					return (
						joinLogs.includes('published track') &&
						(!properties.video || joinLogs.includes('CAMERA')) &&
						(!properties.audio || joinLogs.includes('MICROPHONE'))
					);
				});
				if (!publishedTrack) {
					const joinLogs =
						await this.dockerService.getLogsFromContainer(
							joinContainerName,
						);
					console.error(
						`Missing 'published track' in ${joinContainerName} logs:\n${joinLogs}`,
					);
					throw new Error(errorMsg);
				}
				console.log(
					`Join container ${joinContainerName} logs indicate track published successfully`,
				);
			}
		}
	}
}
