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

	deleteStreamManagerWithRole(role: any) {
		this.emulateBrowserService.deleteStreamManagerWithRole(role);
		//TODO: Implement method for real browsers
		// throw new Error('Method not implemented.');
	}
	deleteStreamManagerWithConnectionId(connectionId: string) {
		this.emulateBrowserService.deleteStreamManagerWithConnectionId(connectionId);
		//TODO: Implement method for real browsers
		// throw new Error('Method not implemented.');
	}


}