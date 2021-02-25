import { EmulateBrowserService } from './emulate-browser.service';
import { BrowserMode, LoadTestPostRequest, LoadTestPostResponse } from '../types/api-rest.type';
import { InstanceService } from './instance.service';
import { RealBrowserService } from './real-browser.service';
import { ElasticSearchService } from './elasticsearch.service';
import { LocalStorageService } from './local-storage.service';
import { WebrtcStatsService } from './wertc-stats-storage.service';

export class BrowserManagerService {
	protected static instance: BrowserManagerService;

	private constructor(
		private emulateBrowserService: EmulateBrowserService = new EmulateBrowserService(),
		private realBrowserService: RealBrowserService = new RealBrowserService(),
		private instanceService: InstanceService = new InstanceService(),
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
		await this.elasticSearchService.initialize();

		if(this.elasticSearchService.isElasticSearchAvailable()){
			webrtcStorageName = this.webrtcStorageService.getItemName();
			webrtcStorageValue = this.webrtcStorageService.getConfig();
		}

		if(request.browserMode === BrowserMode.REAL){
			// Create new stream manager using launching a normal Chrome browser
			connectionId = await this.realBrowserService.startBrowserContainer(request.properties);
			await this.realBrowserService.launchBrowser(request, webrtcStorageName, webrtcStorageValue);
		} else {

			if(this.elasticSearchService.isElasticSearchAvailable() && !this.localStorage.exist(webrtcStorageName)){
				// Create webrtc stats item in virtual localStorage
				this.localStorage.setItem(webrtcStorageName, webrtcStorageValue);
			}
			// Create new stream manager using node-webrtc library, emulating a normal browser.
			console.log(`Creating ${request.properties.role} ${request.properties.userId} in session ${request.properties.sessionName} using emulate browser`);
			connectionId = await this.emulateBrowserService.createStreamManager(request.token, request.properties);
		}

		const workerCpuUsage = await this.instanceService.getCpuUsage();
		return {connectionId, workerCpuUsage};

	}

	async deleteStreamManagerWithRole(role: any): Promise<void> {
		this.emulateBrowserService.deleteStreamManagerWithRole(role);
		return await this.realBrowserService.deleteStreamManagerWithRole(role);
	}

	async deleteStreamManagerWithConnectionId(connectionId: string): Promise<void> {
		const isConnectionFromEmulatedBrowser = connectionId.includes('con_');
		if(isConnectionFromEmulatedBrowser){
			return this.emulateBrowserService.deleteStreamManagerWithConnectionId(connectionId);
		}

		return await this.realBrowserService.deleteStreamManagerWithConnectionId(connectionId);
	}

}