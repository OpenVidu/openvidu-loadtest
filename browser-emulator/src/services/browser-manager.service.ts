import { EmulateBrowserService } from './emulate-browser.service';
import { BrowserMode, LoadTestPostResponse, TestProperties } from '../types/api-rest.type';
import { InstanceService } from './instance.service';
import { RealBrowserService } from './real-browser.service';

export class BrowserManagerService {

	constructor(
		private emulateBrowserService: EmulateBrowserService = new EmulateBrowserService(),
		private realBrowserService: RealBrowserService = new RealBrowserService(),
		private instanceService: InstanceService = new InstanceService()
		){
	}

	async createStreamManager(browserMode: BrowserMode, properties: TestProperties): Promise<LoadTestPostResponse> {

		let connectionId: string;
		if(browserMode === BrowserMode.REAL){
			// Create new stream manager using launching a normal Chrome browser
			connectionId = await this.realBrowserService.createStreamManager(properties);
		} else {
			// Create new stream manager using node-webrtc library, emulating a normal browser.
			console.log(`Creating ${properties.role} ${properties.userId} in session ${properties.sessionName} using emulate browser`);
			connectionId = await this.emulateBrowserService.createStreamManager(properties);
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