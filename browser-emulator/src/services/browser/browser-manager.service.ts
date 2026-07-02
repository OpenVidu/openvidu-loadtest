import { InstanceService } from '../instance.service.ts';
import { RealBrowserService } from './real/real-browser.service.ts';
import { EmulatedBrowserService } from './emulated/emulated-browser.service.ts';
import type { LoadTestRunnerService } from './emulated/load-test-runner.service.ts';
import { ParticipantTracker } from './participant-tracker.ts';
import { ElasticSearchService } from '../elasticsearch.service.ts';
import type { ConfigService } from '../config.service.ts';
import { RemotePersistenceService } from '../files/remote-persistence.service.ts';
import {
	CON_FILE,
	addSaveStatsToFileToQueue,
	waitForAllFilesToBeProcessed,
	createAllStatFilesForSession,
} from '../../utils/stats-files.ts';
import type {
	StorageNameObject,
	StorageValueObject,
} from '../../types/storage-config.type.ts';
import { WebrtcStatsLocalStorage } from '../../data/browser-localstorage-configs/webrtc-stats-localstorage.ts';
import { OpenViduEventsLocalStorage } from '../../data/browser-localstorage-configs/openvidu-events-localstorage.ts';
import { QoERecordingsLocalStorage } from '../../data/browser-localstorage-configs/qoe-recordings-localstorage.ts';
import { ErrorEventLocalStorage } from '../../data/browser-localstorage-configs/openvidu-error-event-localstorage.ts';
import type {
	CreateUserBrowser,
	CreateUserBrowserResponse,
	AvailableBrowsers,
} from '../../types/create-user.type.ts';
import type {
	LoadTestRunRequest,
	LoadTestRunResponse,
} from '../../types/load-test.type.ts';
import type { JSONStreamsInfo } from '../../types/json.type.ts';
import type { LoggerService } from '../logger.service.ts';

export class BrowserManagerService {
	private _lastRequestInfo: CreateUserBrowser | undefined;
	private readonly configService: ConfigService;
	private readonly realBrowserService: RealBrowserService;
	private readonly emulatedBrowserService: EmulatedBrowserService;
	private readonly loadTestRunnerService: LoadTestRunnerService;
	private readonly instanceService: InstanceService;
	private readonly elasticSearchService: ElasticSearchService;
	private readonly remotePersistenceService: RemotePersistenceService;
	private readonly participantTracker: ParticipantTracker;
	private readonly logger: ReturnType<LoggerService['getLogger']>;

	constructor(
		configService: ConfigService,
		realBrowserService: RealBrowserService,
		emulatedBrowserService: EmulatedBrowserService,
		loadTestRunnerService: LoadTestRunnerService,
		instanceService: InstanceService,
		elasticSearchService: ElasticSearchService,
		remotePersistenceService: RemotePersistenceService,
		loggerService: LoggerService,
	) {
		this.configService = configService;
		this.realBrowserService = realBrowserService;
		this.emulatedBrowserService = emulatedBrowserService;
		this.loadTestRunnerService = loadTestRunnerService;
		this.instanceService = instanceService;
		this.elasticSearchService = elasticSearchService;
		this.remotePersistenceService = remotePersistenceService;
		this.participantTracker = new ParticipantTracker();
		this.logger = loggerService.getLogger('BrowserManagerService');
	}

	async createStreamManager(
		request: CreateUserBrowser,
	): Promise<CreateUserBrowserResponse> {
		const userId = request.properties.userId;
		const sessionId = request.properties.sessionName;
		const browser: AvailableBrowsers = request.properties.browser;

		await createAllStatFilesForSession(userId, sessionId);
		let connectionId: string;

		this.printRequestInfo(request);

		try {
			if (browser === 'emulated') {
				// Use emulated browser with LiveKit CLI
				connectionId =
					await this.emulatedBrowserService.createEmulatedParticipant(
						request,
					);
			} else if (browser === 'chrome' || browser === 'firefox') {
				// Use real browser with Selenium
				const browserEmulatorHost =
					this.configService.getBrowserEmulatorHostForBrowsers();
				const protocol = this.configService.isHttpsDisabled()
					? 'http'
					: 'https';
				const hostname = `${protocol}://${browserEmulatorHost}:${this.configService.getServerPort()}`;
				const webrtcStorageService = new WebrtcStatsLocalStorage(
					hostname,
				);
				const ovEventsService = new OpenViduEventsLocalStorage(
					hostname,
				);
				const qoeService = new QoERecordingsLocalStorage(hostname);
				const errorService = new ErrorEventLocalStorage(hostname);
				const storageNameObject: StorageNameObject = {
					webrtcStorageName: webrtcStorageService.getItemName(),
					ovEventStorageName: ovEventsService.getItemName(),
					qoeStorageName: qoeService.getItemName(),
					errorStorageName: errorService.getItemName(),
				};
				const storageValueObject: StorageValueObject = {
					webrtcStorageValue: webrtcStorageService.getConfig(),
					ovEventStorageValue: ovEventsService.getConfig(),
					qoeStorageValue: qoeService.getConfig(),
					errorStorageValue: errorService.getConfig(),
				};
				connectionId = await this.realBrowserService.launchBrowser(
					request,
					storageNameObject,
					storageValueObject,
				);
			} else {
				throw new Error(`Invalid browser: ${String(browser)}`);
			}

			// Track the connection in the centralized tracker
			this.participantTracker.storeConnection(
				connectionId,
				request.properties,
			);
		} catch (error) {
			this.logger.error(
				{ browser, error },
				'Error creating browser participant',
			);
			throw error;
		}

		const workerCpuUsage = await this.instanceService.getCpuUsage();
		const streams = this.participantTracker.getStreamsCreated();
		const participants = this.participantTracker.getParticipantsCreated();
		await this.sendStreamsData(streams, userId, sessionId);
		this.logger.info({ connectionId }, 'Participant created');
		this._lastRequestInfo = request;
		return {
			connectionId,
			streams,
			participants,
			workerCpuUsage,
			sessionId,
			userId,
		};
	}

	async runLoadTest(
		request: LoadTestRunRequest,
	): Promise<LoadTestRunResponse> {
		this.logger.info(
			{
				room: request.room,
				videoPublishers: request.videoPublishers,
				audioPublishers: request.audioPublishers,
				subscribers: request.subscribers,
			},
			'Starting load-test run',
		);
		const { runId, handleId } =
			await this.loadTestRunnerService.startLoadTest(request);
		const workerCpuUsage = await this.instanceService.getCpuUsage();
		await this.sendLoadTestParticipantsData(
			request.participantIds,
			request.room,
		);
		return {
			runId,
			handleId,
			room: request.room,
			workerCpuUsage,
		};
	}

	private async sendLoadTestParticipantsData(
		participantIds: string[] | undefined,
		room: string,
	): Promise<void> {
		if (!participantIds?.length) {
			return;
		}
		if (!this.elasticSearchService.isElasticSearchRunning()) {
			return;
		}
		for (const participantId of participantIds) {
			const json: JSONStreamsInfo = {
				'@timestamp': new Date().toISOString(),
				streams: 1,
				node_role: 'browseremulator',
				worker_name: `worker_${this.instanceService.WORKER_UUID}`,
				new_participant_id: participantId,
				new_participant_session: room,
			};
			await this.elasticSearchService.sendJson(json);
		}
	}

	async deleteStreamManagerWithConnectionId(
		connectionId: string,
	): Promise<void> {
		// Try real browser first, then emulated
		try {
			await this.realBrowserService.deleteStreamManagerWithConnectionId(
				connectionId,
			);
		} catch {
			// If not found in real browser, try emulated
			await this.emulatedBrowserService.deleteStreamManagerWithConnectionId(
				connectionId,
			);
		}

		// Remove from centralized tracker
		this.participantTracker.deleteConnection(connectionId);
	}

	async deleteStreamManagerWithSessionAndUser(
		sessionId: string,
		userId: string,
	): Promise<void> {
		// Get connection IDs to delete from tracker
		const connectionIds =
			this.participantTracker.getConnectionsForSessionAndUser(
				sessionId,
				userId,
			);

		// Delete from both services - they will handle not found gracefully
		await Promise.allSettled([
			this.realBrowserService.deleteStreamManagerWithSessionAndUser(
				sessionId,
				userId,
			),
			this.emulatedBrowserService.deleteStreamManagerWithSessionAndUser(
				sessionId,
				userId,
			),
		]);

		// Remove from centralized tracker
		for (const connectionId of connectionIds) {
			this.participantTracker.deleteConnection(connectionId);
		}
	}

	async clean(): Promise<void> {
		this.logger.info('Cleaning browsers...');
		await Promise.all([
			this.realBrowserService.clean(),
			this.emulatedBrowserService.clean(),
			this.loadTestRunnerService.stopAll(),
		]);
		this.logger.info('Browsers cleaned');

		// Clear the centralized tracker
		this.participantTracker.clear();

		this.logger.info('Waiting for all files to finish writting...');
		await waitForAllFilesToBeProcessed();
		this.logger.info('All files processed');
		if (this.remotePersistenceService.isInitialized()) {
			try {
				this.logger.info(
					'Uploading files to remote persistence target...',
				);
				await this.remotePersistenceService.uploadFiles();
				this.logger.info('Files uploaded to remote persistence target');
			} catch (error) {
				this.logger.error(
					{ error },
					'Error uploading files to remote persistence target',
				);
			}
		} else {
			this.logger.warn(
				"RemotePersistenceService is not initialized. Can't upload files.",
			);
		}
	}

	private async sendStreamsData(
		streams: number,
		new_participant_id: string,
		new_participant_session: string,
	) {
		const json: JSONStreamsInfo = {
			'@timestamp': new Date().toISOString(),
			streams,
			node_role: 'browseremulator',
			worker_name: `worker_${this.instanceService.WORKER_UUID}`,
			new_participant_id,
			new_participant_session,
		};
		// Write the combined data back to the file
		addSaveStatsToFileToQueue(
			new_participant_id,
			new_participant_session,
			CON_FILE,
			json,
		);
		if (this.elasticSearchService.isElasticSearchRunning()) {
			await this.elasticSearchService.sendJson(json);
		}
	}

	private printRequestInfo(req: CreateUserBrowser): void {
		let info =
			`\nStarting a ${req.properties.role} participant in a ${req.properties.browser} browser with: \n` +
			`Audio: ${req.properties.audio} \n` +
			`Video: ${req.properties.video} \n` +
			`Frame Rate: ${req.properties.frameRate} \n` +
			`Resolution: ${req.properties.resolution} \n` +
			`Recording Browser: ${req.properties.recording} \n` +
			`Headless Browser: ${req.properties.headless} \n`;
		if ('recordingOutputMode' in req.properties) {
			info += `Recording Output Mode: ${String(req.properties.recordingOutputMode)} \n`;
		}
		this.logger.info(info);
	}

	public get lastRequestInfo(): CreateUserBrowser | undefined {
		return this._lastRequestInfo;
	}
}
