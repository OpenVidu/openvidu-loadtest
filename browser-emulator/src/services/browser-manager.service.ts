import { EmulateBrowserService } from './emulate-browser.service';
import { BrowserMode, LoadTestPostRequest, LoadTestPostResponse } from '../types/api-rest.type';
import { InstanceService } from './instance.service';
import { RealBrowserService } from './real-browser.service';
import { ElasticSearchService } from './elasticsearch.service';
import { LocalStorageService } from './local-storage.service';
import { WebrtcStatsService } from './webrtc-stats-storage.service';
import { OpenViduRole } from '../types/openvidu.type';

export class BrowserManagerService {
	protected static instance: BrowserManagerService;

	private constructor(
		private emulateBrowserService: EmulateBrowserService = new EmulateBrowserService(),
		private realBrowserService: RealBrowserService = new RealBrowserService(),
		private instanceService: InstanceService = InstanceService.getInstance(),
		private elasticSearchService: ElasticSearchService = ElasticSearchService.getInstance(),
		private localStorage: LocalStorageService = new LocalStorageService(),
		private webrtcStorageService = new WebrtcStatsService()
		){
	}

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
		if(this.elasticSearchService.needToBeConfigured()) {
			await this.elasticSearchService.initialize();
			// await this.instanceService.launchMetricBeat();
		}

		if(this.elasticSearchService.isElasticSearchAvailable()){
			webrtcStorageName = this.webrtcStorageService.getItemName();
			webrtcStorageValue = this.webrtcStorageService.getConfig();
		}
		this.printRequestInfo(request);

		if(request.browserMode === BrowserMode.REAL){
			// Create new stream manager using launching a normal Chrome browser
			connectionId = await this.realBrowserService.startBrowserContainer(request.properties);
			try {
				await this.realBrowserService.launchBrowser(request, webrtcStorageName, webrtcStorageValue);
			} catch (error) {
				await this.realBrowserService.deleteStreamManagerWithConnectionId(connectionId);
				throw error;
			}
		} else {

			if(this.elasticSearchService.isElasticSearchAvailable() && !this.localStorage.exist(webrtcStorageName)){
				// Create webrtc stats item in virtual localStorage
				try {
					this.localStorage.setItem(webrtcStorageName, webrtcStorageValue);
				} catch (error) {

				}
			}
			// Create new stream manager using node-webrtc library, emulating a normal browser.
			connectionId = await this.emulateBrowserService.createStreamManager(request.token, request.properties);
		}

		const workerCpuUsage = await this.instanceService.getCpuUsage();
		return {connectionId, workerCpuUsage};

	}

	async deleteStreamManagerWithRoles(roles: OpenViduRole[]): Promise<void> {
		const promisesToResolve: Promise<void>[] = [];
		roles.forEach((role: OpenViduRole) => {
			this.emulateBrowserService.deleteStreamManagerWithRole(role);
			promisesToResolve.push(this.realBrowserService.deleteStreamManagerWithRole(role));
		});
		if(this.elasticSearchService.isElasticSearchAvailable()){
			await this.elasticSearchService.clean();
		}

		await Promise.all(promisesToResolve);
	}

	async deleteStreamManagerWithConnectionId(connectionId: string): Promise<void> {
		const isConnectionFromEmulatedBrowser = connectionId.includes('con_');
		if(isConnectionFromEmulatedBrowser){
			return this.emulateBrowserService.deleteStreamManagerWithConnectionId(connectionId);
		}

		return await this.realBrowserService.deleteStreamManagerWithConnectionId(connectionId);
	}


	private printRequestInfo(req: LoadTestPostRequest): void {

		const info = `Starting a ${req.properties.role} participant in a ${req.browserMode} browser with: \n` +
					`Audio: ${req.properties.audio} \n` +
					`Video: ${req.properties.video} \n` +
					`Frame Rate: ${req.properties.frameRate} \n` +
					`Resolution: ${req.properties.resolution} \n` +
					`OpenVidu Recording: ${req.properties.recordingOutputMode} \n` +
					`Recording Browser: ${req.properties.recording} \n` +
					`Headless Browser: ${req.properties.headless} \n`;
		console.log(info);

	}

}