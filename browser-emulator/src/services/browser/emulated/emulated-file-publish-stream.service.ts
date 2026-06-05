import { LocalFilesRepository } from '../../../repositories/files/local-files.repository.ts';
import { SocketWriterService } from '../../streaming/socket-writer.service.ts';
import { SocketWriterHealthService } from '../../streaming/socket-writer-health.service.ts';

export class EmulatedFilePublishStreamService {
	private readonly socketWriterService: SocketWriterService;
	private readonly healthService: SocketWriterHealthService;
	private readonly localFilesRepository: LocalFilesRepository;

	// Track participant streaming state
	private readonly participantStreams = new Map<
		string,
		{
			videoSocket?: string;
			audioSocket?: string;
			failed: boolean;
		}
	>();

	constructor(
		socketWriterService: SocketWriterService,
		healthService: SocketWriterHealthService,
		localFilesRepository: LocalFilesRepository,
	) {
		this.socketWriterService = socketWriterService;
		this.healthService = healthService;
		this.localFilesRepository = localFilesRepository;
	}

	/**
	 * Start streaming for a participant using Unix sockets.
	 * Streaming files should be pre-downloaded via LocalFilesService.downloadBrowserMediaFiles().
	 * @param participantId Unique identifier for the participant
	 * @param video Enable video streaming
	 * @param audio Enable audio streaming
	 * @returns Socket paths for LiveKit CLI
	 */
	public async startEmulatedStreams(
		participantId: string,
		video: boolean,
		audio: boolean,
	): Promise<{ videoSocket?: string; audioSocket?: string }> {
		// Get streaming file paths (should be pre-downloaded)
		const videoPath = this.localFilesRepository.fakevideoStreaming;
		const audioPath = this.localFilesRepository.fakeaudioStreaming;

		// Validate files exist
		if (video && !videoPath) {
			throw new Error(
				'Streaming video file (.h264) not found. Run downloadBrowserMediaFiles() first.',
			);
		}
		if (audio && !audioPath) {
			throw new Error(
				'Streaming audio file (.ogg) not found. Run downloadBrowserMediaFiles() first.',
			);
		}

		const result: { videoSocket?: string; audioSocket?: string } = {};

		// Start video socket writer
		if (video && videoPath) {
			const videoSocket = await this.socketWriterService.startWriter(
				participantId,
				'video',
				videoPath,
			);
			result.videoSocket = videoSocket;

			// Start health check
			this.healthService.startCheck(
				`${participantId}_video`,
				videoSocket,
				() => this.markFailed(participantId, 'video'),
			);
		}

		// Start audio socket writer
		if (audio && audioPath) {
			const audioSocket = await this.socketWriterService.startWriter(
				participantId,
				'audio',
				audioPath,
			);
			result.audioSocket = audioSocket;

			// Start health check
			this.healthService.startCheck(
				`${participantId}_audio`,
				audioSocket,
				() => this.markFailed(participantId, 'audio'),
			);
		}

		this.participantStreams.set(participantId, {
			videoSocket: result.videoSocket,
			audioSocket: result.audioSocket,
			failed: false,
		});

		console.log(
			`Started socket streaming for ${participantId}: video=${!!result.videoSocket}, audio=${!!result.audioSocket}`,
		);

		return result;
	}

	/**
	 * Stop streaming for a specific participant or all participants
	 */
	public async stopPublishing(participantId?: string): Promise<void> {
		if (participantId) {
			await this.stopParticipant(participantId);
		} else {
			await this.stopAllParticipants();
		}
	}

	/**
	 * Check if a participant's stream has failed
	 */
	public isParticipantFailed(participantId: string): boolean {
		return this.participantStreams.get(participantId)?.failed ?? false;
	}

	/**
	 * Get the socket paths for a participant
	 */
	public getParticipantSockets(
		participantId: string,
	): { videoSocket?: string; audioSocket?: string } | undefined {
		const stream = this.participantStreams.get(participantId);
		if (!stream) return undefined;

		return {
			videoSocket: stream.videoSocket,
			audioSocket: stream.audioSocket,
		};
	}

	private async stopParticipant(participantId: string): Promise<void> {
		const stream = this.participantStreams.get(participantId);
		if (!stream) return;

		// Stop health checks
		this.healthService.stopCheck(`${participantId}_video`);
		this.healthService.stopCheck(`${participantId}_audio`);

		// Stop socket writers
		await Promise.all([
			this.socketWriterService.stopWriter(participantId, 'video'),
			this.socketWriterService.stopWriter(participantId, 'audio'),
		]);

		this.participantStreams.delete(participantId);
		console.log(`Stopped socket streaming for ${participantId}`);
	}

	private async stopAllParticipants(): Promise<void> {
		const promises = Array.from(this.participantStreams.keys()).map(id =>
			this.stopParticipant(id),
		);

		await Promise.allSettled(promises);

		this.healthService.stopAllChecks();

		this.participantStreams.clear();

		console.log('Stopped all socket streaming');
	}

	private markFailed(participantId: string, type: 'video' | 'audio'): void {
		const stream = this.participantStreams.get(participantId);
		if (stream) {
			stream.failed = true;
			console.error(`Stream failed for ${participantId} (${type})`);
		}
	}
}
