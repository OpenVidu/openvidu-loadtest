import type { LoggerService } from '../../logger.service.ts';
import type {
	EmulatedParticipantLauncher,
	ParticipantHandle,
} from './emulated-participant-launcher.ts';
import type { LoadTestRunRequest } from '../../../types/load-test.type.ts';
import { createBoundedId } from '../../../utils/id-utils.ts';

/**
 * Launches `lk load-test` runs. Each run is a single lk process that simulates many
 * publishers/subscribers in one room, reusing the same launcher (docker/direct) as the
 * per-participant `lk room join` path.
 */
export class LoadTestRunnerService {
	private readonly runMap = new Map<string, ParticipantHandle>();

	private readonly emulatedParticipantLauncher: EmulatedParticipantLauncher;
	private readonly logger: ReturnType<LoggerService['getLogger']>;

	constructor(
		emulatedParticipantLauncher: EmulatedParticipantLauncher,
		loggerService: LoggerService,
	) {
		this.emulatedParticipantLauncher = emulatedParticipantLauncher;
		this.logger = loggerService.getLogger('LoadTestRunnerService');
	}

	async startLoadTest(
		request: LoadTestRunRequest,
	): Promise<{ runId: string; handleId: string }> {
		const command = this.buildLoadTestCommand(request);

		const sanitizedRoom = request.room.replace(/[^a-zA-Z0-9_.-]/g, '_');
		const runId = createBoundedId(
			`loadtest-${sanitizedRoom}-${Date.now()}`,
			60,
		);
		const identity = request.identityPrefix ?? runId;

		this.logger.info(
			{ runId, room: request.room, command: command.join(' ') },
			'Starting load-test run',
		);

		const handle = await this.emulatedParticipantLauncher.createParticipant(
			command,
			runId,
			request.room,
			identity,
		);

		this.runMap.set(runId, handle);

		this.logger.info(
			{ runId, handleId: handle.handleId },
			'Load-test run started',
		);

		return { runId, handleId: handle.handleId };
	}

	async stopLoadTest(runId: string): Promise<void> {
		const handle = this.runMap.get(runId);
		if (!handle) {
			this.logger.warn({ runId }, 'Load-test run not found');
			return;
		}
		try {
			await this.emulatedParticipantLauncher.stop(handle.handleId);
		} catch (error) {
			this.logger.error({ runId, error }, 'Error stopping load-test run');
		}
		this.runMap.delete(runId);
	}

	async stopAll(): Promise<void> {
		const runIds = Array.from(this.runMap.keys());
		await Promise.allSettled(runIds.map(id => this.stopLoadTest(id)));
		this.runMap.clear();
	}

	private buildLoadTestCommand(request: LoadTestRunRequest): string[] {
		const baseUrl = request.openviduUrl
			.replace('ws://', 'http://')
			.replace('wss://', 'https://');

		const parts: string[] = [
			'load-test',
			'--url',
			baseUrl,
			'--api-key',
			request.livekitApiKey,
			'--api-secret',
			request.livekitApiSecret,
			'--room',
			request.room,
		];

		if (request.videoPublishers && request.videoPublishers > 0) {
			parts.push('--video-publishers', String(request.videoPublishers));
		}
		if (request.audioPublishers && request.audioPublishers > 0) {
			parts.push('--audio-publishers', String(request.audioPublishers));
		}
		if (request.subscribers && request.subscribers > 0) {
			parts.push('--subscribers', String(request.subscribers));
		}
		if (request.numPerSecond && request.numPerSecond > 0) {
			parts.push('--num-per-second', String(request.numPerSecond));
		}
		if (request.videoResolution) {
			parts.push('--video-resolution', request.videoResolution);
		}
		if (request.videoCodec) {
			parts.push('--video-codec', request.videoCodec);
		}
		if (request.identityPrefix) {
			parts.push('--identity-prefix', request.identityPrefix);
		}
		if (request.layout) {
			parts.push('--layout', request.layout);
		}
		// Simulcast is enabled by default in lk load-test.
		if (request.simulcast === false) {
			parts.push('--no-simulcast');
		}

		return parts;
	}
}
