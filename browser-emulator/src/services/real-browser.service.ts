import fs = require('fs');
import { Builder, By, Capabilities, until, WebDriver } from 'selenium-webdriver';
import chrome = require('selenium-webdriver/chrome');
import { LoadTestPostRequest, TestProperties } from '../types/api-rest.type';
import { BrowserContainerInfo } from '../types/container-info.type';
import { OpenViduRole } from '../types/openvidu.type';
import { ErrorGenerator } from '../utils/error-generator';
import { DockerService } from './docker.service';
import { ContainerCreateOptions } from 'dockerode';
import { Storage } from './local-storage.service';
declare var localStorage: Storage;
export class RealBrowserService {

	private readonly BROWSER_CONTAINER_HOSTPORT = 4000;
	private chromeOptions = new chrome.Options();
	private chromeCapabilities = Capabilities.chrome();
	private containerMap: Map<string, BrowserContainerInfo> = new Map();
	private readonly CHROME_BROWSER_IMAGE = "elastestbrowsers/chrome";
	private readonly RECORDINGS_PATH = '/home/ubuntu/recordings';
	private readonly MEDIA_FILES_PATH = '/home/ubuntu/mediafiles';
	private readonly VIDEO_FILE_LOCATION = '/home/ubuntu/mediafiles/fakevideo.y4m';
	private readonly AUDIO_FILE_LOCATION = '/home/ubuntu/mediafiles/fakeaudio.wav';

	constructor(
		private dockerService: DockerService = new DockerService(),
		private errorGenerator: ErrorGenerator = new ErrorGenerator(),
	) {

		this.chromeOptions.addArguments(
			'--disable-dev-shm-usage',
			'--window-size=1440,1080',
			'--use-fake-ui-for-media-stream',
			'--use-fake-device-for-media-stream',
			'--allow-file-access-from-files',
			`--use-file-for-fake-video-capture=${this.VIDEO_FILE_LOCATION}`,
			`--use-file-for-fake-audio-capture=${this.AUDIO_FILE_LOCATION}`
		);
		this.chromeCapabilities.setAcceptInsecureCerts(true);
	}

	public async startBrowserContainer(properties: TestProperties): Promise<string> {

		if(this.existMediaFiles()) {
			let containerId: string;
			const isRecording = !!properties.recording && !properties.headless;

			if(!!properties.headless) {
				this.chromeOptions.addArguments('--headless');
			}

			const bindedPort = this.BROWSER_CONTAINER_HOSTPORT + this.containerMap.size;
			this.setSeleniumRemoteURL(bindedPort);
			try {
				const containerName = 'container_' + properties.sessionName + '_' + new Date().getTime();
				const options: ContainerCreateOptions = this.getChromeContainerOptions(containerName, bindedPort);
				containerId = await this.dockerService.startContainer(options);
				this.containerMap.set(containerId, {connectionRole: properties.role, bindedPort, isRecording});
				await this.enableMediaFileAccess(containerId);
				if(isRecording) {
					console.log("Starting browser recording");
					await this.startRecordingInContainer(containerId, containerName);
				}
				return containerId;
			} catch (error) {
				console.error(error);
				await this.stopBrowserContainer(containerId, isRecording);
				this.containerMap.delete(containerId);
				return Promise.reject(new Error(error));
			} finally {
				//TODO: Just for development, remove it
				// setTimeout(async () => {
				// 	await this.stopBrowserContainer(containerId, isRecording);
				// }, 20000);
			}
		} else {
			return Promise.reject({message:"Media files not found. fakevideo.y4m and fakeaudio.wav don't exist"});
		}
	}

	private async stopBrowserContainer(containerId: string, isRecording: boolean): Promise<void> {
		try {
			if(isRecording) {
				await this.stopRecordingInContainer(containerId);
			}
			await this.dockerService.stopContainer(containerId);
		} catch (error) {
			Promise.reject(error);
		}
	}

	async deleteStreamManagerWithConnectionId(containerId: string): Promise<void> {
		console.log("Removing and stopping container ", containerId);
		const isRecording = this.containerMap.get(containerId)?.isRecording;
		await this.stopBrowserContainer(containerId, isRecording);
		this.containerMap.delete(containerId);
	}

	deleteStreamManagerWithRole(role: any): Promise<void> {
		return new Promise(async (resolve,reject) => {
			const containersToDelete: {containerId:string, isRecording: boolean}[] = [];
			const promisesToResolve: Promise<void>[] = [];
			this.containerMap.forEach((info: BrowserContainerInfo, containerId: string) => {
				if(info.connectionRole === role) {
					containersToDelete.push({containerId, isRecording: info.isRecording});
				}
			});

			containersToDelete.forEach( async (value: {containerId:string, isRecording: boolean}) => {
				promisesToResolve.push(this.stopBrowserContainer(value.containerId, value.isRecording));
				this.containerMap.delete(value.containerId);
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
					await chrome.wait(until.elementsLocated(By.id('local-connection-created')), 30000);
					if(request.properties.role === OpenViduRole.PUBLISHER){
						// Wait until publisher has been published regardless of whether the videos are shown or not
						await chrome.wait(until.elementsLocated(By.id('local-stream-created')), 30000);
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

	private async enableMediaFileAccess(containerId: string) {
		const command = `sudo chmod 777 ${this.MEDIA_FILES_PATH}`;
		await this.dockerService.runCommandInContainer(containerId, command);
	}

	private getChromeContainerOptions(containerName: string, hostPort: number): ContainerCreateOptions {
		const options: ContainerCreateOptions = {
			Image: this.CHROME_BROWSER_IMAGE,
			name: containerName,
			ExposedPorts: {
				"4444/tcp": {},
			},
			HostConfig:  {
				Binds: [
					`${process.env.PWD}/recordings:${this.RECORDINGS_PATH}`,
					`${process.env.PWD}/src/assets/mediafiles:${this.MEDIA_FILES_PATH}`,
				],
				PortBindings: { "4444/tcp": [{ "HostPort": hostPort.toString(), "HostIp": "0.0.0.0" }] },
				CapAdd: [
					'SYS_ADMIN'
				]
			}
		};
		return options;
	}

	private async startRecordingInContainer(containerId: string, videoName: string): Promise<void> {
		const startRecordingCommand = "start-video-recording.sh -n " + videoName;
		await this.dockerService.runCommandInContainer(containerId, startRecordingCommand);
	}

	private async stopRecordingInContainer(containerId: string): Promise<void> {
		const stopRecordingCommand = 'stop-video-recording.sh';
		await this.dockerService.runCommandInContainer(containerId, stopRecordingCommand);
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
			`frameRate=${properties.frameRate}`;
	}

	private existMediaFiles(): boolean {
		const videoFile = `${process.env.PWD}/src/assets/mediafiles/fakevideo.y4m`;
		const audioFile = `${process.env.PWD}/src/assets/mediafiles/fakeaudio.wav`;
		try {
			return fs.existsSync(videoFile) && fs.existsSync(audioFile);
		} catch (error) {
			return false;
		}

	}

}