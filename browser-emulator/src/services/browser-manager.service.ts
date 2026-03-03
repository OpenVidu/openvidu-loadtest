import type {
	JSONStreamsInfo,
	CreateUserBrowser,
	LoadTestPostResponse,
} from '../types/api-rest.type.js';
import { InstanceService } from './instance.service.js';
import { RealBrowserService } from './real-browser.service.js';
import { ElasticSearchService } from './elasticsearch.service.js';
import type { ConfigService } from './config.service.js';
import { S3UploadService } from './files/s3upload.service.ts';
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
import { WebrtcStatsLocalStorage } from '../data/browser-localstorage-configs/webrtc-stats-localstorage.ts';
import { OpenViduEventsLocalStorage } from '../data/browser-localstorage-configs/openvidu-events-localstorage.ts';
import { QoERecordingsLocalStorage } from '../data/browser-localstorage-configs/qoe-recordings-localstorage.ts';
import { ErrorEventLocalStorage } from '../data/browser-localstorage-configs/openvidu-error-event-localstorage.ts';

export class BrowserManagerService {
	private _lastRequestInfo: CreateUserBrowser | undefined;
	private readonly configService: ConfigService;
	private readonly realBrowserService: RealBrowserService;
	private readonly instanceService: InstanceService;
	private readonly elasticSearchService: ElasticSearchService;
	private readonly s3FilesService: S3UploadService;

	constructor(
		configService: ConfigService,
		realBrowserService: RealBrowserService,
		instanceService: InstanceService,
		elasticSearchService: ElasticSearchService,
		s3FilesService: S3UploadService,
	) {
		this.configService = configService;
		this.realBrowserService = realBrowserService;
		this.instanceService = instanceService;
		this.elasticSearchService = elasticSearchService;
		this.s3FilesService = s3FilesService;
	}

	async createStreamManager(
		request: CreateUserBrowser,
	): Promise<LoadTestPostResponse> {
		const userId = request.properties.userId;
		const sessionId = request.properties.sessionName;
		await createAllStatFilesForSession(userId, sessionId);
		let connectionId: string;

		this.printRequestInfo(request);

		try {
			const hostname = `https://localhost:${this.configService.getServerPort()}`;
			const webrtcStorageService = new WebrtcStatsLocalStorage(hostname);
			const ovEventsService = new OpenViduEventsLocalStorage(hostname);
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
		if (this.configService.isProdMode()) {
			if (this.s3FilesService.isInitialized()) {
				try {
					console.log('Uploading files to S3...');
					await this.s3FilesService.uploadFiles();
					console.log('Files uploaded to S3');
				} catch (error) {
					console.error('Error uploading files to S3', error);
				}
			} else {
				console.warn(
					"S3FilesService is not initialized. Can't upload files.",
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
