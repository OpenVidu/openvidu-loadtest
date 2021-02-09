import { OpenViduBrowser } from '../services/openvidu-browser';
import { BrowserMode, PublisherProperties } from '../extra/openvidu-browser/OpenVidu/OpenviduTypes';
import { DockerService } from '../services/docker-service';
import { Builder, By, Capabilities } from 'selenium-webdriver';
import chrome = require('selenium-webdriver/chrome');

export class BrowserManager {

	private readonly BROWSER_CONTAINER_HOSTPORT = 4000;

	private containerMap: Map<string, number> = new Map();

	private ovBrowserService: OpenViduBrowser;
	private dockerService: DockerService;
	constructor(){
		 this.ovBrowserService = new OpenViduBrowser();
		 this.dockerService = new DockerService();
	}

	async createStreamManager(browserMode: BrowserMode, properties: PublisherProperties): Promise<string> {

		if(browserMode === BrowserMode.REAL){
			// Create new stream manager using launching a normal Chrome browser
			return await this.createStreamManagerFromRealBrowser(properties);
		}

		// Create new stream manager using node-webrtc library, emulating a normal browser.
		console.log(`Creating ${properties.role} ${properties.userId} in session ${properties.sessionName} using emulate browser`);

		return await this.ovBrowserService.createStreamManager(properties);

	}

	deleteStreamManagerWithRole(role: any) {
		throw new Error('Method not implemented.');
	}
	deleteStreamManagerWithConnectionId(connectionId: string) {
		throw new Error('Method not implemented.');
	}

	private async createStreamManagerFromRealBrowser(properties: PublisherProperties): Promise<string>{

		const portBinding = this.BROWSER_CONTAINER_HOSTPORT + this.containerMap.size;
		process.env['SELENIUM_REMOTE_URL'] = 'http://localhost:' + portBinding + '/wd/hub';

		try {
			const containerName = 'container_' + properties.sessionName + '_' + new Date().getTime();
			const containerId = await this.dockerService.startBrowserContainer(containerName, portBinding, properties);
			this.containerMap.set(containerId, portBinding);

			if(!!properties.recording) {
				console.log("Starting browser recording ");
				await this.dockerService.startBrowserRecording(containerId, containerName);
				await this.launchBrowser(containerId);
				return containerId;
			}else {
				await this.launchBrowser(containerId);
				return containerId;
			}

		} catch (error) {
			console.error(error);
			return Promise.reject(new Error(error));
		}

	}

	private async launchBrowser(containerId: string, timeout: number = 1000): Promise<void> {

		setTimeout(async () => {
			try {
				const chromeOptions = new chrome.Options();
				const chromeCapabilities = Capabilities.chrome();
				chromeOptions.addArguments('--disable-dev-shm-usage','--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream');
				chromeCapabilities.setAcceptInsecureCerts(true);

				let driver = await new Builder().forBrowser('chrome').withCapabilities(chromeCapabilities).setChromeOptions(chromeOptions).build();

				await driver.get('https://demos.openvidu.io/basic-videoconference/');
				const joinButton = await driver.findElement(By.name("commit"));
				await joinButton.click();
				console.log("Browser works as expected");

			} catch(error){
				console.log(error);
				await this.dockerService.stopContainer(containerId);
				this.containerMap.delete(containerId);
				return Promise.reject(new Error(error));
			} finally {
				// await driver.quit();
			}
		}, timeout);



	}

}