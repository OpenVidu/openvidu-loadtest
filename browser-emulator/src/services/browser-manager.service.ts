import { EmulateBrowserService } from './emulate-browser.service';
import { BrowserMode, JSONStreamsInfo, LoadTestPostRequest, LoadTestPostResponse } from '../types/api-rest.type';
import { InstanceService } from './instance.service';
import { RealBrowserService } from './real-browser.service';
import { ElasticSearchService } from './elasticsearch.service';
import { LocalStorageService } from './local-storage.service';
import { ErrorLogService, OpenViduEventsService, QoERecordingsService, WebrtcStatsService } from './config-storage.service';
import { OpenViduRole } from '../types/openvidu.type';
import { APPLICATION_MODE } from '../config';
import { ApplicationMode } from '../types/config.type';
import { FilesService } from './files/files.service';
import { CON_FILE, ERRORS_FILE, EVENTS_FILE, STATS_FILE, createFile, saveStatsToFile } from '../utils/stats-files';

export class BrowserManagerService {
	protected static instance: BrowserManagerService;
	private _lastRequestInfo: LoadTestPostRequest;

	private constructor(
		private emulateBrowserService: EmulateBrowserService = new EmulateBrowserService(),
		private realBrowserService: RealBrowserService = new RealBrowserService(),
		private instanceService: InstanceService = InstanceService.getInstance(),
		private filesService: FilesService | undefined = FilesService.getInstance(),
		private elasticSearchService: ElasticSearchService = ElasticSearchService.getInstance(),
		private localStorage: LocalStorageService = new LocalStorageService(),
		private webrtcStorageService = new WebrtcStatsService()
	) {}

	static getInstance() {
		if (!BrowserManagerService.instance) {
			BrowserManagerService.instance = new BrowserManagerService();
		}
		return BrowserManagerService.instance;
	}

	async createStreamManager(request: LoadTestPostRequest): Promise<LoadTestPostResponse> {
		const userId = request.properties.userId;
		const sessionId = request.properties.sessionName;
		await Promise.all([
			createFile(userId, sessionId, CON_FILE),
			createFile(userId, sessionId, EVENTS_FILE),
			createFile(userId, sessionId, ERRORS_FILE),
			createFile(userId, sessionId, STATS_FILE)
		]);
		let connectionId: string;
		let webrtcStorageName: string;
		let webrtcStorageValue: string;
		const isRealBrowser = request.browserMode === BrowserMode.REAL;

		webrtcStorageName = this.webrtcStorageService.getItemName();
		webrtcStorageValue = this.webrtcStorageService.getConfig();
		this.printRequestInfo(request);

		if (isRealBrowser) {
			// Create new stream manager using launching a normal Chrome browser
			await this.realBrowserService.startSelenium(request.properties);
			try {
				const ovEventsService: OpenViduEventsService = new OpenViduEventsService();
				const qoeService: QoERecordingsService = new QoERecordingsService();
				const errorService: ErrorLogService = new ErrorLogService();
				const storageNameObject = { webrtcStorageName, ovEventStorageName: ovEventsService.getItemName(), qoeStorageName: qoeService.getItemName(), errorStorageName: errorService.getItemName() };
				const storageValueObject = { webrtcStorageValue, ovEventStorageValue: ovEventsService.getConfig(), qoeStorageValue: qoeService.getConfig(), errorStorageValue: errorService.getConfig() };
				console.log(storageNameObject, storageValueObject);
				connectionId = await this.realBrowserService.launchBrowser(request, storageNameObject, storageValueObject);
				this.realBrowserService.storeConnection(connectionId, request.properties);
			} catch (error) {
				throw error;
			}
		} else {
			if (this.elasticSearchService.isElasticSearchRunning() && !this.localStorage.exist(webrtcStorageName)) {
				// Create webrtc stats item in virtual localStorage
				try {
					this.localStorage.setItem(webrtcStorageName, webrtcStorageValue);
				} catch (error) {
					console.error(error);
				}
			}

			connectionId = await this.emulateBrowserService.createStreamManager(request.token, request.properties);
		}

		const workerCpuUsage = await this.instanceService.getCpuUsage();
		const streams = this.getStreamsCreated();
		const participants = this.getParticipantsCreated();
		await this.sendStreamsData(streams, userId, sessionId);
		console.log(`Participant ${connectionId} created`);
		this._lastRequestInfo = request;
		return { connectionId, streams, participants, workerCpuUsage, sessionId, userId };
	}

	async deleteStreamManagerWithRole(role: OpenViduRole): Promise<void> {
		this.emulateBrowserService.deleteStreamManagerWithRole(role);
		await this.realBrowserService.deleteStreamManagerWithRole(role);
	}

	async deleteStreamManagerWithConnectionId(connectionId: string): Promise<void> {
		const isConnectionFromEmulatedBrowser = connectionId.includes('con_');
		if (isConnectionFromEmulatedBrowser) {
			return this.emulateBrowserService.deleteStreamManagerWithConnectionId(connectionId);
		}

		return await this.realBrowserService.deleteStreamManagerWithConnectionId(connectionId);
	}

	async deleteStreamManagerWithSessionAndUser(sessionId: string, userId: string) {
		return await this.realBrowserService.deleteStreamManagerWithSessionAndUser(sessionId, userId);
	}

	async clean(): Promise<void> {
		this.emulateBrowserService.clean();
		await this.realBrowserService.clean();
		console.log("Browsers cleaned");
		if (this.elasticSearchService.isElasticSearchRunning()) {
			await this.elasticSearchService.clean();
		}
		if ((APPLICATION_MODE === ApplicationMode.PROD)) {
			if (!!this.filesService) {
				await this.filesService.uploadFiles();
			} else {
				console.warn("FilesService is not defined (There is no S3 or Minio bucket specified). Can't upload recordings");
			}
		}
	}

	private getStreamsCreated(): number {
		return this.emulateBrowserService.getStreamsCreated() + this.realBrowserService.getStreamsCreated();
	}

	private getParticipantsCreated(): number {
		return this.emulateBrowserService.getParticipantsCreated() + this.realBrowserService.getParticipantsCreated();
	}

	private async sendStreamsData(streams: number, new_participant_id: string, new_participant_session: string) {
		const json: JSONStreamsInfo = {
			'@timestamp': new Date().toISOString(),
			streams,
			node_role: 'browseremulator',
			worker_name: `worker_${this.instanceService.WORKER_UUID}`,
			new_participant_id,
			new_participant_session
		};
		const promises = [];
		// Write the combined data back to the file
		promises.push(saveStatsToFile(new_participant_id, new_participant_session, CON_FILE, json));
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
			`\nStarting a ${req.properties.role} participant in a ${req.browserMode} browser with: \n` +
			`Audio: ${req.properties.audio} \n` +
			`Video: ${req.properties.video} \n` +
			`Frame Rate: ${req.properties.frameRate} \n` +
			`Resolution: ${req.properties.resolution} \n` +
			`OpenVidu Recording: ${req.properties.recordingOutputMode} \n` +
			`Recording Browser: ${req.properties.recording} \n` +
			`Headless Browser: ${req.properties.headless} \n`;
		console.log(info);
	}

	public get lastRequestInfo(): LoadTestPostRequest {
		return this._lastRequestInfo;
	}
}
