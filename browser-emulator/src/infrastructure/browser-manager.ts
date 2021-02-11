import { OpenViduBrowser } from '../services/openvidu-browser';
import { BrowserMode, TestProperties } from '../types/request-types';
import { DockerService } from '../services/docker-service';
import { Builder, By, Capabilities } from 'selenium-webdriver';
import chrome = require('selenium-webdriver/chrome');

export class BrowserManager {

	private chromeOptions = new chrome.Options();
	private chromeCapabilities = Capabilities.chrome();

	private readonly BROWSER_CONTAINER_HOSTPORT = 4000;

	private containerMap: Map<string, number> = new Map();

	private ovBrowserService: OpenViduBrowser;
	private dockerService: DockerService;
	constructor(){
		 this.ovBrowserService = new OpenViduBrowser();
		 this.dockerService = new DockerService();
		 this.chromeOptions.addArguments(
			'--disable-dev-shm-usage',
			'--window-size=1440,1080',
			'--use-fake-ui-for-media-stream',
			'--use-fake-device-for-media-stream'
		);
		this.chromeCapabilities.setAcceptInsecureCerts(true);
	}

	async createStreamManager(browserMode: BrowserMode, properties: TestProperties): Promise<string> {

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

	private async createStreamManagerFromRealBrowser(properties: TestProperties): Promise<string>{

		const portBinding = this.BROWSER_CONTAINER_HOSTPORT + this.containerMap.size;
		process.env['SELENIUM_REMOTE_URL'] = 'http://localhost:' + portBinding + '/wd/hub';

		try {
			const containerName = 'container_' + properties.sessionName + '_' + new Date().getTime();
			const containerId = await this.dockerService.startBrowserContainer(containerName, portBinding);
			this.containerMap.set(containerId, portBinding);

			if(!!properties.recording) {
				console.log("Starting browser recording");
				await this.dockerService.startBrowserRecording(containerId, containerName);
				await this.launchBrowser(containerId, properties);
				return containerId;
			}else {
				await this.launchBrowser(containerId,properties);
				return containerId;
			}

		} catch (error) {
			console.error(error);
			return Promise.reject(new Error(error));
		}

	}

	private async launchBrowser(containerId: string, properties: TestProperties, timeout: number = 1000): Promise<void> {

		setTimeout(async () => {
			try {
				const url = `https://${process.env.LOCATION_HOSTNAME}/` +
							`?publicurl=${process.env.OPENVIDU_URL}` +
							`&secret=${process.env.OPENVIDU_SECRET}` +
							`&sessionId=${properties.sessionName}` +
							`&userId=${properties.userId}` +
							`&resolution=${properties.resolution || '640x480'}` +
							`&videoElements=${properties.videoElements}`;

				console.log(url);

				let driver = await new Builder()
							.forBrowser('chrome')
							.withCapabilities(this.chromeCapabilities)
							.setChromeOptions(this.chromeOptions)
							.build();

				await driver.get(url);
				console.log("Browser works as expected");

			} catch(error){
				console.log(error);
				await this.dockerService.stopContainer(containerId);
				this.containerMap.delete(containerId);
				return Promise.reject(new Error(error));
			} finally {
				// await driver.quit();

				setTimeout(() => {
					this.dockerService.stopContainer(containerId);
				}, 10000);
			}
		}, timeout);
	}

}