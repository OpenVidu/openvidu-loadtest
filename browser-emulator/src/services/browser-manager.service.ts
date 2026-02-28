import type {
	JSONStreamsInfo,
	LoadTestPostRequest,
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
import { OpenViduRole } from '../types/openvidu.type.js';
import { APPLICATION_MODE } from '../config.js';
import { ApplicationMode } from '../types/config.type.js';
import { FilesService } from './files/files.service.js';
import {
	CON_FILE,
	ERRORS_FILE,
	EVENTS_FILE,
	STATS_FILE,
	createFile,
	saveStatsToFile,
} from '../utils/stats-files.js';

export class BrowserManagerService {
	protected static instance: BrowserManagerService;
	private _lastRequestInfo: LoadTestPostRequest | undefined;
	private realBrowserService: RealBrowserService = new RealBrowserService();
	private instanceService: InstanceService = InstanceService.getInstance();
	private filesService: FilesService | undefined = FilesService.getInstance();
	private elasticSearchService: ElasticSearchService =
		ElasticSearchService.getInstance();
	private webrtcStorageService = new WebrtcStatsService();

	private constructor() {}

	static getInstance() {
		if (!BrowserManagerService.instance) {
			BrowserManagerService.instance = new BrowserManagerService();
		}
		return BrowserManagerService.instance;
	}

	async createStreamManager(
		request: LoadTestPostRequest,
	): Promise<LoadTestPostResponse> {
		const userId = request.properties.userId;
		const sessionId = request.properties.sessionName;
		await Promise.all([
			createFile(userId, sessionId, CON_FILE),
			createFile(userId, sessionId, EVENTS_FILE),
			createFile(userId, sessionId, ERRORS_FILE),
			createFile(userId, sessionId, STATS_FILE),
		]);
		let connectionId: string;
		let webrtcStorageName: string;
		let webrtcStorageValue: string;

		webrtcStorageName = this.webrtcStorageService.getItemName();
		webrtcStorageValue = this.webrtcStorageService.getConfig();
		this.printRequestInfo(request);

		// Create new stream manager using launching a normal Chrome browser
		await this.realBrowserService.startSelenium(request.properties);
		try {
			const ovEventsService: OpenViduEventsService =
				new OpenViduEventsService();
			const qoeService: QoERecordingsService = new QoERecordingsService();
			const errorService: ErrorLogService = new ErrorLogService();
			const storageNameObject = {
				webrtcStorageName,
				ovEventStorageName: ovEventsService.getItemName(),
				qoeStorageName: qoeService.getItemName(),
				errorStorageName: errorService.getItemName(),
			};
			const storageValueObject = {
				webrtcStorageValue,
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

	async deleteStreamManagerWithRole(role: OpenViduRole): Promise<void> {
		await this.realBrowserService.deleteStreamManagerWithRole(role);
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
		await this.realBrowserService.clean();
		console.log('Browsers cleaned');
		if (APPLICATION_MODE === ApplicationMode.PROD) {
			if (!!this.filesService) {
				await this.filesService.uploadFiles();
			} else {
				console.warn(
					"FilesService is not defined (There is no S3 bucket specified). Can't upload recordings",
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
		const promises = [];
		// Write the combined data back to the file
		promises.push(
			saveStatsToFile(
				new_participant_id,
				new_participant_session,
				CON_FILE,
				json,
			),
		);
		if (this.elasticSearchService.isElasticSearchRunning()) {
			promises.push(this.elasticSearchService.sendJson(json));
		}
		try {
			await Promise.all(promises);
		} catch (error) {
			console.error(error);
		}
	}

	private printRequestInfo(req: LoadTestPostRequest): void {
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

	public get lastRequestInfo(): LoadTestPostRequest | undefined {
		return this._lastRequestInfo;
	}
}
