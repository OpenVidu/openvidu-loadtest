import * as path from 'node:path';

import type { DockerService } from '../../docker.service.ts';
import type { ConfigService } from '../../config.service.ts';
import type { LoggerService } from '../../logger.service.ts';
import type {
	EmulatedParticipantLauncher,
	ParticipantHandle,
} from './emulated-participant-launcher.ts';
import { shortenIdentifier } from '../../../utils/id-utils.ts';

export class DockerLauncher implements EmulatedParticipantLauncher {
	readonly mode = 'docker' as const;

	private readonly dockerService: DockerService;
	private readonly configService: ConfigService;
	private readonly logger: ReturnType<LoggerService['getLogger']>;

	private readonly LIVEKIT_CLI_IMAGE = 'livekit/livekit-cli';
	private readonly LK_PROFILING_IMAGE = 'lk-profiling:latest';

	constructor(
		dockerService: DockerService,
		configService: ConfigService,
		loggerService: LoggerService,
	) {
		this.dockerService = dockerService;
		this.configService = configService;
		this.logger = loggerService.getLogger('DockerLauncher');
	}

	private get isProfilingEnabled(): boolean {
		return this.configService.getLkProfileDir().length > 0;
	}

	private get imageName(): string {
		return this.isProfilingEnabled
			? this.LK_PROFILING_IMAGE
			: this.LIVEKIT_CLI_IMAGE;
	}

	async ensureImageExists(): Promise<void> {
		const image = this.imageName;
		const exists = await this.dockerService.imageExists(image);
		if (!exists) {
			if (this.isProfilingEnabled) {
				throw new Error(
					`Profiling image "${image}" not found. Build it with: ` +
						`docker build -f Dockerfile.lk-profiling -t ${image} .`,
				);
			}
			this.logger.info({ image }, 'Pulling image...');
			await this.dockerService.pullImage(image);
		}
	}

	async createParticipant(
		command: string[],
		participantId: string,
		sessionName: string,
		userName: string,
		videoSocket?: string,
		audioSocket?: string,
	): Promise<ParticipantHandle> {
		await this.ensureImageExists();

		const profilingFlags: string[] = [];
		const binds: string[] = [
			'/tmp/openvidu-loadtest:/tmp/openvidu-loadtest:ro',
		];

		const lkProfileDir = this.configService.getLkProfileDir();
		if (lkProfileDir) {
			const absProfileDir = path.resolve(lkProfileDir);
			profilingFlags.push(
				'--cpuprofile',
				`${absProfileDir}/${participantId}.cpu.pprof`,
				'--memprofile',
				`${absProfileDir}/${participantId}.mem.pprof`,
			);
			binds.push(`${absProfileDir}:${absProfileDir}:rw`);
		}

		const cmd = [...command, ...profilingFlags];

		// The session name is kept as a leading, deterministic prefix (rather than
		// being buried inside the joined command) so callers can reliably find all
		// containers belonging to a session, e.g. to inspect their logs.
		const shortSession = shortenIdentifier(sessionName, 'session');
		const commandPrefix = cmd
			.join('_')
			.replace(/[^a-zA-Z0-9_.-]/g, '_')
			.slice(0, 40);
		const suffix = participantId.slice(-8);
		const name = `lk-emulated-${shortSession}-${commandPrefix}-${suffix}`;

		await this.dockerService.removeContainer(name).catch(() => {
			// Ignore if container doesn't exist
		});

		const containerId = await this.dockerService.startContainer({
			Image: this.imageName,
			name,
			Cmd: cmd,
			HostConfig: {
				AutoRemove: false,
				NetworkMode:
					this.configService.getDockerizedBrowsersConfig()
						.networkName,
				Binds: binds,
				...(this.isProfilingEnabled
					? { PidMode: 'host', Privileged: true }
					: {}),
			},
		});

		return {
			participantId,
			handleId: containerId,
			sessionName,
			userName,
			videoSocket,
			audioSocket,
			createdAt: new Date(),
		};
	}

	async isRunning(handleId: string): Promise<boolean> {
		return this.dockerService.isContainerRunning(handleId);
	}

	async getLogs(handleId: string): Promise<string> {
		return this.dockerService.getLogsFromContainer(handleId);
	}

	async stop(handleId: string): Promise<void> {
		await this.dockerService.stopContainer(handleId);
		await this.dockerService.removeContainer(handleId);
	}
}
