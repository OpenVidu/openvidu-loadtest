import { EmulateBrowserService } from './emulate-browser.service';
import { BrowserMode, JSONStreamsInfo, LoadTestPostRequest, LoadTestPostResponse } from '../types/api-rest.type';
import { InstanceService } from './instance.service';
import { RealBrowserService } from './real-browser.service';
import { ElasticSearchService } from './elasticsearch.service';
import { LocalStorageService } from './local-storage.service';
import { OpenViduEventsService, QoERecordingsService, WebrtcStatsService } from './config-storage.service';
import { OpenViduRole } from '../types/openvidu.type';
import { APPLICATION_MODE } from '../config';
import { ApplicationMode } from '../types/config.type';

export class BrowserManagerService {
	protected static instance: BrowserManagerService;
	private readonly RESPONSE_TIMEOUT = 30_000;
	private _lastRequestInfo: LoadTestPostRequest;

	private constructor(
		private emulateBrowserService: EmulateBrowserService = new EmulateBrowserService(),
		private realBrowserService: RealBrowserService = new RealBrowserService(),
		private instanceService: InstanceService = InstanceService.getInstance(),
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
		let connectionId: string;
		let webrtcStorageName: string;
		let webrtcStorageValue: string;
		const isRealBrowser = request.browserMode === BrowserMode.REAL;

		if (this.elasticSearchService.isElasticSearchRunning()) {
			webrtcStorageName = this.webrtcStorageService.getItemName();
			webrtcStorageValue = this.webrtcStorageService.getConfig();
		}
		this.printRequestInfo(request);

		if (isRealBrowser) {
			// Create new stream manager using launching a normal Chrome browser
			connectionId = await this.realBrowserService.startBrowserContainer(request.properties);
			try {
				const ovEventsService: OpenViduEventsService = new OpenViduEventsService();
				const qoeService: QoERecordingsService = new QoERecordingsService();
				const storageNameObject = { webrtcStorageName, ovEventStorageName: ovEventsService.getItemName(), qoeStorageName: qoeService.getItemName() };
				const storageValueObject = { webrtcStorageValue, ovEventStorageValue: ovEventsService.getConfig(), qoeStorageValue: qoeService.getConfig() };
				await this.realBrowserService.launchBrowser(connectionId, request, storageNameObject, storageValueObject);
				this.realBrowserService.storeConnection(connectionId, request.properties);
			} catch (error) {
				await this.realBrowserService.deleteStreamManagerWithConnectionId(connectionId);
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
		const userId = request.properties.userId;
		const sessionId = request.properties.sessionName;
		this.sendStreamsData(streams);
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

	async clean(): Promise<void> {
		this.emulateBrowserService.clean();
		await this.realBrowserService.clean();

		if (this.elasticSearchService.isElasticSearchRunning()) {
			await this.elasticSearchService.clean();
		}
		if (APPLICATION_MODE === ApplicationMode.PROD) {
			await this.instanceService.uploadFilesToS3();
		}
	}

	private getStreamsCreated(): number {
		return this.emulateBrowserService.getStreamsCreated() + this.realBrowserService.getStreamsCreated();
	}

	private getParticipantsCreated(): number {
		return this.emulateBrowserService.getParticipantsCreated() + this.realBrowserService.getParticipantsCreated();
	}

	private async sendStreamsData(streams: number) {
		const json: JSONStreamsInfo = {
			'@timestamp': new Date().toISOString(),
			streams,
			node_role: 'browseremulator',
			worker_name: `worker_${this.instanceService.WORKER_UUID}`,
		};
		try {
			await this.elasticSearchService.sendJson(json);
		} catch (error) {
			console.error('Error sending streams data to ElasticSearch');
			console.log(error);
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
