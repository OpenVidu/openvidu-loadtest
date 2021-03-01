import { Builder, By, Capabilities, until, WebDriver } from 'selenium-webdriver';
import chrome = require('selenium-webdriver/chrome');
import { LoadTestPostRequest, TestProperties } from '../types/api-rest.type';
import { BrowserContainerInfo } from '../types/container-info.type';
import { OpenViduRole } from '../types/openvidu.type';
import { ErrorGenerator } from '../utils/error-generator';
import { DockerService } from './docker.service';

export class RealBrowserService {

	private readonly BROWSER_CONTAINER_HOSTPORT = 4000;
	private chromeOptions = new chrome.Options();
	private chromeCapabilities = Capabilities.chrome();
	private containerMap: Map<string, BrowserContainerInfo> = new Map();

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

	public async startBrowserContainer(properties: TestProperties): Promise<string> {

		let containerId: string;
		if(!!properties.headless) {
			this.chromeOptions.addArguments('--headless');
		}

		const bindedPort = this.BROWSER_CONTAINER_HOSTPORT + this.containerMap.size;
		this.setSeleniumRemoteURL(bindedPort);
		try {
			const containerName = 'container_' + properties.sessionName + '_' + new Date().getTime();
			containerId = await this.dockerService.startBrowserContainer(containerName, bindedPort);
			this.containerMap.set(containerId, {connectionRole: properties.role, bindedPort});

			if(!!properties.recording && !properties.headless) {
				console.log("Starting browser recording");
				await this.dockerService.startRecordingInContainer(containerId, containerName);
			}
			return containerId;
		} catch (error) {
			console.error(error);
			if(!!properties.recording && !properties.headless) {
				await this.dockerService.stopRecordingInContainer(containerId);
			}
			await this.dockerService.stopContainer(containerId);
			this.containerMap.delete(containerId);
			return Promise.reject(new Error(error));
		} finally {
			//TODO: Just for development, remove it
			// setTimeout(async () => {
			// 	if(!!properties.recording && !properties.headless) {
			// 		await this.dockerService.stopRecordingInContainer(containerId);
			// 	}
			// 	await this.dockerService.stopContainer(containerId);
			// }, 10000);
		}
	}

	async deleteStreamManagerWithConnectionId(containerId: string): Promise<void> {
		console.log("Removing and stopping container ", containerId);
		await this.dockerService.stopContainer(containerId);
		this.containerMap.delete(containerId);
	}

	deleteStreamManagerWithRole(role: any): Promise<void> {
		return new Promise(async (resolve, reject) => {
			const containersToDelete: string[] = [];
			const promisesToResolve: Promise<void>[] = [];
			this.containerMap.forEach((info: BrowserContainerInfo, containerId: string) => {
				if(info.connectionRole === role) {
					containersToDelete.push(containerId);
				}
			});

			containersToDelete.forEach( (containerId: string) => {
				promisesToResolve.push(this.dockerService.stopContainer(containerId));
				this.containerMap.delete(containerId);
			});

			try {
				await Promise.all(promisesToResolve);
				resolve();
			} catch (error) {
				reject(error);
			}
		});
	}

	async launchBrowser(request: LoadTestPostRequest, storageName?: string, storageValue?: string, timeout: number = 1000): Promise<void> {
		return new Promise((resolve, reject) => {
			setTimeout(async () => {
				try {
					const webappUrl = this.generateWebappUrl(request.token, request.properties);
					console.log(webappUrl);

					let chrome = await this.getChromeDriver();
					await chrome.get(webappUrl);

					if(!!storageName && !!storageValue) {
						// Add webrtc stats config to LocalStorage
						await chrome.executeScript(() => {
							localStorage.setItem(arguments[0], arguments[1]);
						},  storageName, storageValue);
					}

					// Wait until connection has been created
					await chrome.wait(until.elementsLocated(By.id('local-connection-created')), 10000);
					if(request.properties.role === OpenViduRole.PUBLISHER){
						// Wait until publisher has been published regardless of whether the videos are shown or not
						await chrome.wait(until.elementsLocated(By.id('local-stream-created')), 10000);
					}
					console.log("Browser works as expected");
					resolve();

				} catch(error){
					console.log(error);
					reject(this.errorGenerator.generateError(error));
				}
			}, timeout);
		});
	}

	private async getChromeDriver(): Promise<WebDriver> {
		return await new Builder()
						.forBrowser('chrome')
						.withCapabilities(this.chromeCapabilities)
						.setChromeOptions(this.chromeOptions)
						.build();
	}

	private setSeleniumRemoteURL(bindedPort: number): void {
		// Set the SELENIUM_REMOTE_URL to the ip where the selenium webdriver will be deployed
		process.env['SELENIUM_REMOTE_URL'] = 'http://localhost:' + bindedPort + '/wd/hub';
	}

	private generateWebappUrl(token: string, properties: TestProperties): string {
		const publicUrl = !!process.env.OPENVIDU_URL ? `publicurl=${process.env.OPENVIDU_URL}&` : '';
		const secret = !!process.env.OPENVIDU_SECRET ? `secret=${process.env.OPENVIDU_SECRET}&` : '';
		const recordingMode = !!properties.recordingOutputMode ? `recordingmode=${properties.recordingOutputMode}&` : '';
		const tokenParam = !!token ? `token=${token}` : '';
		return `https://${process.env.LOCATION_HOSTNAME}/?` +
			publicUrl +
			secret +
			recordingMode +
			tokenParam +
			`role=${properties.role}&` +
			`sessionId=${properties.sessionName}&` +
			`userId=${properties.userId}&` +
			`audio=${properties.audio}&` +
			`video=${properties.video}&` +
			`resolution=${properties.resolution}&` +
			`showVideoElements=${properties.showVideoElements}&` +
			`frameRate=${properties.frameRate}&`;
	}

}