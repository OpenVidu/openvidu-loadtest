import { Builder, By, Capabilities, until, WebDriver } from 'selenium-webdriver';
import chrome = require('selenium-webdriver/chrome');
import { TestProperties } from '../types/api-rest.type';
import { ErrorGenerator } from '../utils/error-generator';
import { DockerService } from './docker.service';

export class RealBrowserService {

	private readonly BROWSER_CONTAINER_HOSTPORT = 4000;
	private chromeOptions = new chrome.Options();
	private chromeCapabilities = Capabilities.chrome();
	private containerMap: Map<string, number> = new Map();

	constructor(
		private dockerService: DockerService = new DockerService(),
		private errorGenerator: ErrorGenerator = new ErrorGenerator(),
	) {

		this.chromeOptions.addArguments(
			'--disable-dev-shm-usage',
			'--window-size=1440,1080',
			'--use-fake-ui-for-media-stream',
			'--use-fake-device-for-media-stream'
		);
		this.chromeCapabilities.setAcceptInsecureCerts(true);
	}

	public async createStreamManager(properties: TestProperties): Promise<string> {
		const portBinding = this.BROWSER_CONTAINER_HOSTPORT + this.containerMap.size;
		// Set the SELENIUM_REMOTE_URL to the ip where the selenium webdriver will be deployed
		process.env['SELENIUM_REMOTE_URL'] = 'http://localhost:' + portBinding + '/wd/hub';
		const webappUrl = `https://${process.env.LOCATION_HOSTNAME}/` +
						`?publicurl=${process.env.OPENVIDU_URL}` +
						`&secret=${process.env.OPENVIDU_SECRET}` +
						`&sessionId=${properties.sessionName}` +
						`&userId=${properties.userId}` +
						`&resolution=${properties.resolution || '640x480'}` +
						`&showVideoElements=${properties.showVideoElements}`;

		console.log(webappUrl);
		try {
			const containerName = 'container_' + properties.sessionName + '_' + new Date().getTime();
			const containerId = await this.dockerService.startBrowserContainer(containerName, portBinding);
			this.containerMap.set(containerId, portBinding);

			if(!!properties.recording) {
				console.log("Starting browser recording");
				await this.dockerService.startBrowserRecording(containerId, containerName);
				await this.launchBrowser(containerId, webappUrl);
				return containerId;
			}else {
				await this.launchBrowser(containerId, webappUrl);
				return containerId;
			}

		} catch (error) {
			console.error(error);
			return Promise.reject(new Error(error));
		}
	}

	private async launchBrowser(containerId: string, webappUrl: string, timeout: number = 1000): Promise<void> {
		return new Promise((resolve, reject) => {
			setTimeout(async () => {
				try {

					let chrome = await this.startChrome();
					await chrome.get(webappUrl);

					// Wait until publisher has been created and published regardless of whether the videos are shown or not
					await chrome.wait(until.elementsLocated(By.id('local-stream-created')), 10000);
					console.log("Browser works as expected");
					resolve();

				} catch(error){
					console.log(error);
					reject(this.errorGenerator.generateError(error));
					await this.dockerService.stopContainer(containerId);
					this.containerMap.delete(containerId);
				} finally {
					// await driver.quit();

					setTimeout(() => {
						this.dockerService.stopContainer(containerId);
					}, 10000);
				}
			}, timeout);
		});
	}

	private async startChrome(): Promise<WebDriver> {
		return await new Builder()
						.forBrowser('chrome')
						.withCapabilities(this.chromeCapabilities)
						.setChromeOptions(this.chromeOptions)
						.build();
	}

}