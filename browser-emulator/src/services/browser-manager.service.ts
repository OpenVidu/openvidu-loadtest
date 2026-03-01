import type {
	JSONStreamsInfo,
	CreateUserBrowser,
	LoadTestPostResponse,
} from '../types/api-rest.type.js';
import { InstanceService } from './instance.service.js';
import { RealBrowserService } from './real-browser.service.js';
import { ElasticSearchService } from './elasticsearch.service.js';
import {
	ErrorLogService,
	OpenViduEventsService,
	QoERecordingsService,
	WebrtcStatsService,
} from './config-storage.service.js';
import { APPLICATION_MODE } from '../config.js';
import { ApplicationMode } from '../types/config.type.js';
import { S3FilesService } from './files/s3files.service.ts';
import {
	CON_FILE,
	addSaveStatsToFileToQueue,
	waitForAllFilesToBeProcessed,
	createAllStatFilesForSession,
} from '../utils/stats-files.js';
import type {
	StorageNameObject,
	StorageValueObject,
} from '../types/storage-config.type.ts';

export class BrowserManagerService {
	protected static instance: BrowserManagerService;
	private _lastRequestInfo: CreateUserBrowser | undefined;
	private readonly realBrowserService: RealBrowserService =
		new RealBrowserService();
	private readonly instanceService: InstanceService =
		InstanceService.getInstance();
	private readonly elasticSearchService: ElasticSearchService =
		ElasticSearchService.getInstance();

	private constructor() {
		/* empty */
	}

	static getInstance() {
		if (!BrowserManagerService.instance) {
			BrowserManagerService.instance = new BrowserManagerService();
		}
		return BrowserManagerService.instance;
	}

	async createStreamManager(
		request: CreateUserBrowser,
	): Promise<LoadTestPostResponse> {
		const userId = request.properties.userId;
		const sessionId = request.properties.sessionName;
		await createAllStatFilesForSession(userId, sessionId);
		let connectionId: string;

		this.printRequestInfo(request);

		// Create new stream manager using launching a normal Chrome browser
		await this.realBrowserService.startSelenium(request.properties);
		try {
			const webrtcStorageService = new WebrtcStatsService();
			const ovEventsService: OpenViduEventsService =
				new OpenViduEventsService();
			const qoeService: QoERecordingsService = new QoERecordingsService();
			const errorService: ErrorLogService = new ErrorLogService();
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
			console.log(storageNameObject, storageValueObject);
			connectionId = await this.realBrowserService.launchBrowser(
				request,
				storageNameObject,
				storageValueObject,
			);
			this.realBrowserService.storeConnection(
				connectionId,
				request.properties,
			);
		} catch (error) {
			console.error('Error launching browser', error);
			throw error;
		}

		const workerCpuUsage = await this.instanceService.getCpuUsage();
		const streams = this.getStreamsCreated();
		const participants = this.getParticipantsCreated();
		await this.sendStreamsData(streams, userId, sessionId);
		console.log(`Participant ${connectionId} created`);
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

	async deleteStreamManagerWithConnectionId(
		connectionId: string,
	): Promise<void> {
		return await this.realBrowserService.deleteStreamManagerWithConnectionId(
			connectionId,
		);
	}

	async deleteStreamManagerWithSessionAndUser(
		sessionId: string,
		userId: string,
	) {
		return await this.realBrowserService.deleteStreamManagerWithSessionAndUser(
			sessionId,
			userId,
		);
	}

	async clean(): Promise<void> {
		console.log('Cleaning browsers...');
		await this.realBrowserService.clean();
		console.log('Browsers cleaned');
		console.log('Waiting for all files to finish writting...');
		await waitForAllFilesToBeProcessed();
		console.log('All files processed');
		if (APPLICATION_MODE === ApplicationMode.PROD) {
			try {
				const fileService = S3FilesService.getInstance();
				try {
					console.log('Uploading files to S3...');
					await fileService.uploadFiles();
					console.log('Files uploaded to S3');
				} catch (error) {
					console.error('Error uploading files to S3', error);
				}
			} catch {
				console.warn(
					"FilesService is not defined (There is no S3 bucket specified). Can't upload files.",
				);
			}
		}
	}

	private getStreamsCreated(): number {
		return this.realBrowserService.getStreamsCreated();
	}

	private getParticipantsCreated(): number {
		return this.realBrowserService.getParticipantsCreated();
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
		const info =
			`\nStarting a ${req.properties.role} participant in a browser with: \n` +
			`Audio: ${req.properties.audio} \n` +
			`Video: ${req.properties.video} \n` +
			`Frame Rate: ${req.properties.frameRate} \n` +
			`Resolution: ${req.properties.resolution} \n` +
			`OpenVidu Recording: ${req.properties.recordingOutputMode} \n` +
			`Recording Browser: ${req.properties.recording} \n` +
			`Headless Browser: ${req.properties.headless} \n`;
		console.log(info);
	}

	public get lastRequestInfo(): CreateUserBrowser | undefined {
		return this._lastRequestInfo;
	}
}
